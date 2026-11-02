const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const { ahoraNicaragua, parsearFechaLocal, formatearFechaLocal, diaSemana } = require('../../shared/tiempo');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('../horarios/horarios.service');
const reservasService = require('../reservas/reservas.service');

const MS_HORA = 3600 * 1000;
const MS_DIA = 24 * MS_HORA;
const DIAS_ANTICIPACION = 30;
// La misma ventana que la creación de reservas: 0 < inicio − ahora ≤ 30 días exactos.
// Así la disponibilidad nunca ofrece un bloque que la creación rechaza.
const MAX_ANTICIPACION_MS = DIAS_ANTICIPACION * MS_DIA;
const TIPO_MAX = 10;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function validacion(mensaje) {
  return new AppError(400, 'VALIDACION', mensaje);
}

// Entrada del query string: llega como texto, o como arreglo si el parámetro se repite.
function fechaValida(texto) {
  if (typeof texto !== 'string' || !FORMATO_FECHA.test(texto)) {
    throw validacion('fecha: se espera YYYY-MM-DD');
  }
  try {
    return parsearFechaLocal(`${texto}T00:00:00`, 'fecha');
  } catch {
    // Con el formato ya validado, solo falla una fecha que no existe (2026-02-30, mes 13);
    // el mensaje de parsearFechaLocal hablaría de un formato con hora que aquí no se pide.
    throw validacion('fecha: no es una fecha del calendario');
  }
}

function tipoValido(tipo) {
  if (tipo === undefined || tipo === '') return null;
  if (typeof tipo !== 'string' || tipo.length > TIPO_MAX) {
    throw validacion(`tipo: debe ser un código de hasta ${TIPO_MAX} caracteres`);
  }
  return tipo;
}

function inicioDelDia(fecha) {
  const dia = new Date(fecha.getTime());
  dia.setUTCHours(0, 0, 0, 0);
  return dia;
}

function claveOcupado(canchaId, inicio) {
  return `${canchaId}|${inicio.getTime()}`;
}

// Bloques de apertura a cierre − 1, sin los ocupados ni los que la creación rechazaría.
function bloquesLibres(dia, canchaId, { apertura, cierre }, ocupados, ahora) {
  const bloques = [];
  for (let hora = apertura; hora < cierre; hora++) {
    const inicio = new Date(dia.getTime() + hora * MS_HORA);
    const anticipacion = inicio.getTime() - ahora.getTime();
    if (anticipacion <= 0 || anticipacion > MAX_ANTICIPACION_MS) continue;
    if (ocupados.has(claveOcupado(canchaId, inicio))) continue;
    bloques.push(formatearFechaLocal(inicio));
  }
  return bloques;
}

async function consultar({ fecha, tipo } = {}) {
  const dia = fechaValida(fecha);
  const tipoCodigo = tipoValido(tipo);

  const ahora = ahoraNicaragua();
  const hoy = inicioDelDia(ahora);
  if (dia < hoy || dia.getTime() - hoy.getTime() > DIAS_ANTICIPACION * MS_DIA) {
    throw validacion(`fecha: debe estar entre hoy y dentro de ${DIAS_ANTICIPACION} días`);
  }

  const pool = await db.obtenerPool();
  // Antes de leer: deja en NO_SHOW lo vencido, para que el resto del sistema vea estados al día.
  await reservasService.barrerNoShow(pool);

  // Tres consultas, sin importar cuántas canchas haya (sin N+1). Son independientes:
  // en paralelo cuestan una ida y vuelta a la base en lugar de tres.
  const [canchas, horarios, ocupadas] = await Promise.all([
    canchasService.listarActivas(pool, tipoCodigo),
    horariosService.listarDelDia(pool, diaSemana(dia)),
    reservasService.ocupadosEnRango(pool, dia, new Date(dia.getTime() + MS_DIA)),
  ]);

  // Horarios trae todas las canchas, activas o no: el cruce con las activas se hace aquí.
  const horarioPorCancha = new Map(horarios.map((h) => [h.canchaId, h]));
  const ocupados = new Set(ocupadas.map((r) => claveOcupado(r.canchaId, r.inicio)));

  // Una cancha sin horario ese día está cerrada y no aparece; una con horario aparece
  // aunque no le quede ningún bloque libre.
  return canchas
    .filter((c) => horarioPorCancha.has(c.id))
    .map((c) => ({
      canchaId: c.id,
      nombre: c.nombre,
      tipoCodigo: c.tipoCodigo,
      precioHora: c.precioHora,
      bloques: bloquesLibres(dia, c.id, horarioPorCancha.get(c.id), ocupados, ahora),
    }));
}

module.exports = { consultar };
