import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESTADOS,
  claseEstado,
  consultaReservas,
  esCancelable,
  puedeConfirmar,
  puedeRegistrarAsistencia,
  reembolsoDe,
} from './reservas.js';

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

describe('puedeConfirmar', () => {
  const ahora = '2026-11-06T10:00:00';

  it('solo una reserva PAGADA que todavía no empezó', () => {
    assert.equal(puedeConfirmar({ estado: 'PAGADA', inicio: '2026-11-06T11:00:00' }, ahora), true);
    assert.equal(puedeConfirmar({ estado: 'PAGADA', inicio: ahora }, ahora), false);
    assert.equal(puedeConfirmar({ estado: 'CONFIRMADA', inicio: '2026-11-06T11:00:00' }, ahora), false);
  });
});

describe('puedeRegistrarAsistencia', () => {
  const reserva = { estado: 'CONFIRMADA', inicio: '2026-11-06T10:00:00' };

  it('abre 15 min antes del inicio, bordes incluidos', () => {
    assert.equal(puedeRegistrarAsistencia(reserva, '2026-11-06T09:44:59'), false);
    assert.equal(puedeRegistrarAsistencia(reserva, '2026-11-06T09:45:00'), true);
  });

  it('cierra al cumplirse la hora del bloque, cuando la barrería el no-show', () => {
    assert.equal(puedeRegistrarAsistencia(reserva, '2026-11-06T10:59:59'), true);
    assert.equal(puedeRegistrarAsistencia(reserva, '2026-11-06T11:00:00'), false);
  });

  it('cruza el cambio de día', () => {
    const tarde = { estado: 'PAGADA', inicio: '2026-11-06T23:00:00' };
    assert.equal(puedeRegistrarAsistencia(tarde, '2026-11-06T23:59:59'), true);
    assert.equal(puedeRegistrarAsistencia(tarde, '2026-11-07T00:00:00'), false);
    const temprano = { estado: 'PAGADA', inicio: '2026-11-07T00:00:00' };
    assert.equal(puedeRegistrarAsistencia(temprano, '2026-11-06T23:50:00'), true);
  });

  for (const estado of ['COMPLETADA', 'CANCELADA', 'NO_SHOW']) {
    it(`no con ${estado}`, () => {
      assert.equal(puedeRegistrarAsistencia({ ...reserva, estado }, '2026-11-06T10:00:00'), false);
    });
  }
});

describe('consultaReservas', () => {
  it('omite los filtros vacíos', () => {
    assert.equal(consultaReservas({ desde: '', hasta: '', canchaId: null, estado: '' }), '');
  });

  it('combina los cuatro filtros en el orden de la API', () => {
    assert.equal(
      consultaReservas({ desde: '2026-11-06', hasta: '2026-11-08', canchaId: 3, estado: 'NO_SHOW' }),
      'desde=2026-11-06&hasta=2026-11-08&canchaId=3&estado=NO_SHOW',
    );
  });
});
