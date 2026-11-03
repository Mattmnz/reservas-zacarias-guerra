// Mide el tiempo de respuesta de GET /api/disponibilidad para RNF04 (respuesta en menos de 3 s).
//
// Uso: node scripts/medir-disponibilidad.js [urlBase] [--rondas N]
//   urlBase   por defecto http://localhost:3000 (sin /api)
//   --rondas  de 1 a 50, por defecto 5; cada ronda hace 15 consultas (5 fechas × 3 tipos)
// Credenciales: variables de entorno MEDIR_CORREO y MEDIR_PASSWORD, de cualquier rol.
//
// Criterio: cumple si todas las consultas de la serie responden 200 y en menos de 3000 ms;
// el arranque (health) y el login no cuentan.
//
// Salida: 0 cumple · 1 no cumple · 2 no se pudo medir.
//
// Solo habla HTTP con la URL base: contra producción no hay variables de base de datos.
const { ahoraNicaragua, formatearFechaLocal } = require('../src/shared/tiempo');

const URL_POR_DEFECTO = 'http://localhost:3000';
const RONDAS_POR_DEFECTO = 5;
const RONDAS_MAX = 50;
const LIMITE_MS = 3000;
const CRITERIO =
  'todas las consultas de la serie responden 200 y en menos de 3000 ms; el arranque (health) y el login no cuentan';

// Render tarda cerca de un minuto en despertar y Azure SQL puede estar en pausa.
const ARRANQUE_TOTAL_MS = 3 * 60 * 1000;
const ARRANQUE_INTENTO_MS = 90 * 1000;
const ARRANQUE_ESPERA_MS = 5 * 1000;
const CONSULTA_TIMEOUT_MS = 30 * 1000;

const DIAS = [0, 1, 7, 15, 30];
const TIPOS = [null, 'SALA', 'CAMPO'];
const MS_DIA = 24 * 3600 * 1000;

const USO = 'Uso: node scripts/medir-disponibilidad.js [urlBase] [--rondas N]';

// Errores que impiden medir (salida 2), a diferencia de una medición que no cumple (salida 1).
class ErrorMedicion extends Error {}

function leerArgumentos(argv) {
  let urlTexto = null;
  let rondasTexto = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--rondas') {
      rondasTexto = argv[++i];
      if (rondasTexto === undefined) throw new ErrorMedicion('--rondas requiere un valor');
    } else if (arg.startsWith('--rondas=')) {
      rondasTexto = arg.slice('--rondas='.length);
    } else if (arg.startsWith('--')) {
      throw new ErrorMedicion(`argumento desconocido: ${arg}`);
    } else if (urlTexto === null) {
      urlTexto = arg;
    } else {
      throw new ErrorMedicion(`argumento de más: ${arg}`);
    }
  }

  let urlBase;
  try {
    urlBase = new URL(urlTexto ?? URL_POR_DEFECTO);
  } catch {
    throw new ErrorMedicion(`urlBase inválida: ${urlTexto}`);
  }
  if (urlBase.protocol !== 'http:' && urlBase.protocol !== 'https:') {
    throw new ErrorMedicion('urlBase: se espera http:// o https://');
  }

  let rondas = RONDAS_POR_DEFECTO;
  if (rondasTexto !== null) {
    rondas = Number(rondasTexto);
    if (!/^\d+$/.test(rondasTexto) || rondas < 1 || rondas > RONDAS_MAX) {
      throw new ErrorMedicion(`--rondas: se espera un entero de 1 a ${RONDAS_MAX}`);
    }
  }

  return { base: `${urlBase.origin}${urlBase.pathname}`.replace(/\/+$/, ''), rondas };
}

function leerCredenciales() {
  const correo = process.env.MEDIR_CORREO?.trim();
  const password = process.env.MEDIR_PASSWORD;
  const faltantes = [];
  if (!correo) faltantes.push('MEDIR_CORREO');
  if (!password) faltantes.push('MEDIR_PASSWORD');
  if (faltantes.length > 0) {
    throw new ErrorMedicion(`faltan variables de entorno: ${faltantes.join(', ')}`);
  }
  return { correo, password };
}

// Mide desde el envío hasta terminar de leer el cuerpo: es lo que espera el cliente.
async function cronometrar(url, opciones, timeoutMs) {
  const inicio = performance.now();
  try {
    const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(timeoutMs) });
    const texto = await respuesta.text();
    const ms = performance.now() - inicio;
    let cuerpo = null;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      // Un proxy o un servidor dormido puede responder HTML; el estado basta para informar.
    }
    return { ms, status: respuesta.status, cuerpo };
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? `sin respuesta en ${timeoutMs} ms` : err.cause?.code ?? err.message;
    return { ms: performance.now() - inicio, status: null, cuerpo: null, falla: motivo };
  }
}

function describirFalla({ status, cuerpo, falla }) {
  if (falla) return falla;
  const error = cuerpo?.error;
  return error ? `${status} ${error.codigo}: ${error.mensaje}` : `estado ${status}`;
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function despertar(base) {
  const inicio = performance.now();
  let intentos = 0;
  let ultimo;
  for (;;) {
    const restante = ARRANQUE_TOTAL_MS - (performance.now() - inicio);
    if (restante <= 0) break;
    intentos++;
    // AbortSignal.timeout exige un entero.
    ultimo = await cronometrar(`${base}/api/health`, {}, Math.ceil(Math.min(ARRANQUE_INTENTO_MS, restante)));
    if (ultimo.status === 200) return { ms: performance.now() - inicio, intentos };
    if (ARRANQUE_TOTAL_MS - (performance.now() - inicio) <= ARRANQUE_ESPERA_MS) break;
    await esperar(ARRANQUE_ESPERA_MS);
  }
  throw new ErrorMedicion(
    `el servidor no respondió 200 en /api/health tras ${intentos} intentos ` +
      `(${ARRANQUE_TOTAL_MS / 1000} s); último: ${describirFalla(ultimo)}`,
  );
}

async function iniciarSesion(base, { correo, password }) {
  const resultado = await cronometrar(
    `${base}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo, password }),
    },
    CONSULTA_TIMEOUT_MS,
  );
  const token = resultado.cuerpo?.data?.token;
  if (resultado.status !== 200 || typeof token !== 'string') {
    throw new ErrorMedicion(`login rechazado: ${describirFalla(resultado)}`);
  }
  return { token, ms: resultado.ms, rol: resultado.cuerpo.data.usuario?.rol };
}

// Hoy y los días siguientes en hora de Nicaragua, que es lo que valida el servidor.
function fechasAMedir() {
  const hoy = ahoraNicaragua();
  hoy.setUTCHours(0, 0, 0, 0);
  return DIAS.map((dias) => formatearFechaLocal(new Date(hoy.getTime() + dias * MS_DIA)).slice(0, 10));
}

async function medirSerie(base, token, rondas) {
  const fechas = fechasAMedir();
  const consultas = [];
  for (let ronda = 1; ronda <= rondas; ronda++) {
    for (const fecha of fechas) {
      for (const tipo of TIPOS) {
        const query = new URLSearchParams({ fecha });
        if (tipo) query.set('tipo', tipo);
        const resultado = await cronometrar(
          `${base}/api/disponibilidad?${query}`,
          { headers: { Authorization: `Bearer ${token}` } },
          CONSULTA_TIMEOUT_MS,
        );
        const valida = resultado.status === 200 && Array.isArray(resultado.cuerpo?.data);
        consultas.push({
          ronda,
          fecha,
          tipo: tipo ?? 'sin tipo',
          ms: resultado.ms,
          valida,
          falla: valida ? null : describirFalla(resultado),
        });
      }
    }
  }
  return { fechas, consultas };
}

// Percentil por rango más cercano: siempre es un tiempo realmente observado.
function percentil(ordenados, p) {
  return ordenados[Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1)];
}

function estadisticas(tiempos) {
  if (tiempos.length === 0) return null;
  const ordenados = [...tiempos].sort((a, b) => a - b);
  const suma = ordenados.reduce((total, ms) => total + ms, 0);
  return {
    n: ordenados.length,
    minimo: ordenados[0],
    promedio: suma / ordenados.length,
    mediana: percentil(ordenados, 50),
    p95: percentil(ordenados, 95),
    maximo: ordenados[ordenados.length - 1],
  };
}

const ms = (valor) => `${Math.round(valor)} ms`;

function informar({ base, rondas, momento, arranque, sesion, fechas, consultas }) {
  const total = consultas.length;
  const errores = consultas.filter((c) => !c.valida);
  const lentas = consultas.filter((c) => c.ms >= LIMITE_MS);
  const global = estadisticas(consultas.filter((c) => c.valida).map((c) => c.ms));
  const cumple = errores.length === 0 && lentas.length === 0;

  console.log('Medición de GET /api/disponibilidad (RNF04)');
  console.log(`  URL base: ${base}`);
  console.log(`  Momento:  ${momento} (hora de Nicaragua)`);
  console.log(`  Serie:    ${rondas} rondas × ${fechas.length} fechas × ${TIPOS.length} tipos = ${total} consultas`);
  console.log(`  Fechas:   ${fechas.join(', ')}`);
  console.log('');
  console.log('Fuera de la serie (no cuentan para el criterio)');
  console.log(`  Arranque (GET /api/health): ${ms(arranque.ms)} en ${arranque.intentos} intento(s)`);
  console.log(`  Login:                      ${ms(sesion.ms)}${sesion.rol ? ` (rol ${sesion.rol})` : ''}`);
  console.log('');

  console.log(`Serie: ${total - errores.length} válidas, ${errores.length} con error`);
  if (global) {
    console.log(
      `  mínimo ${ms(global.minimo)} · promedio ${ms(global.promedio)} · mediana ${ms(global.mediana)}` +
        ` · p95 ${ms(global.p95)} · máximo ${ms(global.maximo)}`,
    );
    const masLenta = consultas.filter((c) => c.valida).reduce((a, b) => (b.ms > a.ms ? b : a));
    console.log(`  Más lenta: ${ms(masLenta.ms)} (fecha ${masLenta.fecha}, ${masLenta.tipo}, ronda ${masLenta.ronda})`);
  }
  console.log('');

  console.log('Por tipo');
  for (const tipo of TIPOS.map((t) => t ?? 'sin tipo')) {
    const est = estadisticas(consultas.filter((c) => c.valida && c.tipo === tipo).map((c) => c.ms));
    const detalle = est ? `n ${est.n} · promedio ${ms(est.promedio)} · máximo ${ms(est.maximo)}` : 'sin consultas válidas';
    console.log(`  ${tipo.padEnd(8)} ${detalle}`);
  }

  if (errores.length > 0) {
    console.log('');
    console.log('Consultas con error');
    for (const c of errores.slice(0, 10)) {
      console.log(`  fecha ${c.fecha}, ${c.tipo}, ronda ${c.ronda}: ${c.falla}`);
    }
    if (errores.length > 10) console.log(`  ... y ${errores.length - 10} más`);
  }
  if (lentas.length > 0) {
    console.log('');
    console.log(`Consultas de ${LIMITE_MS} ms o más: ${lentas.length}`);
  }

  const resumen = global
    ? `${total} consultas, ${errores.length} con error, promedio ${ms(global.promedio)}, máximo ${ms(global.maximo)}`
    : `${total} consultas, todas con error`;
  console.log('');
  console.log(`RNF04 ${cumple ? 'CUMPLE' : 'NO CUMPLE'} (${CRITERIO}): ${resumen} — ${base}, ${momento}`);

  return cumple;
}

async function main() {
  const { base, rondas } = leerArgumentos(process.argv.slice(2));
  const credenciales = leerCredenciales();
  const momento = formatearFechaLocal(ahoraNicaragua()).slice(0, 16).replace('T', ' ');

  console.log(`Despertando ${base} (hasta ${ARRANQUE_TOTAL_MS / 1000} s)...`);
  const arranque = await despertar(base);
  const sesion = await iniciarSesion(base, credenciales);
  const { fechas, consultas } = await medirSerie(base, sesion.token, rondas);
  console.log('');

  const cumple = informar({ base, rondas, momento, arranque, sesion, fechas, consultas });
  process.exitCode = cumple ? 0 : 1;
}

main().catch((err) => {
  if (err instanceof ErrorMedicion) {
    console.error(`No se pudo medir: ${err.message}`);
    console.error(USO);
  } else {
    console.error(`Error inesperado: ${err.message}`);
  }
  process.exitCode = 2;
});
