import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ESTADOS, claseEstado, reembolsoDe } from './reservas.js';

describe('claseEstado', () => {
  it('arma la clase de un estado simple', () => {
    assert.equal(claseEstado('PAGADA'), 'etiqueta--pagada');
  });

  it('cambia el guion bajo de NO_SHOW', () => {
    assert.equal(claseEstado('NO_SHOW'), 'etiqueta--no-show');
  });

  it('cubre todos los estados con texto visible', () => {
    assert.deepEqual(Object.keys(ESTADOS), ['PAGADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_SHOW']);
  });
});

describe('reembolsoDe', () => {
  const cargo = { tipo: 'CARGO', monto: 600, referencia: 'SIM-C-1' };

  it('devuelve el monto del pago de reembolso, no el del cargo', () => {
    const reembolso = { tipo: 'REEMBOLSO', monto: 300, referencia: 'SIM-R-1' };
    assert.equal(reembolsoDe({ pagos: [cargo, reembolso] }), 300);
  });

  it('sin pago de reembolso devuelve 0', () => {
    assert.equal(reembolsoDe({ pagos: [cargo] }), 0);
  });
});
