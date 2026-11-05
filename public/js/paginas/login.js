import { iniciarSesion } from '../api.js';
import { consumirRetorno, guardarSesion, rutaInicio } from '../sesion.js';

const formulario = document.querySelector('[data-formulario]');
const aviso = document.querySelector('[data-error]');
const boton = formulario.querySelector('button[type="submit"]');

document.querySelector('[data-registrado]').hidden =
  new URLSearchParams(location.search).get('registrado') !== '1';

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const { correo, password } = Object.fromEntries(new FormData(formulario));
  aviso.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Ingresando…';
  try {
    const { token, usuario } = await iniciarSesion(correo, password);
    guardarSesion(token, usuario);
    location.replace(consumirRetorno() ?? rutaInicio(usuario.rol));
  } catch (error) {
    aviso.textContent = error.mensaje;
    aviso.hidden = false;
    boton.disabled = false;
    boton.textContent = 'Iniciar sesión';
  }
});
