import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  HORAS_APERTURA,
  HORAS_CIERRE,
  cambiosDeHorario,
  diasAbiertos,
  errorDeSemana,
  semanaCompleta,
} from './horarios.js';

describe('horas', () => {
  it('la apertura va de 00:00 a 22:00 y el cierre de 01:00 a 23:00', () => {
    assert.equal(HORAS_APERTURA.length, 23);
    assert.equal(HORAS_APERTURA[0], '00:00');
    assert.equal(HORAS_APERTURA.at(-1), '22:00');
    assert.equal(HORAS_CIERRE[0], '01:00');
    assert.equal(HORAS_CIERRE.at(-1), '23:00');
  });
});

describe('semanaCompleta', () => {
  it('devuelve los 7 días; los ausentes, cerrados con el horario inicial', () => {
    const semana = semanaCompleta([{ diaSemana: 2, apertura: '08:00', cierre: '20:00' }]);

    assert.equal(semana.length, 7);
    assert.deepEqual(semana[0], { diaSemana: 1, abierto: false, apertura: '07:00', cierre: '22:00' });
    assert.deepEqual(semana[1], { diaSemana: 2, abierto: true, apertura: '08:00', cierre: '20:00' });
    assert.deepEqual(semana.map((d) => d.diaSemana), [1, 2, 3, 4, 5, 6, 7]);
  });

  it('una cancha sin horario queda con todos los días cerrados', () => {
    assert.ok(semanaCompleta([]).every((d) => !d.abierto));
  });
});

describe('diasAbiertos', () => {
  it('manda solo los días abiertos, sin el campo abierto', () => {
    const semana = semanaCompleta([{ diaSemana: 7, apertura: '09:00', cierre: '18:00' }]);
    assert.deepEqual(diasAbiertos(semana), [{ diaSemana: 7, apertura: '09:00', cierre: '18:00' }]);
  });

  it('con todos cerrados manda un arreglo vacío', () => {
    assert.deepEqual(diasAbiertos(semanaCompleta([])), []);
  });
});

describe('errorDeSemana', () => {
  it('nombra el primer día abierto con la apertura igual o posterior al cierre', () => {
    const semana = semanaCompleta([
      { diaSemana: 1, apertura: '07:00', cierre: '22:00' },
      { diaSemana: 3, apertura: '20:00', cierre: '20:00' },
      { diaSemana: 4, apertura: '21:00', cierre: '08:00' },
    ]);
    assert.equal(errorDeSemana(semana), 'Miércoles: la apertura debe ser anterior al cierre.');
  });

  it('ignora los días cerrados', () => {
    const semana = semanaCompleta([]);
    semana[0].apertura = '22:00';
    semana[0].cierre = '01:00';
    assert.equal(errorDeSemana(semana), null);
  });
});

describe('cambiosDeHorario', () => {
  const anterior = [
    { diaSemana: 1, apertura: '07:00', cierre: '22:00' },
    { diaSemana: 2, apertura: '07:00', cierre: '22:00' },
  ];

  it('lista solo los días que cambian, en orden de la semana', () => {
    const nueva = [
      { diaSemana: 2, apertura: '07:00', cierre: '22:00' },
      { diaSemana: 7, apertura: '08:00', cierre: '12:00' },
    ];
    assert.deepEqual(cambiosDeHorario(anterior, nueva), [
      'Lunes: 07:00 a 22:00 → cerrado',
      'Domingo: cerrado → 08:00 a 12:00',
    ]);
  });

  it('sin cambios devuelve una lista vacía', () => {
    assert.deepEqual(cambiosDeHorario(anterior, [...anterior].reverse()), []);
  });
});
