const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const reservasService = require('./reservas.service');
const reservasController = require('./reservas.controller');

// Registra lo que el controller hace con la respuesta.
function crearRes() {
  const res = {
    estado: 200,
    cuerpo: undefined,
    status(codigo) {
      res.estado = codigo;
      return res;
    },
    json(cuerpo) {
      res.cuerpo = cuerpo;
      return res;
    },
  };
  return res;
}

const USUARIO = { id: 5, rol: 'CLIENTE', nombre: 'Cliente Uno' };

afterEach(() => mock.restoreAll());

describe('reservas.controller.crear', () => {
  it('pasa el id del token y el cuerpo, y responde 201 con { data }', async () => {
    const reserva = { id: 12, estado: 'PAGADA' };
    const crear = mock.method(reservasService, 'crear', async () => reserva);
    const cuerpo = { canchaId: 3, inicio: '2026-10-21T19:00:00' };
    const res = crearRes();

    await reservasController.crear({ usuario: USUARIO, body: cuerpo }, res);

    assert.deepEqual(crear.mock.calls[0].arguments, [5, cuerpo]);
    assert.equal(res.estado, 201);
    assert.deepEqual(res.cuerpo, { data: reserva });
  });
});
