const ESTADOS = Object.freeze({
  PAGADA: 'PAGADA',
  CONFIRMADA: 'CONFIRMADA',
  COMPLETADA: 'COMPLETADA',
  CANCELADA: 'CANCELADA',
  NO_SHOW: 'NO_SHOW',
});

const ROLES = Object.freeze({
  CLIENTE: 'CLIENTE',
  ADMIN: 'ADMIN',
});

const TIPOS_PAGO = Object.freeze({
  CARGO: 'CARGO',
  REEMBOLSO: 'REEMBOLSO',
});

module.exports = { ESTADOS, ROLES, TIPOS_PAGO };
