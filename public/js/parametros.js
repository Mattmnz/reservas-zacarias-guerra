const INT_MAX = 2147483647;
const FORMATO_INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00$/;

// Reciben lo que devuelve URLSearchParams.get: un texto, o null si el parámetro falta.

export function leerIdPositivo(texto) {
  if (typeof texto !== 'string' || !/^\d+$/.test(texto)) return null;
  const id = Number(texto);
  return id > 0 && id <= INT_MAX ? id : null;
}

export function leerOpcion(texto, opciones) {
  return opciones.includes(texto) ? texto : null;
}

export function leerInicio(texto) {
  if (typeof texto !== 'string' || !FORMATO_INICIO.test(texto)) return null;
  const fecha = new Date(`${texto}Z`);
  if (Number.isNaN(fecha.getTime())) return null;
  // Date normaliza 2026-02-30 a marzo: si el texto no vuelve igual, la fecha no existe.
  return fecha.toISOString().slice(0, 19) === texto ? texto : null;
}
