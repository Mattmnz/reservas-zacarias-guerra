import { formatearMonto } from './formato.js';

export const ESTADOS = {
  PAGADA: 'Pagada',
  CONFIRMADA: 'Confirmada',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
  NO_SHOW: 'No se presentó',
};
const TIPOS_PAGO = { CARGO: 'Cargo', REEMBOLSO: 'Reembolso' };

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
