import { pedir } from '../api.js';
import { fechaHoraNicaragua, formatearFecha, formatearHora, formatearMonto } from '../formato.js';
import { ESTADOS, claseEstado, crearTablaPagos, esCancelable, reembolsoDe } from '../reservas.js';
import { exigirRol } from '../sesion.js';

const TEXTO_CANCELAR = 'Cancelar';

await exigirRol('CLIENTE');

const aviso = document.querySelector('[data-error]');
const resultado = document.querySelector('[data-resultado]');
const carga = document.querySelector('[data-cargando]');
const vacio = document.querySelector('[data-vacio]');
const lista = document.querySelector('[data-reservas]');
const dialogo = document.querySelector('[data-dialogo]');
const campoMotivo = document.querySelector('[data-dialogo-motivo]');

// La reserva del diálogo abierto: hay un solo diálogo para toda la lista.
let seleccion = null;

// El aviso está arriba de la lista: en el celular, la tarjeta puede quedar lejos.
function mostrarAviso(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.hidden = false;
  elemento.scrollIntoView({ block: 'center' });
}

function crearParrafo(etiqueta, valor) {
  const parrafo = document.createElement('p');
  const fuerte = document.createElement('strong');
  fuerte.textContent = valor;
  parrafo.append(`${etiqueta}: `, fuerte);
  return parrafo;
}

function crearEstado(estado) {
  const parrafo = document.createElement('p');
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta ${claseEstado(estado)}`;
  etiqueta.textContent = ESTADOS[estado];
  parrafo.append('Estado: ', etiqueta);
  return parrafo;
}

function crearBotonCancelar(reserva) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton boton--peligro titulo-seccion';
  boton.textContent = TEXTO_CANCELAR;
  boton.setAttribute(
    'aria-label',
    `Cancelar la reserva de ${reserva.canchaNombre}, ${formatearFecha(reserva.inicio)}, ${formatearHora(reserva.inicio)}`,
  );
  boton.addEventListener('click', () => abrirCancelacion(reserva, boton));
  return boton;
}

function crearTarjeta(reserva, ahora) {
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta';

  const titulo = document.createElement('h2');
  titulo.textContent = reserva.canchaNombre;

  const fecha = document.createElement('p');
  fecha.textContent = formatearFecha(reserva.inicio);

  tarjeta.append(
    titulo,
    fecha,
    crearParrafo('Hora de inicio', formatearHora(reserva.inicio)),
    crearParrafo('Total', formatearMonto(reserva.monto)),
    crearEstado(reserva.estado),
  );
  if (reserva.montoPenalizado !== null) {
    tarjeta.append(
      crearParrafo('Monto penalizado', formatearMonto(reserva.montoPenalizado)),
      crearParrafo('Reembolso', formatearMonto(reembolsoDe(reserva))),
    );
  }

  const tituloPagos = document.createElement('h3');
  tituloPagos.textContent = 'Pagos';
  tarjeta.append(tituloPagos, crearTablaPagos(reserva.pagos));

  if (esCancelable(reserva, ahora)) tarjeta.append(crearBotonCancelar(reserva));
  return tarjeta;
}

async function cargar() {
  carga.hidden = false;
  try {
    const reservas = await pedir('/reservas/mias');
    const ahora = fechaHoraNicaragua();
    lista.replaceChildren(...reservas.map((reserva) => crearTarjeta(reserva, ahora)));
    vacio.hidden = reservas.length > 0;
  } catch (error) {
    mostrarAviso(aviso, error.mensaje);
  } finally {
    carga.hidden = true;
  }
}

// TRANSICION_INVALIDA: la lista quedó vieja (ya empezó, se barrió o se canceló en otra pestaña).
async function mostrarFallo(error) {
  mostrarAviso(aviso, error.mensaje);
  if (error.codigo === 'TRANSICION_INVALIDA') await cargar();
}

function mostrarDialogo(reserva, vistaPrevia) {
  document.querySelector('[data-dialogo-detalle]').textContent =
    `${reserva.canchaNombre}, ${formatearFecha(reserva.inicio)}, ${formatearHora(reserva.inicio)}.`;
  document.querySelector('[data-dialogo-porcentaje]').textContent = `${vistaPrevia.porcentajePenalizacion} %`;
  document.querySelector('[data-dialogo-penalizacion]').textContent = formatearMonto(vistaPrevia.montoPenalizado);
  document.querySelector('[data-dialogo-reembolso]').textContent = formatearMonto(vistaPrevia.reembolso);
  campoMotivo.value = '';
  // Esc no cambia returnValue: sin limpiarlo, repetiría la confirmación de un intento anterior.
  dialogo.returnValue = '';
  dialogo.showModal();
}

async function abrirCancelacion(reserva, boton) {
  aviso.hidden = true;
  resultado.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Consultando…';
  let vistaPrevia;
  let fallo;
  try {
    vistaPrevia = await pedir(`/reservas/${reserva.id}/cancelacion`);
  } catch (error) {
    fallo = error;
  }
  boton.disabled = false;
  boton.textContent = TEXTO_CANCELAR;

  if (fallo) {
    await mostrarFallo(fallo);
    return;
  }
  seleccion = { reserva, boton };
  // Un botón deshabilitado pierde el foco, y el diálogo lo devuelve al cerrarse a quien lo tenía.
  boton.focus();
  mostrarDialogo(reserva, vistaPrevia);
}

async function cancelar() {
  const { reserva, boton } = seleccion;
  const motivo = campoMotivo.value.trim();
  boton.disabled = true;
  boton.textContent = 'Cancelando…';
  try {
    const cancelada = await pedir(`/reservas/${reserva.id}/cancelar`, {
      metodo: 'POST',
      cuerpo: motivo ? { motivo } : undefined,
    });
    // Los montos del POST son los definitivos: el tiempo pudo cambiar la regla desde la vista previa.
    mostrarAviso(
      resultado,
      `Reserva #${cancelada.id} cancelada. Monto penalizado: ${formatearMonto(cancelada.montoPenalizado)}. ` +
        `Reembolso: ${formatearMonto(reembolsoDe(cancelada))}.`,
    );
    await cargar();
  } catch (error) {
    boton.disabled = false;
    boton.textContent = TEXTO_CANCELAR;
    await mostrarFallo(error);
  }
}

dialogo.addEventListener('close', () => {
  if (dialogo.returnValue === 'confirmar') cancelar();
});

await cargar();
