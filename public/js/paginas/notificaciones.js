import { obtenerNotificaciones, pedir } from '../api.js';
import { formatearFecha, formatearHora } from '../formato.js';
import { exigirRol, mostrarNoLeidas } from '../sesion.js';

const TEXTO_MARCAR = 'Marcar como leída';

await exigirRol('CLIENTE');

const aviso = document.querySelector('[data-error]');
const lista = document.querySelector('[data-notificaciones]');

// El aviso está arriba de la lista: en el celular, la tarjeta puede quedar lejos.
function mostrarError(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
  aviso.scrollIntoView({ block: 'center' });
}

async function marcarLeida(id, tarjeta, marca, boton) {
  aviso.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Marcando…';
  try {
    await pedir(`/notificaciones/${id}/leida`, { metodo: 'PATCH' });
  } catch (error) {
    boton.disabled = false;
    boton.textContent = TEXTO_MARCAR;
    boton.focus();
    mostrarError(error.mensaje);
    return;
  }

  const botones = [...lista.querySelectorAll('[data-marcar]')];
  const siguiente = botones[botones.indexOf(boton) + 1];
  tarjeta.classList.remove('tarjeta--no-leida');
  marca.remove();
  boton.remove();
  mostrarNoLeidas(botones.length - 1);
  // El botón ya no existe: sin esto, el foco del teclado vuelve al inicio del documento.
  (siguiente ?? document.querySelector('[data-titulo]')).focus();
}

function crearTarjeta({ id, mensaje, leida, creadaEn }) {
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta';

  const texto = document.createElement('p');
  texto.textContent = mensaje;

  const fecha = document.createElement('p');
  fecha.className = 'campo__ayuda';
  fecha.textContent = `${formatearFecha(creadaEn)}, ${formatearHora(creadaEn)}`;

  tarjeta.append(texto, fecha);
  if (leida) return tarjeta;

  tarjeta.classList.add('tarjeta--no-leida');

  const etiqueta = document.createElement('span');
  etiqueta.className = 'etiqueta etiqueta--no-leida';
  etiqueta.textContent = 'Sin leer';
  const marca = document.createElement('p');
  marca.append(etiqueta);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton boton--secundario';
  boton.dataset.marcar = '';
  boton.textContent = TEXTO_MARCAR;
  boton.setAttribute('aria-label', `Marcar como leída: ${mensaje}`);
  boton.addEventListener('click', () => marcarLeida(id, tarjeta, marca, boton));

  tarjeta.append(marca, boton);
  return tarjeta;
}

try {
  const notificaciones = await obtenerNotificaciones();
  lista.append(...notificaciones.map(crearTarjeta));
  document.querySelector('[data-vacio]').hidden = notificaciones.length > 0;
} catch (error) {
  mostrarError(error.mensaje);
} finally {
  document.querySelector('[data-cargando]').hidden = true;
}
