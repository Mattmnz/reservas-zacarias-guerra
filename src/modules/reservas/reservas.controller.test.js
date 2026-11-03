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

const ADMIN = { id: 1, rol: 'ADMIN', nombre: 'Admin' };

for (const accion of ['confirmar', 'registrarAsistencia']) {
  describe(`reservas.controller.${accion}`, () => {
    it('pasa el id de la ruta y el admin del token, y responde 200 con { data }', async () => {
      const reserva = { id: 12, estado: 'CONFIRMADA' };
      const llamada = mock.method(reservasService, accion, async () => reserva);
      const res = crearRes();

      await reservasController[accion]({ usuario: ADMIN, params: { id: '12' } }, res);

      assert.deepEqual(llamada.mock.calls[0].arguments, ['12', 1]);
      assert.equal(res.estado, 200);
      assert.deepEqual(res.cuerpo, { data: reserva });
    });
  });
}

describe('reservas.controller.cancelar', () => {
  it('pasa el id de la ruta, el usuario del token y el cuerpo, y responde 200 con { data }', async () => {
    const reserva = { id: 12, estado: 'CANCELADA' };
    const cancelar = mock.method(reservasService, 'cancelar', async () => reserva);
    const cuerpo = { motivo: 'Cambio de planes' };
    const res = crearRes();

    await reservasController.cancelar({ usuario: USUARIO, params: { id: '12' }, body: cuerpo }, res);

    assert.deepEqual(cancelar.mock.calls[0].arguments, ['12', USUARIO, cuerpo]);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: reserva });
  });
});

describe('reservas.controller.listarMias', () => {
  it('pasa el id del token y responde 200 con { data }', async () => {
    const reservas = [{ id: 12 }];
    const listarMias = mock.method(reservasService, 'listarMias', async () => reservas);
    const res = crearRes();

    await reservasController.listarMias({ usuario: USUARIO, query: { estado: 'PAGADA' } }, res);

    assert.deepEqual(listarMias.mock.calls[0].arguments, [5]);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: reservas });
  });
});

describe('reservas.controller.obtener', () => {
  it('pasa el id de la ruta y el usuario del token, y responde 200 con { data }', async () => {
    const reserva = { id: 12 };
    const obtener = mock.method(reservasService, 'obtener', async () => reserva);
    const res = crearRes();

    await reservasController.obtener({ usuario: USUARIO, params: { id: '12' } }, res);

    assert.deepEqual(obtener.mock.calls[0].arguments, ['12', USUARIO]);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: reserva });
  });
});

describe('reservas.controller.listar', () => {
  it('pasa el query string y responde 200 con { data }', async () => {
    const reservas = [{ id: 12 }];
    const listar = mock.method(reservasService, 'listar', async () => reservas);
    const query = { desde: '2026-10-20', estado: 'PAGADA' };
    const res = crearRes();

    await reservasController.listar({ usuario: ADMIN, query }, res);

    assert.deepEqual(listar.mock.calls[0].arguments, [query]);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: reservas });
  });
});
