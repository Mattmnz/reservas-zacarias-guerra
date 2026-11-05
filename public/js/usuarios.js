export const ROLES = { CLIENTE: 'Cliente', ADMIN: 'Administrador' };

// La API responde 400 a un filtro vacío (?rol=): solo van los que tienen valor.
export function consultaUsuarios({ rol, activo }) {
  const consulta = new URLSearchParams();
  if (rol) consulta.set('rol', rol);
  if (activo) consulta.set('activo', activo);
  return consulta.toString();
}

function cambioDeRol({ nombre, rol }) {
  const nuevo = rol === 'ADMIN' ? 'CLIENTE' : 'ADMIN';
  return {
    cuerpo: { rol: nuevo },
    boton: `Hacer ${ROLES[nuevo].toLowerCase()}`,
    titulo: 'Cambiar el rol',
    consecuencia:
      nuevo === 'ADMIN'
        ? 'Tendrá acceso a la administración de inmediato.'
        : 'Pierde el acceso a la administración de inmediato.',
    exito: `Se cambió el rol de ${nombre} a ${ROLES[nuevo]}.`,
    peligro: nuevo === 'CLIENTE',
  };
}

function cambioDeEstado({ nombre, activo }) {
  if (activo) {
    return {
      cuerpo: { activo: false },
      boton: 'Desactivar',
      titulo: 'Desactivar el usuario',
      consecuencia: 'No podrá iniciar sesión y su sesión actual termina de inmediato. Sus reservas no cambian.',
      exito: `Se desactivó a ${nombre}.`,
      peligro: true,
    };
  }
  return {
    cuerpo: { activo: true },
    boton: 'Activar',
    titulo: 'Activar el usuario',
    consecuencia: 'Podrá volver a iniciar sesión.',
    exito: `Se activó a ${nombre}.`,
    peligro: false,
  };
}

export function cambiosDe(usuario) {
  return [cambioDeRol(usuario), cambioDeEstado(usuario)];
}
