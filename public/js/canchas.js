// La API no devuelve la cantidad del 409 CANCHA_CON_RESERVAS en un campo aparte: va en el mensaje
// («La cancha tiene 1 reserva activa…»). Si el texto cambia, devuelve null y la pantalla sigue sin cifra.
export function reservasActivasDe(mensaje) {
  const coincidencia = /(\d+) reservas? activas?/.exec(mensaje ?? '');
  return coincidencia ? Number(coincidencia[1]) : null;
}

export function textoReservas(cantidad) {
  return cantidad === 1 ? '1 reserva' : `${cantidad} reservas`;
}

// Los textos de la confirmación de la baja: con la cantidad del 409, o sin ella si no se pudo leer.
// Cuentan las reservas futuras y las que están en curso (#35, 4/11).
export function bajaConReservas(cantidad) {
  if (cantidad === null) {
    return {
      titulo: 'La cancha tiene reservas activas',
      consecuencia:
        'Tiene reservas activas, futuras o en curso. Si continúa, se cancelan con reembolso total ' +
        'y se notifica a cada cliente.',
      boton: 'Dar de baja y cancelar las reservas',
    };
  }
  const una = cantidad === 1;
  return {
    titulo: una ? 'La cancha tiene una reserva activa' : 'La cancha tiene reservas activas',
    consecuencia: una
      ? 'Tiene 1 reserva activa, futura o en curso. Si continúa, se cancela con reembolso total y se notifica al cliente.'
      : `Tiene ${cantidad} reservas activas, futuras o en curso. Si continúa, se cancelan con reembolso total ` +
        'y se notifica a cada cliente.',
    boton: `Dar de baja y cancelar ${textoReservas(cantidad)}`,
  };
}

export function resultadoBaja({ nombre, reservasCanceladas }) {
  return reservasCanceladas === 0
    ? `Se dio de baja la cancha ${nombre}.`
    : `Se dio de baja la cancha ${nombre}. Reservas canceladas con reembolso total: ${reservasCanceladas}.`;
}
