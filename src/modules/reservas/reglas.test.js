const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ESTADOS } = require('../../shared/constantes');
const {
  ACCIONES,
  puedeTransicionar,
  estadoResultante,
  calcularCancelacion,
  calcularNoShow,
} = require('./reglas');

const HORA_MS = 3600 * 1000;
const inicio = new Date('2026-10-20T19:00:00Z');
const antesDe = (ms) => new Date(inicio.getTime() - ms);

describe('ACCIONES', () => {
  it('está congelado y cada valor es igual a su clave', () => {
    assert.ok(Object.isFrozen(ACCIONES));
    assert.deepEqual(Object.keys(ACCIONES).sort(), [
      'CANCELAR',
      'CONFIRMAR',
      'MARCAR_NO_SHOW',
      'REGISTRAR_ASISTENCIA',
    ]);
    for (const [clave, valor] of Object.entries(ACCIONES)) assert.equal(valor, clave);
  });
});

describe('transiciones', () => {
  const { CONFIRMAR, CANCELAR, REGISTRAR_ASISTENCIA, MARCAR_NO_SHOW } = ACCIONES;
  const { PAGADA, CONFIRMADA, COMPLETADA, CANCELADA, NO_SHOW } = ESTADOS;

  // null = transición inválida.
  const tabla = {
    [PAGADA]: { [CONFIRMAR]: CONFIRMADA, [CANCELAR]: CANCELADA, [REGISTRAR_ASISTENCIA]: COMPLETADA, [MARCAR_NO_SHOW]: NO_SHOW },
    [CONFIRMADA]: { [CONFIRMAR]: null, [CANCELAR]: CANCELADA, [REGISTRAR_ASISTENCIA]: COMPLETADA, [MARCAR_NO_SHOW]: NO_SHOW },
    [COMPLETADA]: { [CONFIRMAR]: null, [CANCELAR]: null, [REGISTRAR_ASISTENCIA]: null, [MARCAR_NO_SHOW]: null },
    [CANCELADA]: { [CONFIRMAR]: null, [CANCELAR]: null, [REGISTRAR_ASISTENCIA]: null, [MARCAR_NO_SHOW]: null },
    [NO_SHOW]: { [CONFIRMAR]: null, [CANCELAR]: null, [REGISTRAR_ASISTENCIA]: null, [MARCAR_NO_SHOW]: null },
  };

  for (const [estado, acciones] of Object.entries(tabla)) {
    for (const [accion, destino] of Object.entries(acciones)) {
      if (destino) {
        it(`${estado} + ${accion} → ${destino}`, () => {
          assert.equal(puedeTransicionar(estado, accion), true);
          assert.equal(estadoResultante(estado, accion), destino);
        });
      } else {
        it(`${estado} + ${accion} es inválida`, () => {
          assert.equal(puedeTransicionar(estado, accion), false);
          assert.throws(() => estadoResultante(estado, accion), RangeError);
        });
      }
    }
  }

  const desconocidos = [
    ['estado desconocido', 'PENDIENTE', CANCELAR],
    ['acción desconocida', PAGADA, 'BORRAR'],
    ['estado undefined', undefined, CANCELAR],
    ['acción undefined', PAGADA, undefined],
    ['estado heredado del prototipo', 'toString', CANCELAR],
    ['acción heredada del prototipo', PAGADA, 'toString'],
    ['estado __proto__', '__proto__', CANCELAR],
    ['acción __proto__', PAGADA, '__proto__'],
  ];

  for (const [caso, estado, accion] of desconocidos) {
    it(`${caso}: false y RangeError`, () => {
      assert.equal(puedeTransicionar(estado, accion), false);
      assert.throws(() => estadoResultante(estado, accion), RangeError);
    });
  }
});

describe('calcularCancelacion', () => {
  const bordes = [
    ['25 h antes → 0 %', 25 * HORA_MS, 0],
    ['exactamente 24 h antes → 0 %', 24 * HORA_MS, 0],
    ['24 h − 1 s antes → 50 %', 24 * HORA_MS - 1000, 50],
    ['1 min antes → 50 %', 60 * 1000, 50],
  ];

  for (const [caso, anticipacion, porcentaje] of bordes) {
    it(caso, () => {
      const r = calcularCancelacion(60000, inicio, antesDe(anticipacion));
      assert.equal(r.porcentajePenalizacion, porcentaje);
      assert.equal(r.penalizacionCentavos, (60000 * porcentaje) / 100);
      assert.equal(r.reembolsoCentavos, 60000 - r.penalizacionCentavos);
    });
  }

  it('con 0 ms de anticipación lanza RangeError', () => {
    assert.throws(() => calcularCancelacion(60000, inicio, antesDe(0)), RangeError);
  });

  it('con la reserva ya empezada lanza RangeError', () => {
    assert.throws(() => calcularCancelacion(60000, inicio, antesDe(-HORA_MS)), RangeError);
  });

  it('monto impar al 50 %: penalización redondeada y reembolso por resta', () => {
    const r = calcularCancelacion(60001, inicio, antesDe(HORA_MS));
    assert.deepEqual(r, { porcentajePenalizacion: 50, penalizacionCentavos: 30001, reembolsoCentavos: 30000 });
  });

  it('penalización más reembolso siempre suma el monto', () => {
    for (const monto of [1, 3, 99, 60000, 60001, 120000, 123457]) {
      for (const anticipacion of [HORA_MS, 48 * HORA_MS]) {
        const r = calcularCancelacion(monto, inicio, antesDe(anticipacion));
        assert.equal(r.penalizacionCentavos + r.reembolsoCentavos, monto);
      }
    }
  });

  const fechasInvalidas = [
    ['inicio inválido', new Date('x'), antesDe(HORA_MS)],
    ['inicio como texto', '2026-10-20T19:00:00', antesDe(HORA_MS)],
    ['ahora inválido', inicio, new Date('x')],
    ['ahora como texto', inicio, '2026-10-20T18:00:00'],
  ];

  for (const [caso, i, a] of fechasInvalidas) {
    it(`${caso} lanza TypeError`, () => {
      assert.throws(() => calcularCancelacion(60000, i, a), TypeError);
    });
  }
});

describe('validación de monto', () => {
  const montosInvalidos = [
    ['0', 0],
    ['negativo', -100],
    ['decimal', 600.5],
    ['NaN', NaN],
    ['texto', '600'],
  ];

  for (const [caso, monto] of montosInvalidos) {
    it(`monto ${caso} lanza TypeError en cancelación y no-show`, () => {
      assert.throws(() => calcularCancelacion(monto, inicio, antesDe(HORA_MS)), TypeError);
      assert.throws(() => calcularNoShow(monto), TypeError);
    });
  }
});

describe('calcularNoShow', () => {
  it('penaliza el 100 % sin reembolso', () => {
    assert.deepEqual(calcularNoShow(60001), {
      porcentajePenalizacion: 100,
      penalizacionCentavos: 60001,
      reembolsoCentavos: 0,
    });
  });
});
