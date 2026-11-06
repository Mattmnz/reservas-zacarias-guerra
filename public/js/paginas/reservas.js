import { pedir } from '../api.js';
import { fechaHoraNicaragua, fechaNicaragua, formatearFecha, formatearHora, formatearMonto } from '../formato.js';
import { leerFecha, leerIdPositivo, leerOpcion } from '../parametros.js';
import {
  ESTADOS,
  claseEstado,
  consultaReservas,
  crearTablaPagos,
  esCancelable,
  puedeConfirmar,
  puedeRegistrarAsistencia,
  reembolsoDe,
} from '../reservas.js';
import { exigirRol } from '../sesion.js';

// Textos de las acciones sin montos. El 'boton' es también el texto de la tarjeta.
const ACCIONES = {
  CONFIRMAR: {
    ruta: 'confirmar',
    titulo: 'Confirmar la reserva',
    consecuencia: 'La reserva pasa a Confirmada y se notifica al cliente.',
    boton: 'Confirmar',
    exito: (id) => `Reserva #${id} confirmada.`,
  },
  ASISTENCIA: {
    ruta: 'asistencia',
    titulo: 'Registrar la asistencia',
    consecuencia: 'La reserva pasa a Completada y se notifica al cliente.',
    boton: 'Registrar asistencia',
    exito: (id) => `Asistencia registrada en la reserva #${id}.`,
  },
};
const TEXTO_CANCELAR = 'Cancelar';

await exigirRol('ADMIN');

// Los filtros viven en la URL: "atrás", recargar y volver del login retoman la misma consulta.
// Sin query, la agenda arranca en hoy. Con el formulario enviado, «desde» vacío pide todas.
const parametros = new URLSearchParams(location.search);
const filtros = {
  desde: location.search === '' ? fechaNicaragua() : (leerFecha(parametros.get('desde')) ?? ''),
  hasta: leerFecha(parametros.get('hasta')) ?? '',
  canchaId: leerIdPositivo(parametros.get('canchaId')),
  estado: leerOpcion(parametros.get('estado'), Object.keys(ESTADOS)) ?? '',
};

const aviso = document.querySelector('[data-error]');
const resultado = document.querySelector('[data-resultado]');
const titulo = document.querySelector('[data-titulo]');
const carga = document.querySelector('[data-cargando]');
const total = document.querySelector('[data-total]');
const vacio = document.querySelector('[data-vacio]');
const lista = document.querySelector('[data-reservas]');
const formulario = document.querySelector('[data-filtros]');
const selectCanchas = document.querySelector('[data-canchas]');
const dialogoAccion = document.querySelector('[data-dialogo-accion]');
const botonAccion = document.querySelector('[data-accion-confirmar]');
const dialogoCancelar = document.querySelector('[data-dialogo-cancelar]');
const campoMotivo = document.querySelector('[data-cancelar-motivo]');

formulario.elements.desde.value = filtros.desde;
formulario.elements.hasta.value = filtros.hasta;
formulario.elements.estado.append(
  ...Object.entries(ESTADOS).map(([valor, texto]) => crearOpcion(valor, texto)),
);
formulario.elements.estado.value = filtros.estado;

// Lo que está abierto en cada diálogo: hay uno de cada tipo para toda la lista.
let seleccion = null;

function crearOpcion(valor, texto) {
  const opcion = document.createElement('option');
  opcion.value = valor;
  opcion.textContent = texto;
  return opcion;
}

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

function describir(reserva) {
  return `#${reserva.id}, ${reserva.clienteNombre}, ${reserva.canchaNombre}, ${formatearFecha(reserva.inicio)}, ${formatearHora(reserva.inicio)}`;
}

function crearBoton(texto, clase, reserva, alHacerClic) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = `boton ${clase}`;
  boton.textContent = texto;
  boton.setAttribute('aria-label', `${texto}: reserva ${describir(reserva)}`);
  boton.addEventListener('click', () => alHacerClic(boton));
  return boton;
}

function crearAcciones(reserva, ahora) {
  const botones = [];
  if (puedeRegistrarAsistencia(reserva, ahora)) {
    botones.push(crearBoton(ACCIONES.ASISTENCIA.boton, '', reserva, (b) => abrirAccion(reserva, 'ASISTENCIA', b)));
  }
  if (puedeConfirmar(reserva, ahora)) {
    botones.push(
      crearBoton(ACCIONES.CONFIRMAR.boton, 'boton--secundario', reserva, (b) => abrirAccion(reserva, 'CONFIRMAR', b)),
    );
  }
  if (esCancelable(reserva, ahora)) {
    botones.push(crearBoton(TEXTO_CANCELAR, 'boton--peligro', reserva, (b) => abrirCancelacion(reserva, b)));
  }
  if (botones.length === 0) return null;
  const acciones = document.createElement('div');
  acciones.className = 'bloques titulo-seccion';
  acciones.append(...botones);
  return acciones;
}

function crearTarjeta(reserva, ahora) {
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta';

  const encabezado = document.createElement('h2');
  encabezado.textContent = `${reserva.canchaNombre} · ${formatearHora(reserva.inicio)}`;

  const fecha = document.createElement('p');
  fecha.textContent = formatearFecha(reserva.inicio);

  tarjeta.append(
    encabezado,
    fecha,
    crearParrafo('Cliente', reserva.clienteNombre),
    crearParrafo('Reserva', `#${reserva.id}`),
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

  const acciones = crearAcciones(reserva, ahora);
  if (acciones) tarjeta.append(acciones);
  return tarjeta;
}

async function cargarCanchas() {
  try {
    const canchas = await pedir('/canchas?incluirInactivas=true');
    selectCanchas.append(
      ...canchas.map((c) => crearOpcion(String(c.id), c.activa ? c.nombre : `${c.nombre} (inactiva)`)),
    );
    selectCanchas.value = filtros.canchaId ? String(filtros.canchaId) : '';
  } catch {
    // Sin la lista, el filtro de cancha queda en "Todas": las reservas se consultan igual.
  }
}

async function cargar() {
  carga.hidden = false;
  total.hidden = true;
  try {
    const reservas = await pedir(`/reservas?${consultaReservas(filtros)}`);
    const ahora = fechaHoraNicaragua();
    lista.replaceChildren(...reservas.map((reserva) => crearTarjeta(reserva, ahora)));
    vacio.hidden = reservas.length > 0;
    total.textContent = reservas.length === 1 ? '1 reserva.' : `${reservas.length} reservas.`;
    total.hidden = reservas.length === 0;
  } catch (error) {
    mostrarAviso(aviso, error.mensaje);
  } finally {
    carga.hidden = true;
  }
}

// TRANSICION_INVALIDA o NO_ENCONTRADO: la lista quedó vieja (se barrió, empezó o cambió en otra pestaña).
async function mostrarFallo(error) {
  mostrarAviso(aviso, error.mensaje);
  if (error.codigo === 'TRANSICION_INVALIDA' || error.codigo === 'NO_ENCONTRADO') await cargar();
}

function ocultarAvisos() {
  aviso.hidden = true;
  resultado.hidden = true;
}

// Confirmar y registrar asistencia

function abrirAccion(reserva, clave, boton) {
  const accion = ACCIONES[clave];
  seleccion = { reserva, accion, boton };
  document.querySelector('[data-accion-titulo]').textContent = accion.titulo;
  document.querySelector('[data-accion-detalle]').textContent = `Reserva ${describir(reserva)}.`;
  document.querySelector('[data-accion-consecuencia]').textContent = accion.consecuencia;
  botonAccion.textContent = accion.boton;
  // Esc no cambia returnValue: sin limpiarlo, repetiría la confirmación de un intento anterior.
  dialogoAccion.returnValue = '';
  dialogoAccion.showModal();
}

async function aplicarAccion({ reserva, accion, boton }) {
  ocultarAvisos();
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    await pedir(`/reservas/${reserva.id}/${accion.ruta}`, { metodo: 'PATCH' });
    // Se recarga porque la reserva puede salir del filtro de estado.
    await cargar();
    resultado.textContent = accion.exito(reserva.id);
    resultado.hidden = false;
    titulo.focus();
  } catch (error) {
    boton.disabled = false;
    boton.textContent = accion.boton;
    await mostrarFallo(error);
  }
}

dialogoAccion.addEventListener('close', () => {
  if (dialogoAccion.returnValue === 'confirmar') aplicarAccion(seleccion);
});

// Cancelar, con la vista previa de montos de la API (#18)

async function abrirCancelacion(reserva, boton) {
  ocultarAvisos();
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
  document.querySelector('[data-cancelar-detalle]').textContent = `Reserva ${describir(reserva)}.`;
  document.querySelector('[data-cancelar-porcentaje]').textContent = `${vistaPrevia.porcentajePenalizacion} %`;
  document.querySelector('[data-cancelar-penalizacion]').textContent = formatearMonto(vistaPrevia.montoPenalizado);
  document.querySelector('[data-cancelar-reembolso]').textContent = formatearMonto(vistaPrevia.reembolso);
  campoMotivo.value = '';
  dialogoCancelar.returnValue = '';
  dialogoCancelar.showModal();
}

async function cancelar({ reserva, boton }) {
  const motivo = campoMotivo.value.trim();
  boton.disabled = true;
  boton.textContent = 'Cancelando…';
  try {
    const cancelada = await pedir(`/reservas/${reserva.id}/cancelar`, {
      metodo: 'POST',
      cuerpo: motivo ? { motivo } : undefined,
    });
    await cargar();
    // Los montos del POST son los definitivos: el tiempo pudo cambiar la regla desde la vista previa.
    resultado.textContent =
      `Reserva #${cancelada.id} cancelada. Monto penalizado: ${formatearMonto(cancelada.montoPenalizado)}. ` +
      `Reembolso: ${formatearMonto(reembolsoDe(cancelada))}.`;
    resultado.hidden = false;
    titulo.focus();
  } catch (error) {
    boton.disabled = false;
    boton.textContent = TEXTO_CANCELAR;
    await mostrarFallo(error);
  }
}

dialogoCancelar.addEventListener('close', () => {
  if (dialogoCancelar.returnValue === 'confirmar') cancelar(seleccion);
});

// La API rechaza fechas invertidas con un mensaje técnico: se avisa antes, sin consultar.
formulario.addEventListener('submit', (evento) => {
  const { desde, hasta } = formulario.elements;
  if (desde.value && hasta.value && desde.value > hasta.value) {
    evento.preventDefault();
    mostrarAviso(aviso, 'La fecha «Desde» no puede ser posterior a «Hasta».');
  }
});

await Promise.all([cargarCanchas(), cargar()]);
