// Prueba de concurrencia de creación de reservas (RNF09).
// Lanza 10 POST /api/reservas simultáneos sobre el mismo bloque y exige exactamente
// 1 respuesta 201 y 9 respuestas 409 HORARIO_OCUPADO; luego verifica en la base que
// solo quedó lo de la reserva ganadora y borra todo lo creado en ese bloque.
//
// Uso: node scripts/concurrencia-reservas.js [--rondas N]
// Requiere la base local migrada y con seed (cliente1 y cliente2). Levanta su propio servidor.
// No lleva nombre *.test.js a propósito: node --test (y la CI) no deben ejecutarla sin base.
const env = require('../src/config/env');

const SERVIDORES_LOCALES = ['localhost', '127.0.0.1'];

// Antes de cargar nada más: la prueba borra filas y solo puede correr contra una base local.
function exigirBaseLocal() {
  const servidor = env.db.servidor.toLowerCase();
  if (!SERVIDORES_LOCALES.includes(servidor)) {
    console.error(
      `Prueba cancelada: DB_SERVER es "${env.db.servidor}". ` +
        `Solo se ejecuta contra una base local (${SERVIDORES_LOCALES.join(' o ')}).`,
    );
    process.exit(1);
  }
}

exigirBaseLocal();

const { sql, obtenerPool, enTransaccion, cerrarPool } = require('../src/config/db');
const { ahoraNicaragua, formatearFechaLocal, diaSemana } = require('../src/shared/tiempo');
const { ESTADOS, TIPOS_PAGO } = require('../src/shared/constantes');

const SOLICITUDES = 10;
const RONDAS_POR_DEFECTO = 3;
const RONDAS_MAX = 20;
const DIA_MS = 24 * 3600 * 1000;
// Se busca desde el día 29 hacia atrás para alejarse de los datos de demo; el día 30 podría
// pasarse del límite de 30 días exactos según la hora actual.
const DIAS_ADELANTE = 29;
const CLIENTES = [
  { correo: 'cliente1@prueba.local', password: 'Cliente123!' },
  { correo: 'cliente2@prueba.local', password: 'Cliente123!' },
];

function leerRondas(argv) {
  const i = argv.indexOf('--rondas');
  if (i === -1) return RONDAS_POR_DEFECTO;
  const valor = argv[i + 1];
  if (!/^\d+$/.test(valor ?? '') || Number(valor) < 1 || Number(valor) > RONDAS_MAX) {
    throw new Error(`--rondas debe ser un entero entre 1 y ${RONDAS_MAX}`);
  }
  return Number(valor);
}

function levantarServidor() {
  const app = require('../src/app');
  return new Promise((resolve, reject) => {
    const servidor = app.listen(0, '127.0.0.1', () => {
      resolve({ servidor, base: `http://127.0.0.1:${servidor.address().port}/api` });
    });
    servidor.on('error', reject);
  });
}

function cerrarServidor(servidor) {
  // fetch deja conexiones keep-alive abiertas: sin cortarlas, close() no termina nunca.
  servidor.closeAllConnections();
  return new Promise((resolve) => servidor.close(() => resolve()));
}

async function leerCuerpo(respuesta) {
  const texto = await respuesta.text();
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

async function iniciarSesion(base, correo, password) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, password }),
  });
  const cuerpo = await leerCuerpo(respuesta);
  if (respuesta.status !== 200) {
    throw new Error(
      `No se pudo iniciar sesión con ${correo} (HTTP ${respuesta.status}). ¿Se ejecutó npm run db:seed?`,
    );
  }
  return cuerpo.data.token;
}

// Primer bloque sin ninguna reserva (en ningún estado), para que la limpieza
// solo pueda borrar lo que crea esta prueba.
async function elegirBloque(pool, descartados) {
  const horarios = await pool.request().query(`
    SELECT h.CanchaId, h.DiaSemana,
           DATEPART(HOUR, h.HoraApertura) AS Apertura, DATEPART(HOUR, h.HoraCierre) AS Cierre
    FROM Horario h
    JOIN Cancha c ON c.Id = h.CanchaId
    WHERE c.Activa = 1
    ORDER BY h.CanchaId
  `);

  const ahora = ahoraNicaragua();
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  const desde = new Date(hoy + DIA_MS);
  const hasta = new Date(hoy + (DIAS_ADELANTE + 1) * DIA_MS);

  const usados = await pool
    .request()
    .input('desde', sql.DateTime2(0), desde)
    .input('hasta', sql.DateTime2(0), hasta)
    .query('SELECT DISTINCT CanchaId, Inicio FROM Reserva WHERE Inicio >= @desde AND Inicio < @hasta');
  const ocupados = new Set(descartados);
  for (const f of usados.recordset) ocupados.add(`${f.CanchaId}|${formatearFechaLocal(f.Inicio)}`);

  for (let d = DIAS_ADELANTE; d >= 1; d--) {
    const dia = new Date(hoy + d * DIA_MS);
    const delDia = horarios.recordset.filter((h) => h.DiaSemana === diaSemana(dia));
    for (const h of delDia) {
      for (let hora = h.Apertura; hora < h.Cierre; hora++) {
        const inicio = new Date(dia.getTime() + hora * 3600 * 1000);
        const clave = `${h.CanchaId}|${formatearFechaLocal(inicio)}`;
        if (!ocupados.has(clave)) return { canchaId: h.CanchaId, inicio, clave };
      }
    }
  }
  throw new Error('No hay ningún bloque libre en los próximos 29 días para ejecutar la prueba');
}

async function lanzarSimultaneos(base, tokens, bloque, n = SOLICITUDES) {
  const cuerpo = JSON.stringify({ canchaId: bloque.canchaId, inicio: formatearFechaLocal(bloque.inicio) });
  const solicitudes = Array.from({ length: n }, (_, i) =>
    fetch(`${base}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[i % tokens.length]}` },
      body: cuerpo,
    }).then(async (respuesta) => {
      const json = await leerCuerpo(respuesta);
      return { status: respuesta.status, codigo: json?.error?.codigo ?? null, id: json?.data?.id ?? null };
    }),
  );
  return Promise.all(solicitudes);
}

function verificarRespuestas(respuestas) {
  const errores = [];
  const creadas = respuestas.filter((r) => r.status === 201);
  const ocupadas = respuestas.filter((r) => r.status === 409 && r.codigo === 'HORARIO_OCUPADO');
  const otras = respuestas.filter((r) => !creadas.includes(r) && !ocupadas.includes(r));

  if (creadas.length !== 1) errores.push(`se esperaba 1 respuesta 201 y hubo ${creadas.length}`);
  if (ocupadas.length !== respuestas.length - 1) {
    errores.push(`se esperaban ${respuestas.length - 1} respuestas 409 HORARIO_OCUPADO y hubo ${ocupadas.length}`);
  }
  for (const r of otras) errores.push(`respuesta inesperada: ${r.status} ${r.codigo ?? ''}`.trim());
  return errores;
}

const RESERVAS_DEL_BLOQUE = 'SELECT Id FROM Reserva WHERE CanchaId = @canchaId AND Inicio = @inicio';

function consultarBloque(ejecutor, bloque) {
  return ejecutor
    .request()
    .input('canchaId', sql.Int, bloque.canchaId)
    .input('inicio', sql.DateTime2(0), bloque.inicio);
}

// Las 9 transacciones perdedoras tuvieron que deshacerse enteras: no puede quedar
// ninguna fila suya en Reserva, Pago, Auditoria ni Notificacion.
async function verificarBase(pool, bloque, idCreado) {
  const r = await consultarBloque(pool, bloque).query(`
    SELECT Id, Estado, Activa FROM Reserva WHERE CanchaId = @canchaId AND Inicio = @inicio;
    SELECT ReservaId, Tipo, Referencia FROM Pago WHERE ReservaId IN (${RESERVAS_DEL_BLOQUE});
    SELECT EntidadId, Accion FROM Auditoria WHERE Entidad = 'RESERVA' AND EntidadId IN (${RESERVAS_DEL_BLOQUE});
    SELECT ReservaId FROM Notificacion WHERE ReservaId IN (${RESERVAS_DEL_BLOQUE});
  `);
  const [reservas, pagos, auditorias, notificaciones] = r.recordsets;
  const errores = [];

  const activas = reservas.filter((f) => f.Activa);
  if (reservas.length !== 1 || activas.length !== 1) {
    errores.push(`base: se esperaba 1 reserva activa en el bloque y hay ${reservas.length} (${activas.length} activas)`);
  } else if (reservas[0].Id !== idCreado || reservas[0].Estado !== ESTADOS.PAGADA) {
    errores.push(`base: la reserva del bloque (#${reservas[0].Id}, ${reservas[0].Estado}) no es la del 201 (#${idCreado})`);
  }

  if (pagos.length !== 1) {
    errores.push(`base: se esperaba 1 pago y hay ${pagos.length}`);
  } else if (pagos[0].Tipo !== TIPOS_PAGO.CARGO || pagos[0].Referencia !== `SIM-C-${idCreado}`) {
    errores.push(`base: pago inesperado (${pagos[0].Tipo} ${pagos[0].Referencia})`);
  }

  if (auditorias.length !== 1) {
    errores.push(`base: se esperaba 1 auditoría y hay ${auditorias.length}`);
  } else if (auditorias[0].Accion !== 'CREAR' || auditorias[0].EntidadId !== idCreado) {
    errores.push(`base: auditoría inesperada (${auditorias[0].Accion} #${auditorias[0].EntidadId})`);
  }

  if (notificaciones.length !== 1) {
    errores.push(`base: se esperaba 1 notificación y hay ${notificaciones.length}`);
  } else if (notificaciones[0].ReservaId !== idCreado) {
    errores.push(`base: la notificación es de la reserva #${notificaciones[0].ReservaId}`);
  }

  return {
    errores,
    conteo: { reservas: reservas.length, pagos: pagos.length, auditorias: auditorias.length, notificaciones: notificaciones.length },
  };
}

// El bloque estaba vacío antes de la ronda: todo lo que tenga es de esta prueba.
async function limpiarBloque(bloque) {
  return enTransaccion(async (tx) => {
    const r = await consultarBloque(tx, bloque).query(`
      DELETE FROM Notificacion WHERE ReservaId IN (${RESERVAS_DEL_BLOQUE});
      DELETE FROM Pago WHERE ReservaId IN (${RESERVAS_DEL_BLOQUE});
      DELETE FROM Auditoria WHERE Entidad = 'RESERVA' AND EntidadId IN (${RESERVAS_DEL_BLOQUE});
      DELETE FROM Reserva WHERE CanchaId = @canchaId AND Inicio = @inicio;
    `);
    return r.rowsAffected.reduce((a, b) => a + b, 0);
  });
}

function contarEstados(respuestas) {
  const conteo = {};
  for (const r of respuestas) {
    const clave = r.codigo ? `${r.status} ${r.codigo}` : String(r.status);
    conteo[clave] = (conteo[clave] ?? 0) + 1;
  }
  return Object.entries(conteo)
    .map(([clave, n]) => `${n} × ${clave}`)
    .join(', ');
}

async function ejecutarRonda(pool, base, tokens, descartados) {
  let bloque = null;
  const errores = [];
  try {
    bloque = await elegirBloque(pool, descartados);
    descartados.add(bloque.clave);
    console.log(`  Bloque: cancha ${bloque.canchaId}, ${formatearFechaLocal(bloque.inicio)}`);

    const t0 = performance.now();
    const respuestas = await lanzarSimultaneos(base, tokens, bloque);
    const ms = Math.round(performance.now() - t0);
    const idCreado = respuestas.find((r) => r.status === 201)?.id ?? null;
    console.log(`  Respuestas (${ms} ms): ${contarEstados(respuestas)}`);
    errores.push(...verificarRespuestas(respuestas));

    const { errores: erroresBase, conteo } = await verificarBase(pool, bloque, idCreado);
    console.log(
      `  Base: ${conteo.reservas} reserva, ${conteo.pagos} pago, ` +
        `${conteo.auditorias} auditoría, ${conteo.notificaciones} notificación (reserva #${idCreado ?? '-'})`,
    );
    errores.push(...erroresBase);
  } catch (err) {
    errores.push(`error: ${err.message}`);
  } finally {
    // Se limpia aunque la verificación falle, para no dejar datos de prueba.
    if (bloque) {
      try {
        console.log(`  Limpieza: ${await limpiarBloque(bloque)} filas borradas`);
      } catch (err) {
        errores.push(`limpieza: ${err.message}`);
      }
    }
  }
  return errores;
}

async function main() {
  const rondas = leerRondas(process.argv.slice(2));
  const { servidor, base } = await levantarServidor();
  let fallidas = 0;
  try {
    const pool = await obtenerPool();
    const tokens = [];
    for (const c of CLIENTES) tokens.push(await iniciarSesion(base, c.correo, c.password));

    console.log(`Prueba de concurrencia: ${SOLICITUDES} POST /api/reservas simultáneos por ronda, ${rondas} ronda(s).`);
    const descartados = new Set();
    for (let i = 1; i <= rondas; i++) {
      console.log(`Ronda ${i}:`);
      const errores = await ejecutarRonda(pool, base, tokens, descartados);
      if (errores.length === 0) {
        console.log('  OK');
      } else {
        fallidas += 1;
        for (const e of errores) console.log(`  FALLO: ${e}`);
      }
    }
    console.log(fallidas === 0 ? `Resultado: OK (${rondas}/${rondas} rondas)` : `Resultado: FALLO (${fallidas}/${rondas} rondas con errores)`);
  } finally {
    await cerrarServidor(servidor);
    await cerrarPool();
  }
  if (fallidas > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Error en la prueba de concurrencia: ${err.message}`);
  process.exitCode = 1;
});
