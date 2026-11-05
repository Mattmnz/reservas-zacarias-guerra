import { pedir } from '../api.js';
import { crearBloques } from '../bloques.js';
import { fechaNicaragua, formatearMonto } from '../formato.js';
import { exigirRol } from '../sesion.js';

const DIAS_ANTICIPACION = 30;

await exigirRol('CLIENTE');

// Los filtros viven en la URL: "atrás", recargar y volver del login retoman la misma consulta.
const parametros = new URLSearchParams(location.search);
const fecha = parametros.get('fecha') || fechaNicaragua();
const tipo = parametros.get('tipo') ?? '';

const campoFecha = document.querySelector('[name="fecha"]');
const campoTipo = document.querySelector('[name="tipo"]');
campoFecha.min = fechaNicaragua();
campoFecha.max = fechaNicaragua(DIAS_ANTICIPACION);
campoFecha.value = fecha;

function crearOpcion({ codigo, nombre }) {
  const opcion = document.createElement('option');
  opcion.value = codigo;
  opcion.textContent = nombre;
  return opcion;
}

function crearTarjeta(cancha, nombreTipo) {
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta';

  const titulo = document.createElement('h2');
  titulo.textContent = cancha.nombre;

  const detalle = document.createElement('p');
  detalle.textContent = `${nombreTipo} · ${formatearMonto(cancha.precioHora)} por hora`;

  tarjeta.append(titulo, detalle);
  if (cancha.bloques.length > 0) {
    tarjeta.append(crearBloques(cancha));
  } else {
    const sinBloques = document.createElement('p');
    sinBloques.textContent = 'Sin horarios libres en esta fecha.';
    tarjeta.append(sinBloques);
  }
  return tarjeta;
}

try {
  const [tipos, canchas] = await Promise.all([
    pedir('/tipos-cancha'),
    pedir(`/disponibilidad?${new URLSearchParams({ fecha, tipo })}`),
  ]);

  campoTipo.append(...tipos.map(crearOpcion));
  campoTipo.value = tipo;

  const nombresTipo = new Map(tipos.map((t) => [t.codigo, t.nombre]));
  document
    .querySelector('[data-canchas]')
    .append(...canchas.map((c) => crearTarjeta(c, nombresTipo.get(c.tipoCodigo))));
  document.querySelector('[data-vacio]').hidden = canchas.length > 0;
} catch (error) {
  const aviso = document.querySelector('[data-error]');
  aviso.textContent = error.mensaje;
  aviso.hidden = false;
} finally {
  document.querySelector('[data-cargando]').hidden = true;
}
