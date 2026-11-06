import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { fechaHoraNicaragua, fechaNicaragua, formatearFecha, formatearHora, formatearMonto } from './formato.js';

describe('fechaNicaragua', () => {
  afterEach(() => mock.timers.reset());

  it('a las 05:59 UTC todavía es el día anterior en Nicaragua', () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-05T05:59:00Z') });
    assert.equal(fechaNicaragua(), '2026-11-04');
  });

  it('a las 06:00 UTC ya es el día siguiente en Nicaragua', () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-05T06:00:00Z') });
    assert.equal(fechaNicaragua(), '2026-11-05');
  });

  it('suma días y cruza el fin de mes', () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-05T12:00:00Z') });
    assert.equal(fechaNicaragua(30), '2026-12-05');
  });
});

describe('fechaHoraNicaragua', () => {
  afterEach(() => mock.timers.reset());

  it('devuelve la hora de pared de Nicaragua en el formato de la API', () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-05T05:59:30Z') });
    assert.equal(fechaHoraNicaragua(), '2026-11-04T23:59:30');
  });
});

describe('formatearFecha', () => {
  it('no corre el día en el borde de la medianoche', () => {
    assert.equal(formatearFecha('2026-11-05T00:00:00'), 'jueves, 5 de noviembre de 2026');
    assert.equal(formatearFecha('2026-11-05T23:00:00'), 'jueves, 5 de noviembre de 2026');
  });
});

describe('formatearHora', () => {
  it('toma la hora del texto local', () => {
    assert.equal(formatearHora('2026-11-05T07:00:00'), '07:00');
  });
});

describe('formatearMonto', () => {
  it('usa córdobas, miles y dos decimales', () => {
    assert.equal(formatearMonto(1200), 'C$ 1,200.00');
    assert.equal(formatearMonto(600.5), 'C$ 600.50');
  });
});
