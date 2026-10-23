const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const { sql } = db;
const AppError = require('../../shared/AppError');
const auditoriaService = require('./auditoria.service');

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

const BASE = Object.freeze({
  entidad: 'RESERVA',
  entidadId: 12,
  accion: 'CANCELAR',
  estadoAnterior: 'PAGADA',
  estadoNuevo: 'CANCELADA',
  usuarioId: 3,
  motivo: 'Cancelación con 0 %',
});

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

describe('registrar', () => {
  it('inserta con los tipos de 001_esquema.sql y Fecha = ahora de Nicaragua', async () => {
    const ejecutor = crearEjecutorFalso();
    const resultado = await auditoriaService.registrar(ejecutor, BASE);

    assert.equal(resultado, undefined);
    assert.equal(ejecutor.llamadas.length, 1);
    const { inputs, texto } = ejecutor.llamadas[0];
    assert.match(texto, /INSERT INTO Auditoria/);

    const esperados = {
      entidad: [sql.VarChar, 10, 'RESERVA'],
      accion: [sql.VarChar, 30, 'CANCELAR'],
      estadoAnterior: [sql.VarChar, 20, 'PAGADA'],
      estadoNuevo: [sql.VarChar, 20, 'CANCELADA'],
      motivo: [sql.NVarChar, 250, 'Cancelación con 0 %'],
    };
    for (const [nombre, [tipo, largo, valor]] of Object.entries(esperados)) {
      assert.equal(inputs[nombre].tipo.type, tipo, nombre);
      assert.equal(inputs[nombre].tipo.length, largo, nombre);
      assert.equal(inputs[nombre].valor, valor, nombre);
    }
    assert.equal(inputs.entidadId.tipo, sql.Int);
    assert.equal(inputs.entidadId.valor, 12);
    assert.equal(inputs.usuarioId.tipo, sql.Int);
    assert.equal(inputs.usuarioId.valor, 3);
    assert.equal(inputs.fecha.tipo.type, sql.DateTime2);
    assert.equal(inputs.fecha.tipo.scale, 0);
    assert.equal(inputs.fecha.valor.getTime(), AHORA_NICARAGUA.getTime());
  });

  it('usa el ejecutor recibido y no abre conexión ni transacción propia', async () => {
    await auditoriaService.registrar(crearEjecutorFalso(), BASE);
    assert.equal(db.obtenerPool.mock.callCount(), 0);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
  });

  it('acepta null en estados, usuario (acción del sistema) y motivo', async () => {
    const ejecutor = crearEjecutorFalso();
    await auditoriaService.registrar(ejecutor, {
      ...BASE,
      estadoAnterior: null,
      estadoNuevo: null,
      usuarioId: null,
      motivo: null,
    });
    const { inputs } = ejecutor.llamadas[0];
    for (const campo of ['estadoAnterior', 'estadoNuevo', 'usuarioId', 'motivo']) {
      assert.equal(inputs[campo].valor, null, campo);
    }
  });

  it('toma como null los campos opcionales omitidos', async () => {
    const ejecutor = crearEjecutorFalso();
    await auditoriaService.registrar(ejecutor, { entidad: 'CANCHA', entidadId: 1, accion: 'BAJA' });
    const { inputs } = ejecutor.llamadas[0];
    for (const campo of ['estadoAnterior', 'estadoNuevo', 'usuarioId', 'motivo']) {
      assert.equal(inputs[campo].valor, null, campo);
    }
  });

  it('acepta motivo de exactamente 250 caracteres', async () => {
    const ejecutor = crearEjecutorFalso();
    await auditoriaService.registrar(ejecutor, { ...BASE, motivo: 'm'.repeat(250) });
    assert.equal(ejecutor.llamadas[0].inputs.motivo.valor.length, 250);
  });

  const invalidos = [
    ['entidad desconocida', { entidad: 'PAGO' }, RangeError],
    ['entidad en minúscula', { entidad: 'reserva' }, RangeError],
    ['entidadId 0', { entidadId: 0 }, TypeError],
    ['entidadId decimal', { entidadId: 1.5 }, TypeError],
    ['entidadId como texto', { entidadId: '12' }, TypeError],
    ['entidadId fuera de INT', { entidadId: 2147483648 }, TypeError],
    ['accion vacía', { accion: '  ' }, TypeError],
    ['accion de 31 caracteres', { accion: 'A'.repeat(31) }, RangeError],
    ['estadoNuevo de 21 caracteres', { estadoNuevo: 'E'.repeat(21) }, RangeError],
    ['estadoAnterior no texto', { estadoAnterior: 5 }, TypeError],
    ['usuarioId negativo', { usuarioId: -1 }, TypeError],
    ['motivo de 251 caracteres', { motivo: 'm'.repeat(251) }, RangeError],
    ['motivo vacío', { motivo: '' }, TypeError],
  ];

  for (const [caso, cambio, tipoError] of invalidos) {
    it(`rechaza ${caso} con ${tipoError.name} sin consultar`, async () => {
      const ejecutor = crearEjecutorFalso();
      await assert.rejects(auditoriaService.registrar(ejecutor, { ...BASE, ...cambio }), tipoError);
      assert.equal(ejecutor.llamadas.length, 0);
    });
  }
});

describe('listar', () => {
  const FILA = {
    Id: '9007',
    Entidad: 'RESERVA',
    EntidadId: 12,
    Accion: 'CREAR',
    EstadoAnterior: null,
    EstadoNuevo: 'PAGADA',
    UsuarioId: 3,
    Motivo: null,
    Fecha: new Date('2026-10-20T19:05:00Z'),
  };

  it('pasa por db.obtenerPool: sin reemplazarlo, falla en lugar de conectarse', async () => {
    await assert.rejects(auditoriaService.listar({}), /la prueba intentó conectarse/);
  });

  it('con el pool reemplazado devuelve las filas del ejecutor falso, mapeadas', async () => {
    const ejecutor = crearEjecutorFalso([FILA]);
    usarPool(ejecutor);

    const resultado = await auditoriaService.listar({});

    assert.equal(db.obtenerPool.mock.callCount(), 1);
    assert.deepEqual(resultado, [
      {
        id: 9007,
        entidad: 'RESERVA',
        entidadId: 12,
        accion: 'CREAR',
        estadoAnterior: null,
        estadoNuevo: 'PAGADA',
        usuarioId: 3,
        motivo: null,
        fecha: '2026-10-20T19:05:00',
      },
    ]);
  });

  it('sin filtros envía null y ordena por Fecha e Id descendentes', async () => {
    const ejecutor = crearEjecutorFalso();
    usarPool(ejecutor);
    await auditoriaService.listar({});

    const { inputs, texto } = ejecutor.llamadas[0];
    assert.equal(inputs.entidad.valor, null);
    assert.equal(inputs.entidadId.valor, null);
    assert.match(texto, /ORDER BY Fecha DESC, Id DESC/);
  });

  it('acepta la consulta ausente', async () => {
    usarPool(crearEjecutorFalso());
    assert.deepEqual(await auditoriaService.listar(undefined), []);
  });

  it('convierte los filtros del query string', async () => {
    const ejecutor = crearEjecutorFalso();
    usarPool(ejecutor);
    await auditoriaService.listar({ entidad: 'CANCHA', entidadId: '4' });

    const { inputs } = ejecutor.llamadas[0];
    assert.equal(inputs.entidad.valor, 'CANCHA');
    assert.equal(inputs.entidad.tipo.type, sql.VarChar);
    assert.equal(inputs.entidadId.valor, 4);
    assert.equal(inputs.entidadId.tipo, sql.Int);
  });

  const invalidos = [
    ['entidad desconocida', { entidad: 'PAGO' }],
    ['entidad en minúscula', { entidad: 'reserva' }],
    ['entidad vacía', { entidad: '' }],
    ['entidad repetida', { entidad: ['RESERVA', 'CANCHA'] }],
    ['entidadId no numérico', { entidadId: 'abc' }],
    ['entidadId 0', { entidadId: '0' }],
    ['entidadId negativo', { entidadId: '-1' }],
    ['entidadId decimal', { entidadId: '1.5' }],
    ['entidadId vacío', { entidadId: '' }],
    ['entidadId fuera de INT', { entidadId: '2147483648' }],
    ['entidadId repetido', { entidadId: ['1', '2'] }],
  ];

  for (const [caso, consulta] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION`, async () => {
      await assert.rejects(
        auditoriaService.listar(consulta),
        (err) => err instanceof AppError && err.status === 400 && err.codigo === 'VALIDACION',
      );
      // La validación ocurre antes de pedir el pool.
      assert.equal(db.obtenerPool.mock.callCount(), 0);
    });
  }
});
