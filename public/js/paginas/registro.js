import { registrar } from '../api.js';

const formulario = document.querySelector('[data-formulario]');
const aviso = document.querySelector('[data-error]');
const boton = formulario.querySelector('button[type="submit"]');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  aviso.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Creando cuenta…';
  try {
    await registrar(Object.fromEntries(new FormData(formulario)));
    location.assign('/login.html?registrado=1');
  } catch (error) {
    aviso.textContent = error.mensaje;
    aviso.hidden = false;
    boton.disabled = false;
    boton.textContent = 'Crear cuenta';
  }
});
