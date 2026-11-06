const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const AppError = require('./AppError');
const { ahoraNicaragua, parsearFechaLocal, formatearFechaLocal, diaSemana } = require('./tiempo');

describe('diaSemana', () => {
  it('lunes es 1', () => {
    assert.equal(diaSemana(new Date('2026-10-19T10:00:00Z')), 1);
  });

  it('sábado es 6', () => {
    assert.equal(diaSemana(new Date('2026-10-24T10:00:00Z')), 6);
  });

  it('domingo es 7', () => {
    assert.equal(diaSemana(new Date('2026-10-25T10:00:00Z')), 7);
  });

  it('cruzando medianoche pasa de domingo (7) a lunes (1)', () => {
    assert.equal(diaSemana(new Date('2026-10-25T23:59:59Z')), 7);
    assert.equal(diaSemana(new Date('2026-10-26T00:00:00Z')), 1);
  });
});

describe('parsearFechaLocal', () => {
  it('devuelve la hora de pared en los campos UTC', () => {
    const d = parsearFechaLocal('2026-10-20T19:00:00');
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 9);
    assert.equal(d.getUTCDate(), 20);
    assert.equal(d.getUTCHours(), 19);
    assert.equal(d.getUTCMinutes(), 0);
    assert.equal(d.getUTCSeconds(), 0);
  });

  const invalidas = [
    ['con sufijo Z', '2026-10-20T19:00:00Z'],
    ['con offset', '2026-10-20T19:00:00-06:00'],
    ['con milisegundos', '2026-10-20T19:00:00.000'],
    ['sin segundos', '2026-10-20T19:00'],
    ['con espacio en lugar de T', '2026-10-20 19:00:00'],
    ['solo fecha', '2026-10-20'],
    ['texto basura', 'mañana a las 7'],
    ['texto vacío', ''],
    ['fecha imposible (30 de febrero)', '2026-02-30T10:00:00'],
    ['29 de febrero en año no bisiesto', '2026-02-29T10:00:00'],
    ['mes 13', '2026-13-01T00:00:00'],
    ['hora 24', '2026-10-20T24:00:00'],
    ['minuto 60', '2026-10-20T19:60:00'],
  ];

  for (const [caso, texto] of invalidas) {
    it(`rechaza ${caso}`, () => {
      assert.throws(
        () => parsearFechaLocal(texto),
        (err) => err instanceof AppError && err.status === 400 && err.codigo === 'VALIDACION',
      );
    });
  }

  for (const valor of [undefined, null, 1760986800000, new Date('2026-10-20T19:00:00Z')]) {
    it(`rechaza un valor que no es texto (${Object.prototype.toString.call(valor)})`, () => {
      assert.throws(() => parsearFechaLocal(valor), AppError);
    });
  }

  it('el mensaje incluye el campo indicado', () => {
    assert.throws(() => parsearFechaLocal('2026-10-20T19:00:00Z', 'inicio'), {
      message: 'inicio: formato inválido, se espera YYYY-MM-DDTHH:mm:ss',
    });
  });

  it('sin campo, el mensaje empieza con "fecha"', () => {
    assert.throws(() => parsearFechaLocal('basura'), {
      message: 'fecha: formato inválido, se espera YYYY-MM-DDTHH:mm:ss',
    });
  });
});

describe('formatearFechaLocal', () => {
  for (const t of [
    '2026-10-20T19:00:00',
    '2026-01-01T00:00:00',
    '2026-12-31T23:59:59',
    '2028-02-29T12:30:45',
  ]) {
    it(`formatearFechaLocal(parsearFechaLocal('${t}')) devuelve el mismo texto`, () => {
      assert.equal(formatearFechaLocal(parsearFechaLocal(t)), t);
    });
  }
});

describe('ahoraNicaragua', () => {
  afterEach(() => mock.restoreAll());

  it('resta exactamente 6 horas al reloj', () => {
    const valor = Date.UTC(2026, 9, 20, 19, 0, 0);
    mock.method(Date, 'now', () => valor);

    assert.equal(ahoraNicaragua().getTime(), valor - 6 * 3600 * 1000);
    assert.equal(formatearFechaLocal(ahoraNicaragua()), '2026-10-20T13:00:00');
  });
});
