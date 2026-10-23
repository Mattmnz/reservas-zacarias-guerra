const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const auditoriaService = require('./auditoria.service');
const auditoriaController = require('./auditoria.controller');

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

afterEach(() => mock.restoreAll());

describe('auditoria.controller.listar', () => {
  it('pasa el query al service y responde 200 con { data }', async () => {
    const registros = [{ id: 1, entidad: 'RESERVA' }];
    const listar = mock.method(auditoriaService, 'listar', async () => registros);
    const query = { entidad: 'RESERVA', entidadId: '1' };
    const res = crearRes();

    await auditoriaController.listar({ query }, res);

    assert.equal(listar.mock.callCount(), 1);
    assert.equal(listar.mock.calls[0].arguments[0], query);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: registros });
  });

  it('deja que el error del service siga hacia manejarErrores', async () => {
    const error = new Error('falla');
    mock.method(auditoriaService, 'listar', async () => {
      throw error;
    });
    await assert.rejects(auditoriaController.listar({ query: {} }, crearRes()), error);
  });
});
