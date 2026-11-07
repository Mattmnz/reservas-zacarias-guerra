import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bajaConReservas, reservasActivasDe, resultadoBaja, textoReservas } from './canchas.js';

describe('reservasActivasDe', () => {
  it('lee la cantidad del mensaje del 409, en singular y en plural', () => {
    assert.equal(
      reservasActivasDe('La cancha tiene 1 reserva activa. Para darla de baja y cancelarlas con reembolso total, envíe confirmar: true'),
      1,
    );
    assert.equal(reservasActivasDe('La cancha tiene 12 reservas activas. Para darla de baja…'), 12);
  });

  it('devuelve null si el mensaje no trae la cantidad', () => {
    assert.equal(reservasActivasDe('La cancha tiene reservas'), null);
    assert.equal(reservasActivasDe(''), null);
    assert.equal(reservasActivasDe(undefined), null);
  });
});

describe('textoReservas', () => {
  it('concuerda en número', () => {
    assert.equal(textoReservas(1), '1 reserva');
    assert.equal(textoReservas(3), '3 reservas');
  });
});

describe('bajaConReservas', () => {
  it('muestra la cantidad en la consecuencia y en el botón', () => {
    const textos = bajaConReservas(2);
    assert.match(textos.consecuencia, /Tiene 2 reservas activas, futuras o en curso/);
    assert.match(textos.consecuencia, /reembolso total/);
    assert.equal(textos.boton, 'Dar de baja y cancelar 2 reservas');
  });

  it('concuerda en singular', () => {
    const textos = bajaConReservas(1);
    assert.match(textos.consecuencia, /Tiene 1 reserva activa, futura o en curso\. Si continúa, se cancela con/);
    assert.equal(textos.boton, 'Dar de baja y cancelar 1 reserva');
  });

  it('sin cantidad, pide la confirmación igual', () => {
    const textos = bajaConReservas(null);
    assert.match(textos.consecuencia, /Tiene reservas activas,/);
    assert.equal(textos.boton, 'Dar de baja y cancelar las reservas');
  });
});

describe('resultadoBaja', () => {
  it('informa las canceladas que devuelve la API', () => {
    assert.equal(resultadoBaja({ nombre: 'Sala 1', reservasCanceladas: 0 }), 'Se dio de baja la cancha Sala 1.');
    assert.equal(
      resultadoBaja({ nombre: 'Sala 1', reservasCanceladas: 2 }),
      'Se dio de baja la cancha Sala 1. Reservas canceladas con reembolso total: 2.',
    );
  });
});
