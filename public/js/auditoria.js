import { ROLES } from './usuarios.js';

export const ENTIDADES = { RESERVA: 'Reserva', CANCHA: 'Cancha', USUARIO: 'Usuario' };

const ACCIONES = {
  CREAR: 'Creación',
  CONFIRMAR: 'Confirmación',
  CANCELAR: 'Cancelación',
  REGISTRAR_ASISTENCIA: 'Asistencia registrada',
  MARCAR_NO_SHOW: 'Marcada como no-show',
  EDITAR: 'Edición',
  BAJA: 'Baja',
  ALTA: 'Alta',
  CAMBIAR_HORARIO: 'Cambio de horario',
  CAMBIAR_ROL: 'Cambio de rol',
  ACTIVAR: 'Activación',
  DESACTIVAR: 'Desactivación',
};

// La API responde 400 a un filtro vacío (?entidad=): solo van los que tienen valor.
export function consultaAuditoria({ entidad, entidadId }) {
  const consulta = new URLSearchParams();
  if (entidad) consulta.set('entidad', entidad);
  if (entidadId) consulta.set('entidadId', entidadId);
  return consulta.toString();
}

// Una acción nueva se muestra cruda: un registro de auditoría nunca debe quedar sin texto.
export function textoAccion(accion) {
  return ACCIONES[accion] ?? accion;
}

export function textoCambio({ estadoAnterior, estadoNuevo }) {
  if (estadoAnterior === null && estadoNuevo === null) return null;
  return `${estadoAnterior ?? '—'} → ${estadoNuevo ?? '—'}`;
}

function nombreConRol({ nombre, rol }) {
  return `${nombre} (${ROLES[rol].toLowerCase()})`;
}

// Sin usuario es una acción del sistema, como el barrido de no-show.
// `usuarios` es un Map de id a { nombre, rol }; sin el id (o sin mapa) queda el número.
export function textoAutor(usuarioId, usuarios) {
  if (usuarioId === null) return 'Sistema';
  const usuario = usuarios?.get(usuarioId);
  return usuario ? nombreConRol(usuario) : `Usuario #${usuarioId}`;
}

// `usuarios` y `canchas` son Map por id; sin el id (o sin mapa) queda solo la entidad y su número.
export function textoEntidad({ entidad, entidadId }, usuarios, canchas) {
  const base = `${ENTIDADES[entidad]} #${entidadId}`;
  if (entidad === 'USUARIO') {
    const usuario = usuarios?.get(entidadId);
    return usuario ? `${nombreConRol(usuario)} · ${base}` : base;
  }
  if (entidad === 'CANCHA') {
    const cancha = canchas?.get(entidadId);
    return cancha ? `${cancha.nombre} · ${base}` : base;
  }
  return base;
}
