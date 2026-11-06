const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const disponibilidadService = require('./disponibilidad.service');
const disponibilidadController = require('./disponibilidad.controller');

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

const DISPONIBILIDAD = [
  { canchaId: 1, nombre: 'Sala 1', tipoCodigo: 'SALA', precioHora: 600, bloques: ['2026-10-21T07:00:00'] },
];

afterEach(() => mock.restoreAll());

describe('disponibilidad.controller', () => {
  it('consultar pasa el query string completo y responde 200 con { data }', async () => {
    const consultar = mock.method(disponibilidadService, 'consultar', async () => DISPONIBILIDAD);
    const res = crearRes();
    const query = { fecha: '2026-10-21', tipo: 'SALA' };

    await disponibilidadController.consultar({ usuario: { id: 5, rol: 'CLIENTE' }, query }, res);

    assert.deepEqual(consultar.mock.calls[0].arguments, [query]);
    assert.equal(res.estado, 200);
    assert.deepEqual(res.cuerpo, { data: DISPONIBILIDAD });
  });
});
