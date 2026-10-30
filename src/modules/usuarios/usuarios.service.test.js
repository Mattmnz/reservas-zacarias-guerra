const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const { sql } = db;
const AppError = require('../../shared/AppError');
const auditoriaService = require('../auditoria/auditoria.service');
const usuariosService = require('./usuarios.service');

const ADMIN_ID = 3;

// Imita pool/transacción: guarda inputs y texto de cada request y responde en orden.
// Una respuesta Error se lanza, como un fallo de SQL Server.
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
          const respuesta = respuestas.shift() ?? [];
          if (respuesta instanceof Error) throw respuesta;
          return { recordset: respuesta };
        },
      };
      return req;
    },
  };
}

function usarPool(ejecutor) {
  mock.method(db, 'obtenerPool', async () => ejecutor);
}

function usarTransaccion(tx) {
  mock.method(db, 'enTransaccion', async (fn) => fn(tx));
}

function esAppError(status, codigo, mensaje) {
  return (err) => {
    assert.ok(err instanceof AppError, `se esperaba AppError y llegó ${err}`);
    assert.equal(err.status, status);
    assert.equal(err.codigo, codigo);
    if (mensaje) assert.match(err.message, mensaje);
    return true;
  };
}

const esValidacion = (mensaje) => esAppError(400, 'VALIDACION', mensaje);
const esNoEncontrado = (mensaje) => esAppError(404, 'NO_ENCONTRADO', mensaje);

const FILA_CLIENTE = Object.freeze({
  Id: 7,
  Nombre: 'Ana Pérez',
  Correo: 'ana@prueba.local',
  Telefono: '88887777',
  Rol: 'CLIENTE',
  Activo: true,
  CreadoEn: new Date('2026-10-20T13:05:09Z'),
});

const FILA_ADMIN = Object.freeze({
  Id: 3,
  Nombre: 'Admin',
  Correo: 'admin@prueba.local',
  Telefono: '88880000',
  Rol: 'ADMIN',
  Activo: true,
  CreadoEn: new Date('2026-10-01T08:00:00Z'),
});

const USUARIO_CLIENTE = Object.freeze({
  id: 7,
  nombre: 'Ana Pérez',
  correo: 'ana@prueba.local',
  telefono: '88887777',
  rol: 'CLIENTE',
  activo: true,
  creadoEn: '2026-10-20T13:05:09',
});

const IDS_INVALIDOS = [
  ['no numérico', 'abc'],
  ['0', '0'],
  ['negativo', '-1'],
  ['decimal', '1.5'],
  ['vacío', ''],
  ['fuera de INT', '2147483648'],
];

beforeEach(() => {
  // Si alguna llamada escapa a los mocks, la prueba falla en vez de abrir una conexión.
  const conexionProhibida = async () => {
    throw new Error('la prueba intentó conectarse');
  };
  mock.method(db, 'obtenerPool', conexionProhibida);
  mock.method(db, 'enTransaccion', conexionProhibida);
  mock.method(auditoriaService, 'registrar', async () => {});
});

afterEach(() => mock.restoreAll());

describe('listar', () => {
  it('devuelve los usuarios sin hash, con creadoEn como texto, ordenados por Nombre e Id', async () => {
    const pool = crearEjecutorFalso([FILA_ADMIN, FILA_CLIENTE]);
    usarPool(pool);

    const resultado = await usuariosService.listar({});

    assert.equal(resultado.length, 2);
    assert.deepEqual(resultado[1], USUARIO_CLIENTE);
    assert.equal(resultado[0].creadoEn, '2026-10-01T08:00:00');
    for (const usuario of resultado) assert.ok(!('passwordHash' in usuario));
    const { inputs, texto } = pool.llamadas[0];
    assert.doesNotMatch(texto, /PasswordHash/);
    assert.match(texto, /ORDER BY Nombre, Id/);
    assert.equal(inputs.rol.valor, null);
    assert.equal(inputs.activo.valor, null);
  });

  it('acepta la consulta ausente', async () => {
    usarPool(crearEjecutorFalso());
    assert.deepEqual(await usuariosService.listar(undefined), []);
  });

  for (const rol of ['CLIENTE', 'ADMIN']) {
    it(`filtra por rol ${rol} con VarChar(10)`, async () => {
      const pool = crearEjecutorFalso();
      usarPool(pool);
      await usuariosService.listar({ rol });

      const { inputs } = pool.llamadas[0];
      assert.equal(inputs.rol.tipo.type, sql.VarChar);
      assert.equal(inputs.rol.tipo.length, 10);
      assert.equal(inputs.rol.valor, rol);
    });
  }

  for (const [texto, esperado] of [['true', true], ['false', false]]) {
    it(`filtra por activo=${texto} como Bit ${esperado}`, async () => {
      const pool = crearEjecutorFalso();
      usarPool(pool);
      await usuariosService.listar({ activo: texto });

      const { inputs } = pool.llamadas[0];
      assert.equal(inputs.activo.tipo, sql.Bit);
      assert.equal(inputs.activo.valor, esperado);
    });
  }

  it('combina los dos filtros', async () => {
    const pool = crearEjecutorFalso();
    usarPool(pool);
    await usuariosService.listar({ rol: 'CLIENTE', activo: 'false' });

    const { inputs } = pool.llamadas[0];
    assert.equal(inputs.rol.valor, 'CLIENTE');
    assert.equal(inputs.activo.valor, false);
  });

  const invalidos = [
    ['rol desconocido', { rol: 'SUPER' }, /^rol:/],
    ['rol en minúsculas', { rol: 'admin' }, /^rol:/],
    ['rol vacío', { rol: '' }, /^rol:/],
    ['rol repetido', { rol: ['ADMIN', 'CLIENTE'] }, /^rol:/],
    ['activo 1', { activo: '1' }, /^activo:/],
    ['activo TRUE', { activo: 'TRUE' }, /^activo:/],
    ['activo vacío', { activo: '' }, /^activo:/],
    ['activo repetido', { activo: ['true', 'false'] }, /^activo:/],
  ];

  for (const [caso, consulta, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin pedir el pool`, async () => {
      await assert.rejects(usuariosService.listar(consulta), esValidacion(mensaje));
      assert.equal(db.obtenerPool.mock.callCount(), 0);
    });
  }
});

describe('actualizar', () => {
  it('lee el usuario con UPDLOCK y devuelve 404 si no existe, sin UPDATE ni auditoría', async () => {
    const tx = crearEjecutorFalso([]);
    usarTransaccion(tx);

    await assert.rejects(usuariosService.actualizar(ADMIN_ID, '99', { rol: 'ADMIN' }), esNoEncontrado());
    assert.equal(tx.llamadas.length, 1);
    assert.match(tx.llamadas[0].texto, /FROM Usuario WITH \(UPDLOCK\)/);
    assert.doesNotMatch(tx.llamadas[0].texto, /PasswordHash/);
    assert.equal(tx.llamadas[0].inputs.id.tipo, sql.Int);
    assert.equal(tx.llamadas[0].inputs.id.valor, 99);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
  });

  it('cambia el rol, audita CAMBIAR_ROL con la transacción recibida y devuelve el usuario', async () => {
    const tx = crearEjecutorFalso([FILA_CLIENTE], []);
    usarTransaccion(tx);

    const usuario = await usuariosService.actualizar(ADMIN_ID, '7', { rol: 'ADMIN', motivo: '  Nuevo encargado  ' });

    assert.deepEqual(usuario, { ...USUARIO_CLIENTE, rol: 'ADMIN' });
    assert.equal(tx.llamadas.length, 2);
    const { inputs, texto } = tx.llamadas[1];
    assert.match(texto, /UPDATE Usuario SET Rol = @rol WHERE Id = @id/);
    assert.equal(inputs.rol.tipo.type, sql.VarChar);
    assert.equal(inputs.rol.valor, 'ADMIN');
    assert.equal(inputs.id.valor, 7);

    assert.equal(auditoriaService.registrar.mock.callCount(), 1);
    const [ejecutor, datos] = auditoriaService.registrar.mock.calls[0].arguments;
    assert.equal(ejecutor, tx);
    assert.deepEqual(datos, {
      entidad: 'USUARIO',
      entidadId: 7,
      accion: 'CAMBIAR_ROL',
      estadoAnterior: 'CLIENTE',
      estadoNuevo: 'ADMIN',
      usuarioId: ADMIN_ID,
      motivo: 'Nuevo encargado',
    });
  });

  it('desactiva y audita DESACTIVAR (ACTIVO → INACTIVO) con motivo null', async () => {
    const tx = crearEjecutorFalso([FILA_CLIENTE], []);
    usarTransaccion(tx);

    const usuario = await usuariosService.actualizar(ADMIN_ID, '7', { activo: false });

    assert.deepEqual(usuario, { ...USUARIO_CLIENTE, activo: false });
    const { inputs, texto } = tx.llamadas[1];
    assert.match(texto, /UPDATE Usuario SET Activo = @activo WHERE Id = @id/);
    assert.equal(inputs.activo.tipo, sql.Bit);
    assert.equal(inputs.activo.valor, false);

    const [ejecutor, datos] = auditoriaService.registrar.mock.calls[0].arguments;
    assert.equal(ejecutor, tx);
    assert.deepEqual(datos, {
      entidad: 'USUARIO',
      entidadId: 7,
      accion: 'DESACTIVAR',
      estadoAnterior: 'ACTIVO',
      estadoNuevo: 'INACTIVO',
      usuarioId: ADMIN_ID,
      motivo: null,
    });
  });

  it('activa y audita ACTIVAR (INACTIVO → ACTIVO)', async () => {
    usarTransaccion(crearEjecutorFalso([{ ...FILA_CLIENTE, Activo: false }], []));

    const usuario = await usuariosService.actualizar(ADMIN_ID, '7', { activo: true, motivo: 'Pagó la deuda' });

    assert.equal(usuario.activo, true);
    const datos = auditoriaService.registrar.mock.calls[0].arguments[1];
    assert.equal(datos.accion, 'ACTIVAR');
    assert.equal(datos.estadoAnterior, 'INACTIVO');
    assert.equal(datos.estadoNuevo, 'ACTIVO');
    assert.equal(datos.motivo, 'Pagó la deuda');
  });

  const sinCambios = [
    ['rol igual al actual', { rol: 'CLIENTE', motivo: 'Sin efecto' }],
    ['activo igual al actual', { activo: true }],
  ];

  for (const [caso, body] of sinCambios) {
    it(`${caso} → 200 con el usuario, sin UPDATE ni auditoría`, async () => {
      const tx = crearEjecutorFalso([FILA_CLIENTE]);
      usarTransaccion(tx);

      assert.deepEqual(await usuariosService.actualizar(ADMIN_ID, '7', body), USUARIO_CLIENTE);
      assert.equal(tx.llamadas.length, 1);
      assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    });
  }

  it('acepta motivo de exactamente 250 caracteres', async () => {
    usarTransaccion(crearEjecutorFalso([FILA_CLIENTE], []));
    await usuariosService.actualizar(ADMIN_ID, '7', { rol: 'ADMIN', motivo: 'm'.repeat(250) });
    assert.equal(auditoriaService.registrar.mock.calls[0].arguments[1].motivo.length, 250);
  });

  it('un fallo de la auditoría se propaga para que la transacción revierta el UPDATE', async () => {
    const fallo = new Error('fallo al insertar auditoría');
    mock.method(auditoriaService, 'registrar', async () => {
      throw fallo;
    });
    usarTransaccion(crearEjecutorFalso([FILA_CLIENTE], []));

    await assert.rejects(usuariosService.actualizar(ADMIN_ID, '7', { activo: false }), (err) => err === fallo);
  });

  for (const body of [{ rol: 'CLIENTE' }, { activo: false }, { activo: true }]) {
    it(`el admin sobre sí mismo con ${JSON.stringify(body)} → 400 VALIDACION sin abrir transacción`, async () => {
      await assert.rejects(
        usuariosService.actualizar(ADMIN_ID, String(ADMIN_ID), body),
        esValidacion(/propio usuario/),
      );
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }

  for (const [caso, id] of IDS_INVALIDOS) {
    it(`rechaza id ${caso} con 400 VALIDACION sin abrir transacción`, async () => {
      await assert.rejects(usuariosService.actualizar(ADMIN_ID, id, { rol: 'ADMIN' }), esValidacion(/^id:/));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }

  const invalidos = [
    ['body ausente', undefined, /rol o activo/],
    ['body vacío', {}, /rol o activo/],
    ['solo motivo', { motivo: 'Algo' }, /rol o activo/],
    ['rol y activo juntos', { rol: 'ADMIN', activo: true }, /rol o activo/],
    ['rol desconocido', { rol: 'SUPER' }, /^rol:/],
    ['rol en minúsculas', { rol: 'admin' }, /^rol:/],
    ['rol null', { rol: null }, /^rol:/],
    ['rol no texto', { rol: 1 }, /^rol:/],
    ['activo como texto', { activo: 'true' }, /^activo:/],
    ['activo como número', { activo: 1 }, /^activo:/],
    ['activo null', { activo: null }, /^activo:/],
    ['motivo vacío', { rol: 'ADMIN', motivo: '' }, /^motivo:/],
    ['motivo solo espacios', { rol: 'ADMIN', motivo: '   ' }, /^motivo:/],
    ['motivo no texto', { rol: 'ADMIN', motivo: 5 }, /^motivo:/],
    ['motivo de 251 caracteres', { rol: 'ADMIN', motivo: 'm'.repeat(251) }, /^motivo:/],
  ];

  for (const [caso, body, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin abrir transacción`, async () => {
      await assert.rejects(usuariosService.actualizar(ADMIN_ID, '7', body), esValidacion(mensaje));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }
});