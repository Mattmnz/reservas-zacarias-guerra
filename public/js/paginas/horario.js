import { pedir } from '../api.js';
import {
  DIAS,
  HORAS_APERTURA,
  HORAS_CIERRE,
  cambiosDeHorario,
  diasAbiertos,
  errorDeSemana,
  semanaCompleta,
} from '../horarios.js';
import { leerIdPositivo } from '../parametros.js';
import { exigirRol } from '../sesion.js';

await exigirRol('ADMIN');

const aviso = document.querySelector('[data-error]');
const resultado = document.querySelector('[data-resultado]');
const titulo = document.querySelector('[data-titulo]');
const carga = document.querySelector('[data-cargando]');
const seccion = document.querySelector('[data-horario]');
const formulario = document.querySelector('[data-formulario]');
const contenedorSemana = document.querySelector('[data-semana]');
const dialogo = document.querySelector('[data-dialogo]');

function mostrarError(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
  aviso.scrollIntoView({ block: 'center' });
}

function crearSelect(nombre, horas, valor, etiquetaAccesible) {
  const select = document.createElement('select');
  select.name = nombre;
  select.setAttribute('aria-label', etiquetaAccesible);
  for (const hora of horas) {
    const opcion = document.createElement('option');
    opcion.value = hora;
    opcion.textContent = hora;
    select.append(opcion);
  }
  select.value = valor;
  return select;
}

function crearCampo(texto, control) {
  const campo = document.createElement('label');
  campo.className = 'campo';
  const etiqueta = document.createElement('span');
  etiqueta.className = 'campo__etiqueta';
  etiqueta.textContent = texto;
  campo.append(etiqueta, control);
  return campo;
}

// Una fila por día: casilla de abierto y las dos horas, que se deshabilitan si el día está cerrado.
function crearDia({ diaSemana, abierto, apertura, cierre }) {
  const nombre = DIAS[diaSemana];
  const fila = document.createElement('div');
  fila.className = 'semana__dia';
  fila.dataset.dia = String(diaSemana);
  fila.setAttribute('role', 'group');
  fila.setAttribute('aria-label', nombre);

  const casilla = document.createElement('input');
  casilla.type = 'checkbox';
  casilla.name = 'abierto';
  casilla.checked = abierto;

  const textoCasilla = document.createElement('span');
  textoCasilla.textContent = nombre;

  const etiquetaCasilla = document.createElement('label');
  etiquetaCasilla.className = 'casilla semana__nombre';
  etiquetaCasilla.append(casilla, textoCasilla);

  const selectApertura = crearSelect('apertura', HORAS_APERTURA, apertura, `${nombre}: apertura`);
  const selectCierre = crearSelect('cierre', HORAS_CIERRE, cierre, `${nombre}: cierre`);

  const actualizar = () => {
    selectApertura.disabled = !casilla.checked;
    selectCierre.disabled = !casilla.checked;
  };
  casilla.addEventListener('change', actualizar);
  actualizar();

  fila.append(etiquetaCasilla, crearCampo('Apertura', selectApertura), crearCampo('Cierre', selectCierre));
  return fila;
}

function leerSemana() {
  return [...contenedorSemana.querySelectorAll('[data-dia]')].map((fila) => ({
    diaSemana: Number(fila.dataset.dia),
    abierto: fila.querySelector('[name="abierto"]').checked,
    apertura: fila.querySelector('[name="apertura"]').value,
    cierre: fila.querySelector('[name="cierre"]').value,
  }));
}

// Se valida aquí y no con la llamada: sin cancha no hay nada que mostrar.
const canchaId = leerIdPositivo(new URLSearchParams(location.search).get('canchaId'));
// La semana guardada: contra ella se calculan los cambios de la confirmación.
let guardado = [];
let cancha = null;

async function cargar() {
  try {
    const [datosCancha, dias] = await Promise.all([
      pedir(`/canchas/${canchaId}`),
      pedir(`/canchas/${canchaId}/horarios`),
    ]);
    cancha = datosCancha;
    guardado = dias;
    document.querySelector('[data-cancha]').textContent = `${cancha.nombre} · ${cancha.tipoNombre}`;
    document.querySelector('[data-inactiva]').hidden = cancha.activa;
    contenedorSemana.replaceChildren(...semanaCompleta(dias).map(crearDia));
    seccion.hidden = false;
  } catch (error) {
    mostrarError(error.mensaje);
  } finally {
    carga.hidden = true;
  }
}

formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();
  aviso.hidden = true;
  resultado.hidden = true;
  const semana = leerSemana();
  const error = errorDeSemana(semana);
  if (error) {
    mostrarError(error);
    return;
  }

  const cambios = cambiosDeHorario(guardado, diasAbiertos(semana));
  if (cambios.length === 0) {
    resultado.textContent = 'No hay cambios para guardar.';
    resultado.hidden = false;
    return;
  }

  document.querySelector('[data-dialogo-detalle]').textContent = `${cancha.nombre}:`;
  document.querySelector('[data-dialogo-cambios]').replaceChildren(
    ...cambios.map((cambio) => {
      const item = document.createElement('li');
      item.textContent = cambio;
      return item;
    }),
  );
  // Esc no cambia returnValue: sin limpiarlo, repetiría el guardado de un intento anterior.
  dialogo.returnValue = '';
  dialogo.showModal();
});

async function guardar() {
  const boton = formulario.querySelector('[type="submit"]');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    guardado = await pedir(`/canchas/${canchaId}/horarios`, {
      metodo: 'PUT',
      cuerpo: { dias: diasAbiertos(leerSemana()) },
    });
    contenedorSemana.replaceChildren(...semanaCompleta(guardado).map(crearDia));
    resultado.textContent = `Se guardó el horario de ${cancha.nombre}.`;
    resultado.hidden = false;
    titulo.focus();
  } catch (error) {
    mostrarError(error.mensaje);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar horario';
  }
}

dialogo.addEventListener('close', () => {
  if (dialogo.returnValue === 'confirmar') guardar();
});

if (canchaId === null) {
  carga.hidden = true;
  mostrarError('Falta la cancha o no es válida. Vuelva a la lista de canchas y elija una.');
} else {
  await cargar();
}
