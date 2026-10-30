const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const horariosService = require('./horarios.service');
const horariosController = require('./horarios.controller');

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

const DIAS = [{ diaSemana: 1, apertura: '07:00', cierre: '22:00' }];

afterEach(() => mock.restoreAll());

describe('horarios.controller', () => {
  it('listar pasa el rol del usuario y el id de la ruta; responde 200 con { data }', async () => {
    const listar = mock.method(horariosService, 'listar', async () => DIAS);
    const res = crearRes();

    await horariosController.listar({ usuario: { id: 5, rol: 'CLIENTE' }, params: { id: '3' } }, res);

    assert.deepEqual(listar.mock.calls[0].arguments, ['CLIENTE', '3']);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: DIAS });
  });

  it('reemplazar pasa el id de la ruta y el cuerpo; responde 200 con { data }', async () => {
    const reemplazar = mock.method(horariosService, 'reemplazar', async () => DIAS);
    const res = crearRes();
    const body = { dias: DIAS };

    await horariosController.reemplazar({ usuario: { id: 1, rol: 'ADMIN' }, params: { id: '3' }, body }, res);

    assert.deepEqual(reemplazar.mock.calls[0].arguments, ['3', body]);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: DIAS });
  });
});
