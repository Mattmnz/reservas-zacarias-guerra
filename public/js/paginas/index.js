import { obtenerToken, obtenerUsuario, rutaInicio } from '../sesion.js';

// No valida el token: `/` no llama a la API. Si venció, la página de destino recibe el 401.
const usuario = obtenerToken() ? obtenerUsuario() : null;
location.replace(usuario ? rutaInicio(usuario.rol) : '/login.html');
