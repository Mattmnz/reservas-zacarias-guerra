const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const { sql } = db;
const AppError = require('../../shared/AppError');
const notificacionesService = require('./notificaciones.service');

const AHORA_UTC = Date.UTC(2026, 9, 20, 19, 0, 0);
const AHORA_NICARAGUA = new Date('2026-10-20T13:00:00Z');

// Imita pool/transacción: guarda inputs y texto de cada request y responde los recordsets en orden.
function crearEjecutorFalso(...respuestas) {
  const llamadas = [];
  return {
    llamadas,
    request() {
      const llamada = { inputs: {}, texto: null };
      llamadas.push(llamada);
      const req = {
        input(nombre, tipo, valor) {
          llamada.inputs[nombre] = { tipo, valor };
          return req;
        },
        async query(texto) {
          llamada.texto = texto;
          return { recordset: respuestas.shift() ?? [] };
        },
      };
      return req;
    },
  };
}

function usarPool(ejecutor) {
  mock.method(db, 'obtenerPool', async () => ejecutor);
}

function esAppError(status, codigo) {
  return (err) => err instanceof AppError && err.status === status && err.codigo === codigo;
}

beforeEach(() => {
  mock.method(Date, 'now', () => AHORA_UTC);
  // Si alguna llamada escapa a los mocks, la prueba falla en vez de abrir una conexión.
  const conexionProhibida = async () => {
    throw new Error('la prueba intentó conectarse');
  };
  mock.method(db, 'obtenerPool', conexionProhibida);
  mock.method(db, 'enTransaccion', conexionProhibida);
});

afterEach(() => mock.restoreAll());

describe('crear', () => {
  const BASE = Object.freeze({ usuarioId: 3, reservaId: 12, mensaje: 'Reserva #12 pagada' });

  it('inserta con Leida = 0, los tipos de 001_esquema.sql y CreadaEn = ahora de Nicaragua', async () => {
    const ejecutor = crearEjecutorFalso();
    const resultado = await notificacionesService.crear(ejecutor, BASE);

    assert.equal(resultado, undefined);
    assert.equal(ejecutor.llamadas.length, 1);
    const { inputs, texto } = ejecutor.llamadas[0];
    assert.match(texto, /INSERT INTO Notificacion/);
    assert.match(texto, /VALUES \(@usuarioId, @reservaId, @mensaje, 0, @creadaEn\)/);

    assert.equal(inputs.usuarioId.tipo, sql.Int);
    assert.equal(inputs.usuarioId.valor, 3);
    assert.equal(inputs.reservaId.tipo, sql.Int);
    assert.equal(inputs.reservaId.valor, 12);
    assert.equal(inputs.mensaje.tipo.type, sql.NVarChar);
    assert.equal(inputs.mensaje.tipo.length, 500);
    assert.equal(inputs.mensaje.valor, 'Reserva #12 pagada');
    assert.equal(inputs.creadaEn.tipo.type, sql.DateTime2);
    assert.equal(inputs.creadaEn.tipo.scale, 0);
    assert.equal(inputs.creadaEn.valor.getTime(), AHORA_NICARAGUA.getTime());
  });

  it('usa el ejecutor recibido y no abre conexión ni transacción propia', async () => {
    await notificacionesService.crear(crearEjecutorFalso(), BASE);
    assert.equal(db.obtenerPool.mock.callCount(), 0);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
  });

  it('acepta reservaId null u omitido', async () => {
    for (const datos of [{ ...BASE, reservaId: null }, { usuarioId: 3, mensaje: 'Hola' }]) {
      const ejecutor = crearEjecutorFalso();
      await notificacionesService.crear(ejecutor, datos);
      assert.equal(ejecutor.llamadas[0].inputs.reservaId.valor, null);
    }
  });

  it('acepta mensaje de exactamente 500 caracteres', async () => {
    const ejecutor = crearEjecutorFalso();
    await notificacionesService.crear(ejecutor, { ...BASE, mensaje: 'm'.repeat(500) });
    assert.equal(ejecutor.llamadas[0].inputs.mensaje.valor.length, 500);
  });

  const invalidos = [
    ['usuarioId ausente', { usuarioId: undefined }, TypeError],
    ['usuarioId null', { usuarioId: null }, TypeError],
    ['usuarioId 0', { usuarioId: 0 }, TypeError],
    ['usuarioId como texto', { usuarioId: '3' }, TypeError],
    ['reservaId decimal', { reservaId: 1.5 }, TypeError],
    ['reservaId fuera de INT', { reservaId: 2147483648 }, TypeError],
    ['mensaje vacío', { mensaje: '   ' }, TypeError],
    ['mensaje no texto', { mensaje: 42 }, TypeError],
    ['mensaje de 501 caracteres', { mensaje: 'm'.repeat(501) }, RangeError],
  ];

  for (const [caso, cambio, tipoError] of invalidos) {
    it(`rechaza ${caso} con ${tipoError.name} sin consultar`, async () => {
      const ejecutor = crearEjecutorFalso();
      await assert.rejects(notificacionesService.crear(ejecutor, { ...BASE, ...cambio }), tipoError);
      assert.equal(ejecutor.llamadas.length, 0);
    });
  }
});

describe('listarMias', () => {
  it('pasa por db.obtenerPool: sin reemplazarlo, falla en lugar de conectarse', async () => {
    await assert.rejects(notificacionesService.listarMias(3), /la prueba intentó conectarse/);
  });

  it('filtra por el usuario, ordena por recientes y formatea la fecha', async () => {
    const ejecutor = crearEjecutorFalso([
      { Id: 8, ReservaId: 12, Mensaje: 'Cancelada', Leida: false, CreadaEn: new Date('2026-10-20T18:00:00Z') },
      { Id: 5, ReservaId: null, Mensaje: 'Bienvenida', Leida: true, CreadaEn: new Date('2026-10-19T08:30:00Z') },
    ]);
    usarPool(ejecutor);

    const resultado = await notificacionesService.listarMias(3);

    assert.equal(db.obtenerPool.mock.callCount(), 1);
    const { inputs, texto } = ejecutor.llamadas[0];
    assert.equal(inputs.usuarioId.valor, 3);
    assert.match(texto, /WHERE UsuarioId = @usuarioId/);
    assert.match(texto, /ORDER BY CreadaEn DESC, Id DESC/);
    assert.deepEqual(resultado, [
      { id: 8, reservaId: 12, mensaje: 'Cancelada', leida: false, creadaEn: '2026-10-20T18:00:00' },
      { id: 5, reservaId: null, mensaje: 'Bienvenida', leida: true, creadaEn: '2026-10-19T08:30:00' },
    ]);
  });
});

describe('marcarLeida', () => {
  for (const id of ['abc', '0', '-1', '1.5', '', '2147483648', undefined]) {
    it(`rechaza el id ${JSON.stringify(id)} con 400 VALIDACION sin consultar`, async () => {
      await assert.rejects(notificacionesService.marcarLeida(3, id), esAppError(400, 'VALIDACION'));
      assert.equal(db.obtenerPool.mock.callCount(), 0);
    });
  }

  it('inexistente → 404 NO_ENCONTRADO, sin UPDATE', async () => {
    const ejecutor = crearEjecutorFalso([]);
    usarPool(ejecutor);
    await assert.rejects(notificacionesService.marcarLeida(3, '99'), esAppError(404, 'NO_ENCONTRADO'));
    assert.equal(ejecutor.llamadas.length, 1);
    assert.equal(ejecutor.llamadas[0].inputs.id.valor, 99);
  });

  it('de otro usuario → 403 SIN_PERMISO, sin UPDATE', async () => {
    const ejecutor = crearEjecutorFalso([{ Id: 7, UsuarioId: 4 }]);
    usarPool(ejecutor);
    await assert.rejects(notificacionesService.marcarLeida(3, '7'), esAppError(403, 'SIN_PERMISO'));
    assert.equal(ejecutor.llamadas.length, 1);
  });

  it('propia → marca Leida = 1 y no devuelve nada', async () => {
    const ejecutor = crearEjecutorFalso([{ Id: 7, UsuarioId: 3 }]);
    usarPool(ejecutor);

    assert.equal(await notificacionesService.marcarLeida(3, '7'), undefined);
    assert.equal(ejecutor.llamadas.length, 2);
    const actualizacion = ejecutor.llamadas[1];
    assert.match(actualizacion.texto, /UPDATE Notificacion SET Leida = 1 WHERE Id = @id/);
    assert.equal(actualizacion.inputs.id.tipo, sql.Int);
    assert.equal(actualizacion.inputs.id.valor, 7);
  });
});
