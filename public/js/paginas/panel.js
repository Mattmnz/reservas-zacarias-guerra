import { exigirRol, MENUS } from '../sesion.js';

const usuario = await exigirRol('ADMIN');

document.querySelector('[data-saludo]').textContent = `Hola, ${usuario.nombre}.`;

const tarjetas = MENUS.ADMIN.filter((opcion) => opcion.descripcion).map(({ ruta, texto, descripcion }) => {
  const tarjeta = document.createElement('a');
  tarjeta.className = 'tarjeta';
  tarjeta.href = ruta;
  const titulo = document.createElement('h2');
  titulo.textContent = texto;
  const detalle = document.createElement('p');
  detalle.textContent = descripcion;
  tarjeta.append(titulo, detalle);
  return tarjeta;
});

document.querySelector('[data-opciones]').append(...tarjetas);
