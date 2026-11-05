import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { leerIdPositivo, leerInicio, leerOpcion } from './parametros.js';

describe('leerIdPositivo', () => {
  it('devuelve el número de un id válido', () => {
    assert.equal(leerIdPositivo('1'), 1);
    assert.equal(leerIdPositivo('42'), 42);
    assert.equal(leerIdPositivo('2147483647'), 2147483647);
  });

  for (const invalido of ['abc', '0', '-1', '1.5', '99999999999', '2147483648', '', ' 1', '1e3', null, undefined]) {
    it(`rechaza ${JSON.stringify(invalido)}`, () => {
      assert.equal(leerIdPositivo(invalido), null);
    });
  }
});

describe('leerOpcion', () => {
  const opciones = ['CLIENTE', 'ADMIN'];

  it('devuelve el texto si está entre las opciones', () => {
    assert.equal(leerOpcion('ADMIN', opciones), 'ADMIN');
  });

  for (const invalido of ['SUPER', 'admin', '', null]) {
    it(`rechaza ${JSON.stringify(invalido)}`, () => {
      assert.equal(leerOpcion(invalido, opciones), null);
    });
  }
});

describe('leerInicio', () => {
  it('devuelve el texto de una hora en punto', () => {
    assert.equal(leerInicio('2026-11-05T19:00:00'), '2026-11-05T19:00:00');
    assert.equal(leerInicio('2026-11-05T00:00:00'), '2026-11-05T00:00:00');
    assert.equal(leerInicio('2028-02-29T23:00:00'), '2028-02-29T23:00:00');
  });

  const invalidos = [
    '2026-11-05T19:30:00',
    '2026-11-05T19:00:01',
    '2026-11-05',
    '2026-11-05T19:00',
    '2026-11-05T19:00:00Z',
    '2026-11-05T25:00:00',
    '2026-11-05T24:00:00',
    '2026-02-30T19:00:00',
    '2026-13-01T19:00:00',
    'basura',
    '',
    null,
    undefined,
  ];
  for (const invalido of invalidos) {
    it(`rechaza ${JSON.stringify(invalido)}`, () => {
      assert.equal(leerInicio(invalido), null);
    });
  }
});
