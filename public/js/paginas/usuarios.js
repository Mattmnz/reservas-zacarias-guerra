import { pedir } from '../api.js';
import { formatearFecha } from '../formato.js';
import { leerOpcion } from '../parametros.js';
import { exigirRol } from '../sesion.js';
import { ROLES, cambiosDe, consultaUsuarios } from '../usuarios.js';

const yo = await exigirRol('ADMIN');

// Los filtros viven en la URL: "atrás", recargar y volver del login retoman la misma consulta.
const parametros = new URLSearchParams(location.search);
const rol = leerOpcion(parametros.get('rol'), Object.keys(ROLES)) ?? '';
const activo = leerOpcion(parametros.get('activo'), ['true', 'false']) ?? '';

const aviso = document.querySelector('[data-error]');
const resultado = document.querySelector('[data-resultado]');
const titulo = document.querySelector('[data-titulo]');
const carga = document.querySelector('[data-cargando]');
const vacio = document.querySelector('[data-vacio]');
const lista = document.querySelector('[data-usuarios]');
const dialogo = document.querySelector('[data-dialogo]');
const campoMotivo = document.querySelector('[data-dialogo-motivo]');
const botonConfirmar = document.querySelector('[data-dialogo-confirmar]');

document.querySelector('[name="rol"]').value = rol;
document.querySelector('[name="activo"]').value = activo;

// La acción del diálogo abierto: hay un solo diálogo para toda la lista.
let seleccion = null;

// El aviso está arriba de la lista: en el celular, la tarjeta puede quedar lejos.
function mostrarError(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
  aviso.scrollIntoView({ block: 'center' });
}

function crearParrafo(etiqueta, valor) {
  const parrafo = document.createElement('p');
  const fuerte = document.createElement('strong');
  fuerte.textContent = valor;
  parrafo.append(`${etiqueta}: `, fuerte);
  return parrafo;
}

function crearEstado(estaActivo) {
  const parrafo = document.createElement('p');
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta etiqueta--${estaActivo ? 'activo' : 'inactivo'}`;
  etiqueta.textContent = estaActivo ? 'Activo' : 'Inactivo';
  parrafo.append('Estado: ', etiqueta);
  return parrafo;
}

function abrirDialogo(usuario, cambio, boton) {
  seleccion = { usuario, cambio, boton };
  document.querySelector('[data-dialogo-titulo]').textContent = cambio.titulo;
  document.querySelector('[data-dialogo-detalle]').textContent = `${usuario.nombre} (${usuario.correo}).`;
  document.querySelector('[data-dialogo-consecuencia]').textContent = cambio.consecuencia;
  botonConfirmar.textContent = cambio.boton;
  botonConfirmar.className = cambio.peligro ? 'boton boton--peligro' : 'boton';
  campoMotivo.value = '';
  // Esc no cambia returnValue: sin limpiarlo, repetiría la confirmación de un intento anterior.
  dialogo.returnValue = '';
  dialogo.showModal();
}

// Los botones de la propia tarjeta quedan habilitados: el rechazo y su mensaje son de la API (#46).
function crearBoton(usuario, cambio) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = `boton ${cambio.peligro ? 'boton--peligro' : 'boton--secundario'}`;
  boton.textContent = cambio.boton;
  boton.setAttribute('aria-label', `${cambio.boton}: ${usuario.nombre}`);
  boton.addEventListener('click', () => abrirDialogo(usuario, cambio, boton));
  return boton;
}

function crearTarjeta(usuario) {
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta tarjeta--usuario';

  const nombre = document.createElement('h2');
  nombre.textContent = usuario.id === yo.id ? `${usuario.nombre} (usted)` : usuario.nombre;

  const correo = document.createElement('p');
  correo.textContent = usuario.correo;

  tarjeta.append(nombre, correo);
  if (usuario.telefono) tarjeta.append(crearParrafo('Teléfono', usuario.telefono));

  const acciones = document.createElement('div');
  acciones.className = 'bloques';
  acciones.append(...cambiosDe(usuario).map((cambio) => crearBoton(usuario, cambio)));

  tarjeta.append(
    crearParrafo('Rol', ROLES[usuario.rol]),
    crearEstado(usuario.activo),
    crearParrafo('Alta', formatearFecha(usuario.creadoEn)),
    acciones,
  );
  return tarjeta;
}

async function cargar() {
  carga.hidden = false;
  try {
    const usuarios = await pedir(`/usuarios?${consultaUsuarios({ rol, activo })}`);
    lista.replaceChildren(...usuarios.map(crearTarjeta));
    vacio.hidden = usuarios.length > 0;
  } catch (error) {
    mostrarError(error.mensaje);
  } finally {
    carga.hidden = true;
  }
}

async function aplicarCambio({ usuario, cambio, boton }) {
  aviso.hidden = true;
  resultado.hidden = true;
  const botones = [...boton.parentElement.children];
  for (const b of botones) b.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    await pedir(`/usuarios/${usuario.id}`, {
      metodo: 'PATCH',
      // Sin texto va undefined y no viaja: la API rechaza un motivo con solo espacios.
      cuerpo: { ...cambio.cuerpo, motivo: campoMotivo.value.trim() || undefined },
    });
  } catch (error) {
    for (const b of botones) b.disabled = false;
    boton.textContent = cambio.boton;
    boton.focus();
    mostrarError(error.mensaje);
    if (error.codigo === 'NO_ENCONTRADO') {
      await cargar();
      titulo.focus();
    }
    return;
  }

  resultado.textContent = cambio.exito;
  resultado.hidden = false;
  // Se recarga porque el usuario puede salir del filtro; la tarjeta se reemplaza y el foco va al título.
  await cargar();
  titulo.focus();
}

dialogo.addEventListener('close', () => {
  if (dialogo.returnValue === 'confirmar') aplicarCambio(seleccion);
});

await cargar();
