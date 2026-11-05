import { pedir } from '../api.js';
import { crearBloques } from '../bloques.js';
import { formatearFecha, formatearHora, formatearMonto } from '../formato.js';
import { leerIdPositivo, leerInicio } from '../parametros.js';
import { exigirRol } from '../sesion.js';

await exigirRol('CLIENTE');

const parametros = new URLSearchParams(location.search);
const canchaId = leerIdPositivo(parametros.get('canchaId'));
const inicio = leerInicio(parametros.get('inicio'));

const aviso = document.querySelector('[data-error]');
const carga = document.querySelector('[data-cargando]');
const detalle = document.querySelector('[data-detalle]');
const alternativas = document.querySelector('[data-alternativas]');
const botonReservar = document.querySelector('[data-reservar]');
const dialogo = document.querySelector('[data-dialogo]');

function mostrarError(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
}

function mostrarDetalle(cancha, nombreTipo) {
  const monto = formatearMonto(cancha.precioHora);
  document.querySelector('[data-cancha]').textContent = cancha.nombre;
  document.querySelector('[data-tipo]').textContent = nombreTipo;
  document.querySelector('[data-fecha]').textContent = formatearFecha(inicio);
  document.querySelector('[data-hora]').textContent = formatearHora(inicio);
  document.querySelector('[data-monto]').textContent = monto;
  document.querySelector('[data-dialogo-detalle]').textContent =
    `${cancha.nombre}, ${formatearFecha(inicio)}, ${formatearHora(inicio)}. ` +
    `Se registrará un pago simulado de ${monto}.`;
  detalle.hidden = false;
}

// CU-01 A1: bloques libres de la misma cancha; volver al catálogo es desistir.
function mostrarAlternativas(cancha) {
  const hayBloques = cancha.bloques.length > 0;
  document.querySelector('[data-alternativas-titulo]').textContent = hayBloques
    ? `Otros horarios libres en ${cancha.nombre}`
    : '';
  document.querySelector('[data-alternativas-lista]').replaceChildren(crearBloques(cancha));
  document.querySelector('[data-alternativas-vacio]').hidden = hayBloques;
  alternativas.hidden = false;
}

async function cargar() {
  detalle.hidden = true;
  carga.hidden = false;
  try {
    const fecha = inicio.slice(0, 10);
    const [tipos, canchas] = await Promise.all([
      pedir('/tipos-cancha'),
      pedir(`/disponibilidad?${new URLSearchParams({ fecha })}`),
    ]);
    const cancha = canchas.find((c) => c.canchaId === canchaId);
    if (!cancha) {
      mostrarError('Esa cancha no se puede reservar en esa fecha.');
    } else if (cancha.bloques.includes(inicio)) {
      mostrarDetalle(cancha, tipos.find((t) => t.codigo === cancha.tipoCodigo)?.nombre);
    } else {
      mostrarAlternativas(cancha);
    }
  } catch (error) {
    mostrarError(error.mensaje);
  } finally {
    carga.hidden = true;
  }
}

async function reservar() {
  aviso.hidden = true;
  botonReservar.disabled = true;
  botonReservar.textContent = 'Reservando…';
  try {
    const reserva = await pedir('/reservas', { metodo: 'POST', cuerpo: { canchaId, inicio } });
    // replace: "atrás" no debe volver a un bloque que ya quedó tomado.
    location.replace(`/cliente/confirmacion.html?id=${reserva.id}`);
  } catch (error) {
    botonReservar.disabled = false;
    botonReservar.textContent = 'Reservar';
    if (error.codigo === 'HORARIO_OCUPADO') await cargar();
    else mostrarError(error.mensaje);
  }
}

botonReservar.addEventListener('click', () => {
  // Esc no cambia returnValue: sin limpiarlo, repetiría la confirmación de un intento anterior.
  dialogo.returnValue = '';
  dialogo.showModal();
});

dialogo.addEventListener('close', () => {
  if (dialogo.returnValue === 'confirmar') reservar();
});

if (canchaId === null || inicio === null) {
  carga.hidden = true;
  mostrarError('El enlace de la reserva no es válido. Elija un horario en el catálogo.');
} else {
  document.querySelector('[data-volver]').href = `/cliente/catalogo.html?fecha=${inicio.slice(0, 10)}`;
  await cargar();
}
