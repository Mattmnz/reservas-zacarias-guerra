import { pedir } from '../api.js';
import { bajaConReservas, reservasActivasDe, resultadoBaja } from '../canchas.js';
import { formatearMonto } from '../formato.js';
import { exigirRol } from '../sesion.js';

const TEXTO_CREAR = 'Crear cancha';
const TEXTO_EDITAR = 'Editar';

// Textos de la confirmación de cada acción. El motivo de la baja llega hasta 200 porque la
// auditoría le antepone la cantidad de reservas canceladas (#20); el del alta, hasta 250.
const ACCIONES = {
  BAJA: {
    titulo: 'Dar de baja la cancha',
    consecuencia: 'Deja de aparecer en el catálogo y no se puede reservar. Su horario se conserva.',
    boton: 'Dar de baja',
    peligro: true,
    motivoMax: 200,
  },
  ALTA: {
    titulo: 'Reactivar la cancha',
    consecuencia:
      'Vuelve al catálogo con el horario que tenía. Las reservas canceladas por la baja siguen canceladas.',
    boton: 'Reactivar',
    peligro: false,
    motivoMax: 250,
  },
};

await exigirRol('ADMIN');

const aviso = document.querySelector('[data-error]');
const resultado = document.querySelector('[data-resultado]');
const titulo = document.querySelector('[data-titulo]');
const carga = document.querySelector('[data-cargando]');
const vacio = document.querySelector('[data-vacio]');
const lista = document.querySelector('[data-canchas]');
const formularioNueva = document.querySelector('[data-nueva]');
const botonCrear = document.querySelector('[data-crear]');
const edicion = document.querySelector('[data-edicion]');
const formularioEdicion = document.querySelector('[data-edicion-formulario]');
const errorEdicion = document.querySelector('[data-edicion-error]');
const dialogo = document.querySelector('[data-dialogo]');
const campoMotivo = document.querySelector('[data-dialogo-motivo]');
const botonConfirmar = document.querySelector('[data-dialogo-confirmar]');

// Lo que está abierto en cada diálogo: hay uno de cada tipo para toda la lista.
let enEdicion = null;
let seleccion = null;

// El aviso está arriba de la lista: en el celular, la tarjeta puede quedar lejos.
function mostrarError(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
  aviso.scrollIntoView({ block: 'center' });
}

function ocultarAvisos() {
  aviso.hidden = true;
  resultado.hidden = true;
}

// La tarjeta se reemplaza al recargar: el foco va al título, que tiene el resultado debajo.
function mostrarResultado(mensaje) {
  resultado.textContent = mensaje;
  resultado.hidden = false;
  titulo.focus();
}

function crearOpcion(valor, texto) {
  const opcion = document.createElement('option');
  opcion.value = valor;
  opcion.textContent = texto;
  return opcion;
}

function llenarTipos(tipos) {
  for (const select of document.querySelectorAll('[data-tipos]')) {
    select.replaceChildren(
      crearOpcion('', 'Elija un tipo'),
      ...tipos.map(({ id, nombre, precioHora }) =>
        crearOpcion(String(id), `${nombre} (${formatearMonto(precioHora)} por hora)`),
      ),
    );
  }
}

function crearEstado(activa) {
  const parrafo = document.createElement('p');
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta etiqueta--${activa ? 'activo' : 'inactivo'}`;
  etiqueta.textContent = activa ? 'Activa' : 'Inactiva';
  parrafo.append('Estado: ', etiqueta);
  return parrafo;
}

function crearBoton(texto, clase, etiquetaAccesible, alHacerClic) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = `boton ${clase}`;
  boton.textContent = texto;
  boton.setAttribute('aria-label', etiquetaAccesible);
  boton.addEventListener('click', () => alHacerClic(boton));
  return boton;
}

function crearTarjeta(cancha) {
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta tarjeta--cancha';

  const nombre = document.createElement('h2');
  nombre.textContent = cancha.nombre;

  const tipo = document.createElement('p');
  tipo.textContent = `${cancha.tipoNombre} · ${formatearMonto(cancha.precioHora)} por hora`;

  tarjeta.append(nombre, tipo, crearEstado(cancha.activa));
  if (!cancha.activa) {
    const nota = document.createElement('p');
    nota.className = 'campo__ayuda';
    nota.textContent = 'No aparece en el catálogo. Su horario se conserva para cuando se reactive.';
    tarjeta.append(nota);
  }

  const horario = document.createElement('a');
  horario.className = 'boton boton--secundario';
  horario.href = `/admin/horario.html?canchaId=${cancha.id}`;
  horario.textContent = 'Horario';
  horario.setAttribute('aria-label', `Horario de ${cancha.nombre}`);

  const accion = cancha.activa ? 'BAJA' : 'ALTA';
  const textos = ACCIONES[accion];

  const acciones = document.createElement('div');
  acciones.className = 'bloques';
  acciones.append(
    crearBoton(TEXTO_EDITAR, 'boton--secundario', `Editar ${cancha.nombre}`, (boton) =>
      abrirEdicion(cancha, boton, cancha),
    ),
    horario,
    crearBoton(textos.boton, textos.peligro ? 'boton--peligro' : '', `${textos.boton}: ${cancha.nombre}`, (boton) =>
      abrirDialogo({ cancha, accion, boton, confirmar: false }, textos),
    ),
  );
  tarjeta.append(acciones);
  return tarjeta;
}

async function cargar() {
  carga.hidden = false;
  try {
    const canchas = await pedir('/canchas?incluirInactivas=true');
    lista.replaceChildren(...canchas.map(crearTarjeta));
    vacio.hidden = canchas.length > 0;
  } catch (error) {
    mostrarError(error.mensaje);
  } finally {
    carga.hidden = true;
  }
}

async function cargarTipos() {
  try {
    llenarTipos(await pedir('/tipos-cancha'));
  } catch (error) {
    // Sin tipos no se puede crear ni editar: la lista se muestra igual.
    botonCrear.disabled = true;
    mostrarError(error.mensaje);
  }
}

// Alta

formularioNueva.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  ocultarAvisos();
  const datos = new FormData(formularioNueva);
  const nombre = datos.get('nombre').trim();
  // required no rechaza solo espacios; la API sí, con un mensaje técnico.
  if (!nombre) {
    mostrarError('Escriba el nombre de la cancha.');
    return;
  }

  botonCrear.disabled = true;
  botonCrear.textContent = 'Creando…';
  try {
    const cancha = await pedir('/canchas', {
      metodo: 'POST',
      cuerpo: { nombre, tipoCanchaId: Number(datos.get('tipoCanchaId')) },
    });
    formularioNueva.reset();
    await cargar();
    mostrarResultado(`Se creó la cancha ${cancha.nombre}. Defina su horario para que aparezca en la disponibilidad.`);
  } catch (error) {
    mostrarError(error.mensaje);
  } finally {
    botonCrear.disabled = false;
    botonCrear.textContent = TEXTO_CREAR;
  }
});

// Edición

// `valores` y `error` vuelven a abrir el diálogo con lo escrito si la API lo rechaza (nombre repetido).
function abrirEdicion(cancha, boton, valores, error = null) {
  enEdicion = { cancha, boton };
  formularioEdicion.elements.nombre.value = valores.nombre;
  formularioEdicion.elements.tipoCanchaId.value = String(valores.tipoCanchaId);
  errorEdicion.textContent = error ?? '';
  errorEdicion.hidden = !error;
  // Esc no cambia returnValue: sin limpiarlo, repetiría el guardado de un intento anterior.
  edicion.returnValue = '';
  edicion.showModal();
}

async function guardarEdicion() {
  const { cancha, boton } = enEdicion;
  const valores = {
    nombre: formularioEdicion.elements.nombre.value.trim(),
    tipoCanchaId: Number(formularioEdicion.elements.tipoCanchaId.value),
  };
  ocultarAvisos();
  if (!valores.nombre) {
    abrirEdicion(cancha, boton, valores, 'Escriba el nombre de la cancha.');
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const editada = await pedir(`/canchas/${cancha.id}`, { metodo: 'PUT', cuerpo: valores });
    await cargar();
    mostrarResultado(`Se guardaron los cambios de ${editada.nombre}.`);
  } catch (error) {
    boton.disabled = false;
    boton.textContent = TEXTO_EDITAR;
    if (error.codigo === 'VALIDACION') {
      abrirEdicion(cancha, boton, valores, error.mensaje);
      return;
    }
    mostrarError(error.mensaje);
    if (error.codigo === 'NO_ENCONTRADO') await cargar();
  }
}

edicion.addEventListener('close', () => {
  if (edicion.returnValue === 'guardar') guardarEdicion();
});

// Baja y reactivación

function abrirDialogo(nueva, textos, motivo = '') {
  seleccion = nueva;
  document.querySelector('[data-dialogo-titulo]').textContent = textos.titulo;
  document.querySelector('[data-dialogo-detalle]').textContent = `${nueva.cancha.nombre}.`;
  document.querySelector('[data-dialogo-consecuencia]').textContent = textos.consecuencia;
  botonConfirmar.textContent = textos.boton;
  botonConfirmar.className = textos.peligro ? 'boton boton--peligro' : 'boton';
  campoMotivo.maxLength = textos.motivoMax;
  campoMotivo.value = motivo;
  dialogo.returnValue = '';
  dialogo.showModal();
}

async function darDeAlta(cancha, motivo) {
  await pedir(`/canchas/${cancha.id}/alta`, { metodo: 'PATCH', cuerpo: { motivo } });
  return `Se reactivó la cancha ${cancha.nombre}.`;
}

// Sin confirmar, la API responde CANCHA_CON_RESERVAS si hay reservas activas y deshace la baja.
async function darDeBaja(cancha, motivo, confirmar) {
  const cuerpo = confirmar ? { confirmar: true, motivo } : { motivo };
  return resultadoBaja(await pedir(`/canchas/${cancha.id}/baja`, { metodo: 'PATCH', cuerpo }));
}

async function aplicar({ cancha, accion, boton, confirmar }) {
  // Sin texto va undefined y no viaja: la API rechaza un motivo con solo espacios.
  const motivo = campoMotivo.value.trim() || undefined;
  ocultarAvisos();
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const mensaje = accion === 'ALTA' ? await darDeAlta(cancha, motivo) : await darDeBaja(cancha, motivo, confirmar);
    await cargar();
    mostrarResultado(mensaje);
  } catch (error) {
    boton.disabled = false;
    boton.textContent = ACCIONES[accion].boton;
    if (error.codigo === 'CANCHA_CON_RESERVAS') {
      // Segunda confirmación, con la cantidad que informó la API. El POST final informa las canceladas.
      boton.focus();
      abrirDialogo(
        { cancha, accion, boton, confirmar: true },
        { ...ACCIONES.BAJA, ...bajaConReservas(reservasActivasDe(error.mensaje)) },
        motivo,
      );
      return;
    }
    mostrarError(error.mensaje);
    // La lista quedó vieja: la cancha no existe o ya cambió de estado en otra pestaña.
    if (error.codigo === 'NO_ENCONTRADO' || error.codigo === 'TRANSICION_INVALIDA') await cargar();
  }
}

dialogo.addEventListener('close', () => {
  if (dialogo.returnValue === 'confirmar') aplicar(seleccion);
});

await Promise.all([cargarTipos(), cargar()]);
