const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const notificacionesService = require('./notificaciones.service');
const notificacionesController = require('./notificaciones.controller');

// Registra lo que el controller hace con la respuesta.
function crearRes() {
  const res = {
    estado: 200,
    cuerpo: undefined,
    terminada: false,
    status(codigo) {
      res.estado = codigo;
      return res;
    },
    json(cuerpo) {
      res.cuerpo = cuerpo;
      res.terminada = true;
      return res;
    },
    end() {
      res.terminada = true;
      return res;
    },
  };
  return res;
}

const USUARIO = { id: 3, rol: 'CLIENTE', nombre: 'Cliente Uno' };

afterEach(() => mock.restoreAll());

describe('notificaciones.controller.listar', () => {
  it('usa req.usuario.id y responde 200 con { data }', async () => {
    const notificaciones = [{ id: 8, mensaje: 'Hola' }];
    const listarMias = mock.method(notificacionesService, 'listarMias', async () => notificaciones);
    const res = crearRes();

    await notificacionesController.listar({ usuario: USUARIO, query: {} }, res);

    assert.deepEqual(listarMias.mock.calls[0].arguments, [3]);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: notificaciones });
  });
});

describe('notificaciones.controller.marcarLeida', () => {
  it('pasa usuario e id de la ruta y responde 204 sin cuerpo', async () => {
    const marcarLeida = mock.method(notificacionesService, 'marcarLeida', async () => undefined);
    const res = crearRes();

    await notificacionesController.marcarLeida({ usuario: USUARIO, params: { id: '7' } }, res);

    assert.deepEqual(marcarLeida.mock.calls[0].arguments, [3, '7']);
    assert.equal(res.estado, 204);
    assert.equal(res.cuerpo, undefined);
    assert.equal(res.terminada, true);
  });

  it('si el service lanza, no responde y el error sigue hacia manejarErrores', async () => {
    const error = new Error('falla');
    mock.method(notificacionesService, 'marcarLeida', async () => {
      throw error;
    });
    const res = crearRes();

    await assert.rejects(
      notificacionesController.marcarLeida({ usuario: USUARIO, params: { id: '7' } }, res),
      error,
    );
    assert.equal(res.terminada, false);
  });
});
