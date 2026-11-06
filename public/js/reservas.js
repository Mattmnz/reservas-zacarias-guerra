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

// Una reserva ya empezada sigue PAGADA hasta el barrido (1 h), pero la API ya no la cancela.
// Es solo para no ofrecer el botón: la API decide y responde TRANSICION_INVALIDA si el reloj difiere.
export function esCancelable({ estado, inicio }, ahora) {
  return ESTADOS_CANCELABLES.includes(estado) && inicio > ahora;
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
