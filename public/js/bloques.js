import { formatearHora } from './formato.js';

// Enlaces a Detalle y reserva (E7). Recibe una cancha tal como la devuelve /disponibilidad.
export function crearBloques({ canchaId, nombre, bloques }) {
  const contenedor = document.createElement('div');
  contenedor.className = 'bloques';
  contenedor.append(
    ...bloques.map((inicio) => {
      const enlace = document.createElement('a');
      enlace.className = 'boton boton--secundario';
      enlace.href = `/cliente/reserva.html?${new URLSearchParams({ canchaId, inicio })}`;
      enlace.textContent = formatearHora(inicio);
      enlace.setAttribute('aria-label', `Reservar ${nombre} a las ${formatearHora(inicio)}`);
      return enlace;
    }),
  );
  return contenedor;
}
