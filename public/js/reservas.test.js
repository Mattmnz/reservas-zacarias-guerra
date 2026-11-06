import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ESTADOS, claseEstado, esCancelable, reembolsoDe } from './reservas.js';

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

describe('esCancelable', () => {
  const AHORA = '2026-11-05T10:30:00';

  it('PAGADA o CONFIRMADA que todavía no empezó', () => {
    assert.equal(esCancelable({ estado: 'PAGADA', inicio: '2026-11-05T11:00:00' }, AHORA), true);
    assert.equal(esCancelable({ estado: 'CONFIRMADA', inicio: '2026-11-06T08:00:00' }, AHORA), true);
  });

  it('no la ofrece si ya empezó, aunque siga PAGADA hasta el barrido', () => {
    assert.equal(esCancelable({ estado: 'PAGADA', inicio: '2026-11-05T10:00:00' }, AHORA), false);
    assert.equal(esCancelable({ estado: 'PAGADA', inicio: AHORA }, AHORA), false);
  });

  it('no la ofrece en estados finales', () => {
    for (const estado of ['COMPLETADA', 'CANCELADA', 'NO_SHOW']) {
      assert.equal(esCancelable({ estado, inicio: '2026-11-06T08:00:00' }, AHORA), false);
    }
  });
});
