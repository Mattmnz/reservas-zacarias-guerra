// api.js y sesion.js se importan entre sí: es seguro porque solo se usan dentro de funciones.
import { expirarSesion, obtenerToken } from './sesion.js';

const MENSAJE_GENERICO = 'No se pudo completar la operación. Inténtelo de nuevo.';

export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.mensaje = mensaje;
  }
}

// `publica` va en login y registro: ahí un 401 es un error del formulario, no una sesión expirada.
export async function pedir(ruta, { metodo = 'GET', cuerpo, publica = false } = {}) {
  const cabeceras = {};
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  const token = publica ? null : obtenerToken();
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', MENSAJE_GENERICO);
  }

  if (respuesta.status === 401 && !publica) {
    expirarSesion();
    // Queda pendiente: la página no debe mostrar un error mientras se va al login.
    return new Promise(() => {});
  }
  if (respuesta.status === 204) return null;

  // Un proxy puede responder HTML (por ejemplo, un 502 del hosting).
  const carga = await respuesta.json().catch(() => null);
  if (respuesta.ok && carga) return carga.data;
  throw new ErrorApi(
    respuesta.status,
    carga?.error?.codigo ?? 'ERROR_INTERNO',
    carga?.error?.mensaje ?? MENSAJE_GENERICO,
  );
}

export function iniciarSesion(correo, password) {
  return pedir('/auth/login', { metodo: 'POST', cuerpo: { correo, password }, publica: true });
}

export function registrar(datos) {
  return pedir('/auth/registro', { metodo: 'POST', cuerpo: datos, publica: true });
}

export function obtenerPerfil() {
  return pedir('/auth/yo');
}

export function obtenerNotificaciones() {
  return pedir('/notificaciones');
}
