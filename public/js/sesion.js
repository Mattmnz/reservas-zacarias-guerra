import { obtenerPerfil } from './api.js';

const CLAVE_TOKEN = 'zg.token';
const CLAVE_USUARIO = 'zg.usuario';
const CLAVE_RETORNO = 'zg.retorno';
const RUTA_LOGIN = '/login.html';

const INICIOS = { CLIENTE: '/cliente/catalogo.html', ADMIN: '/admin/panel.html' };

// Rutas definitivas del modelo navegacional: las páginas llegan con #41 a #47.
export const MENUS = {
  CLIENTE: [
    { ruta: '/cliente/catalogo.html', texto: 'Catálogo' },
    { ruta: '/cliente/historial.html', texto: 'Historial de reservas' },
    { ruta: '/cliente/notificaciones.html', texto: 'Notificaciones', indicadorNoLeidas: true },
  ],
  ADMIN: [
    { ruta: '/admin/panel.html', texto: 'Panel' },
    { ruta: '/admin/canchas.html', texto: 'Canchas', descripcion: 'Altas, bajas, edición y horarios.' },
    { ruta: '/admin/reservas.html', texto: 'Reservas', descripcion: 'Consultar, confirmar y cancelar.' },
    { ruta: '/admin/usuarios.html', texto: 'Usuarios', descripcion: 'Roles y activación de cuentas.' },
    { ruta: '/admin/auditoria.html', texto: 'Auditoría', descripcion: 'Cambios registrados en el sistema.' },
  ],
};

export function rutaInicio(rol) {
  return INICIOS[rol] ?? RUTA_LOGIN;
}

export function obtenerToken() {
  return sessionStorage.getItem(CLAVE_TOKEN);
}

export function obtenerUsuario() {
  try {
    const usuario = JSON.parse(sessionStorage.getItem(CLAVE_USUARIO));
    return usuario?.rol ? usuario : null;
  } catch {
    return null;
  }
}

function guardarUsuario({ id, nombre, rol }) {
  sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify({ id, nombre, rol }));
}

export function guardarSesion(token, usuario) {
  sessionStorage.setItem(CLAVE_TOKEN, token);
  guardarUsuario(usuario);
}

// El retorno sale de location y no de la URL del login: no permite una redirección abierta.
export function expirarSesion() {
  sessionStorage.removeItem(CLAVE_TOKEN);
  sessionStorage.removeItem(CLAVE_USUARIO);
  sessionStorage.setItem(CLAVE_RETORNO, location.pathname + location.search);
  location.replace(RUTA_LOGIN);
}

export function consumirRetorno() {
  const retorno = sessionStorage.getItem(CLAVE_RETORNO);
  sessionStorage.removeItem(CLAVE_RETORNO);
  return retorno;
}

export function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_TOKEN);
  sessionStorage.removeItem(CLAVE_USUARIO);
  sessionStorage.removeItem(CLAVE_RETORNO);
  location.replace(RUTA_LOGIN);
}

function crearEnlace({ ruta, texto, indicadorNoLeidas }) {
  const enlace = document.createElement('a');
  enlace.className = 'menu__enlace';
  enlace.href = ruta;
  enlace.textContent = texto;
  if (location.pathname === ruta) enlace.setAttribute('aria-current', 'page');
  if (indicadorNoLeidas) {
    // #45 lo completa con la cantidad de notificaciones no leídas.
    const indicador = document.createElement('span');
    indicador.className = 'menu__indicador';
    indicador.dataset.noLeidas = '';
    indicador.hidden = true;
    enlace.append(indicador);
  }
  return enlace;
}

function armarMenu(usuario) {
  const marca = document.createElement('a');
  marca.className = 'menu__marca';
  marca.href = rutaInicio(usuario.rol);
  marca.textContent = 'Zacarías Guerra';

  const navegacion = document.createElement('nav');
  navegacion.className = 'menu__opciones';
  navegacion.setAttribute('aria-label', 'Menú principal');
  navegacion.append(...MENUS[usuario.rol].map(crearEnlace));

  const nombre = document.createElement('span');
  nombre.className = 'menu__usuario';
  nombre.textContent = usuario.nombre;

  const salir = document.createElement('button');
  salir.type = 'button';
  salir.className = 'boton boton--secundario';
  salir.textContent = 'Cerrar sesión';
  salir.addEventListener('click', cerrarSesion);

  const barra = document.createElement('div');
  barra.className = 'contenedor menu__barra';
  barra.append(marca, navegacion, nombre, salir);

  const cabecera = document.querySelector('[data-menu]');
  cabecera.className = 'menu';
  cabecera.replaceChildren(barra);
}

// Promesa que nunca se resuelve: el script de la página no sigue mientras el navegador redirige.
function detener() {
  return new Promise(() => {});
}

// Es lo primero que llama el script de una página protegida; devuelve el usuario autenticado.
export async function exigirRol(rol) {
  // Sin esto, "atrás" después de cerrar sesión muestra la página guardada en el bfcache.
  addEventListener('pageshow', (evento) => {
    if (evento.persisted && !obtenerToken()) location.replace(RUTA_LOGIN);
  });

  if (!obtenerToken() || !obtenerUsuario()) {
    expirarSesion();
    return detener();
  }

  const carga = document.querySelector('[data-carga]');
  let perfil;
  try {
    // Va siempre al servidor: detecta un token vencido y un cambio de rol en páginas sin datos.
    perfil = await obtenerPerfil();
  } catch (error) {
    carga.hidden = true;
    const aviso = document.querySelector('[data-error]');
    aviso.textContent = error.mensaje;
    aviso.hidden = false;
    return detener();
  }

  guardarUsuario(perfil);
  if (perfil.rol !== rol) {
    location.replace(rutaInicio(perfil.rol));
    return detener();
  }

  armarMenu(perfil);
  carga.hidden = true;
  document.querySelector('[data-contenido]').hidden = false;
  return { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol };
}
