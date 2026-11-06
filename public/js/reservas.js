import { formatearMonto } from './formato.js';

export const ESTADOS = {
  PAGADA: 'Pagada',
  CONFIRMADA: 'Confirmada',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
  NO_SHOW: 'No se presentó',
};
const TIPOS_PAGO = { CARGO: 'Cargo', REEMBOLSO: 'Reembolso' };
const ESTADOS_CANCELABLES = ['PAGADA', 'CONFIRMADA'];

const MS_MINUTO = 60 * 1000;
// Ventana de asistencia (#17): desde 15 min antes del inicio hasta que el barrido la marcaría (1 h).
const ASISTENCIA_ANTES_MIN = 15;
const ASISTENCIA_DESPUES_MIN = 60;

// Suma minutos a una fecha de la API y la devuelve en el mismo formato, para compararla como texto.
function desplazar(texto, minutos) {
  return new Date(Date.parse(`${texto}Z`) + minutos * MS_MINUTO).toISOString().slice(0, 19);
}

// Una reserva ya empezada sigue PAGADA hasta el barrido (1 h), pero la API ya no la cancela.
// Es solo para no ofrecer el botón: la API decide y responde TRANSICION_INVALIDA si el reloj difiere.
export function esCancelable({ estado, inicio }, ahora) {
  return ESTADOS_CANCELABLES.includes(estado) && inicio > ahora;
}

// Los tres predicados son solo para ofrecer el botón: la regla la aplica la API, que responde
// TRANSICION_INVALIDA si el reloj del navegador difiere del servidor.
export function puedeConfirmar({ estado, inicio }, ahora) {
  return estado === 'PAGADA' && inicio > ahora;
}

export function puedeRegistrarAsistencia({ estado, inicio }, ahora) {
  return (
    ESTADOS_CANCELABLES.includes(estado) &&
    desplazar(inicio, -ASISTENCIA_ANTES_MIN) <= ahora &&
    ahora < desplazar(inicio, ASISTENCIA_DESPUES_MIN)
  );
}

// Solo van los filtros con valor, como en consultaUsuarios.
export function consultaReservas({ desde, hasta, canchaId, estado }) {
  const consulta = new URLSearchParams();
  if (desde) consulta.set('desde', desde);
  if (hasta) consulta.set('hasta', hasta);
  if (canchaId) consulta.set('canchaId', String(canchaId));
  if (estado) consulta.set('estado', estado);
  return consulta.toString();
}

export function claseEstado(estado) {
  return `etiqueta--${estado.toLowerCase().replace('_', '-')}`;
}

// Lee el pago registrado por la API: un no-show no tiene reembolso.
export function reembolsoDe({ pagos }) {
  return pagos.find((pago) => pago.tipo === 'REEMBOLSO')?.monto ?? 0;
}

export function crearFilaPago({ tipo, monto, referencia }) {
  const fila = document.createElement('tr');
  for (const texto of [TIPOS_PAGO[tipo], formatearMonto(monto), referencia]) {
    const celda = document.createElement('td');
    celda.textContent = texto;
    fila.append(celda);
  }
  return fila;
}

export function crearTablaPagos(pagos) {
  const encabezado = document.createElement('tr');
  for (const texto of ['Tipo', 'Monto', 'Referencia']) {
    const celda = document.createElement('th');
    celda.scope = 'col';
    celda.textContent = texto;
    encabezado.append(celda);
  }
  const cabecera = document.createElement('thead');
  cabecera.append(encabezado);

  const cuerpo = document.createElement('tbody');
  cuerpo.append(...pagos.map(crearFilaPago));

  const tabla = document.createElement('table');
  tabla.className = 'tabla';
  tabla.append(cabecera, cuerpo);

  const envoltorio = document.createElement('div');
  envoltorio.className = 'tabla-envoltorio';
  envoltorio.append(tabla);
  return envoltorio;
}
