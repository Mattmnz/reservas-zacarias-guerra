import { pedir } from '../api.js';
import { formatearFecha, formatearHora, formatearMonto } from '../formato.js';
import { leerIdPositivo } from '../parametros.js';
import { exigirRol } from '../sesion.js';

const ESTADOS = {
  PAGADA: 'Pagada',
  CONFIRMADA: 'Confirmada',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
  NO_SHOW: 'No se presentó',
};
const TIPOS_PAGO = { CARGO: 'Cargo', REEMBOLSO: 'Reembolso' };

await exigirRol('CLIENTE');

const id = leerIdPositivo(new URLSearchParams(location.search).get('id'));

function mostrarError(mensaje) {
  const aviso = document.querySelector('[data-error]');
  aviso.textContent = mensaje;
  aviso.hidden = false;
}

function crearFilaPago({ tipo, monto, referencia }) {
  const fila = document.createElement('tr');
  for (const texto of [TIPOS_PAGO[tipo], formatearMonto(monto), referencia]) {
    const celda = document.createElement('td');
    celda.textContent = texto;
    fila.append(celda);
  }
  return fila;
}

function mostrarReserva(reserva, nombreTipo) {
  document.querySelector('[data-cancha]').textContent = reserva.canchaNombre;
  document.querySelector('[data-tipo]').textContent = nombreTipo;
  document.querySelector('[data-fecha]').textContent = formatearFecha(reserva.inicio);
  document.querySelector('[data-hora]').textContent = formatearHora(reserva.inicio);
  document.querySelector('[data-monto]').textContent = formatearMonto(reserva.monto);

  const estado = document.querySelector('[data-estado]');
  estado.textContent = ESTADOS[reserva.estado];
  estado.classList.add(`etiqueta--${reserva.estado.toLowerCase().replace('_', '-')}`);

  // Esta página se puede recargar más tarde: el éxito solo vale si la reserva sigue recién pagada.
  document.querySelector('[data-exito]').hidden = reserva.estado !== 'PAGADA';
  document.querySelector('[data-pagos]').append(...reserva.pagos.map(crearFilaPago));
  document.querySelector('[data-detalle]').hidden = false;
}

if (id === null) {
  mostrarError('El enlace de la reserva no es válido.');
} else {
  try {
    const [tipos, reserva] = await Promise.all([pedir('/tipos-cancha'), pedir(`/reservas/${id}`)]);
    mostrarReserva(reserva, tipos.find((t) => t.codigo === reserva.tipoCodigo)?.nombre);
  } catch (error) {
    mostrarError(error.mensaje);
  }
}
document.querySelector('[data-cargando]').hidden = true;
