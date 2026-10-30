const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const { sql } = db;
const AppError = require('../../shared/AppError');
const auditoriaService = require('../auditoria/auditoria.service');
const canchasService = require('./canchas.service');

const AHORA_UTC = Date.UTC(2026, 9, 20, 19, 0, 0);
const AHORA_NICARAGUA = new Date('2026-10-20T13:00:00Z');

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

function errorSql(number) {
  return Object.assign(new Error(`error SQL ${number}`), { number });
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

const FILA_SALA = Object.freeze({
  Id: 1,
  Nombre: 'Sala 1',
  Activa: true,
  TipoCanchaId: 1,
  TipoCodigo: 'SALA',
  TipoNombre: 'Fútbol sala',
  PrecioHora: 600,
});

const FILA_CAMPO = Object.freeze({
  Id: 6,
  Nombre: 'Campo 1',
  Activa: true,
  TipoCanchaId: 2,
  TipoCodigo: 'CAMPO',
  TipoNombre: 'Fútbol campo',
  PrecioHora: 1200,
});

const TIPO_SALA = Object.freeze({ Id: 1, Codigo: 'SALA', Nombre: 'Fútbol sala', PrecioHora: 600 });
const TIPO_CAMPO = Object.freeze({ Id: 2, Codigo: 'CAMPO', Nombre: 'Fútbol campo', PrecioHora: 1200 });

const CANCHA_SALA = Object.freeze({
  id: 1,
  nombre: 'Sala 1',
  activa: true,
  tipoCanchaId: 1,
  tipoCodigo: 'SALA',
  tipoNombre: 'Fútbol sala',
  precioHora: 600,
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
  mock.method(Date, 'now', () => AHORA_UTC);
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
  it('devuelve las activas mapeadas, ordenadas por Id, con precioHora número', async () => {
    const pool = crearEjecutorFalso([FILA_SALA, FILA_CAMPO]);
    usarPool(pool);

    const resultado = await canchasService.listar('CLIENTE', {});

    assert.deepEqual(resultado[0], CANCHA_SALA);
    assert.equal(resultado[1].precioHora, 1200);
    const { inputs, texto } = pool.llamadas[0];
    assert.match(texto, /ORDER BY c\.Id/);
    assert.equal(inputs.tipo.valor, null);
    assert.equal(inputs.incluirInactivas.tipo, sql.Bit);
    assert.equal(inputs.incluirInactivas.valor, false);
  });

  it('acepta la consulta ausente', async () => {
    usarPool(crearEjecutorFalso());
    assert.deepEqual(await canchasService.listar('CLIENTE', undefined), []);
  });

  it('filtra por tipo con VarChar(10)', async () => {
    const pool = crearEjecutorFalso();
    usarPool(pool);
    await canchasService.listar('CLIENTE', { tipo: 'SALA' });

    const { inputs } = pool.llamadas[0];
    assert.equal(inputs.tipo.tipo.type, sql.VarChar);
    assert.equal(inputs.tipo.tipo.length, 10);
    assert.equal(inputs.tipo.valor, 'SALA');
  });

  it('trata ?tipo= vacío como ausente', async () => {
    const pool = crearEjecutorFalso();
    usarPool(pool);
    await canchasService.listar('CLIENTE', { tipo: '' });
    assert.equal(pool.llamadas[0].inputs.tipo.valor, null);
  });

  const casosInactivas = [
    ['ADMIN', 'true', true],
    ['CLIENTE', 'true', false],
    ['ADMIN', '1', false],
    ['ADMIN', 'TRUE', false],
    ['ADMIN', undefined, false],
  ];

  for (const [rol, valor, esperado] of casosInactivas) {
    it(`incluirInactivas=${valor} con rol ${rol} → ${esperado}`, async () => {
      const pool = crearEjecutorFalso();
      usarPool(pool);
      await canchasService.listar(rol, { incluirInactivas: valor });
      assert.equal(pool.llamadas[0].inputs.incluirInactivas.valor, esperado);
    });
  }

  const invalidos = [
    ['tipo repetido', { tipo: ['SALA', 'CAMPO'] }],
    ['tipo de 11 caracteres', { tipo: 'A'.repeat(11) }],
    ['tipo no texto', { tipo: 5 }],
  ];

  for (const [caso, consulta] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin pedir el pool`, async () => {
      await assert.rejects(canchasService.listar('ADMIN', consulta), esValidacion(/^tipo:/));
      assert.equal(db.obtenerPool.mock.callCount(), 0);
    });
  }
});

describe('obtener', () => {
  it('devuelve la cancha existente', async () => {
    const pool = crearEjecutorFalso([FILA_SALA]);
    usarPool(pool);

    assert.deepEqual(await canchasService.obtener('CLIENTE', '1'), CANCHA_SALA);
    assert.equal(pool.llamadas[0].inputs.id.tipo, sql.Int);
    assert.equal(pool.llamadas[0].inputs.id.valor, 1);
  });

  it('inexistente → 404', async () => {
    usarPool(crearEjecutorFalso([]));
    await assert.rejects(canchasService.obtener('ADMIN', '99'), esNoEncontrado());
  });

  it('inactiva para un cliente → el mismo 404 que una inexistente', async () => {
    usarPool(crearEjecutorFalso([]));
    const inexistente = await canchasService.obtener('CLIENTE', '99').catch((e) => e);
    usarPool(crearEjecutorFalso([{ ...FILA_SALA, Activa: false }]));
    const inactiva = await canchasService.obtener('CLIENTE', '1').catch((e) => e);

    assert.equal(inactiva.status, 404);
    assert.equal(inactiva.codigo, 'NO_ENCONTRADO');
    assert.equal(inactiva.message, inexistente.message);
  });

  it('inactiva para un admin → la devuelve', async () => {
    usarPool(crearEjecutorFalso([{ ...FILA_SALA, Activa: false }]));
    const cancha = await canchasService.obtener('ADMIN', '1');
    assert.equal(cancha.activa, false);
  });

  for (const [caso, id] of IDS_INVALIDOS) {
    it(`rechaza id ${caso} con 400 VALIDACION sin pedir el pool`, async () => {
      await assert.rejects(canchasService.obtener('ADMIN', id), esValidacion(/^id:/));
      assert.equal(db.obtenerPool.mock.callCount(), 0);
    });
  }
});

describe('crear', () => {
  const BODY = Object.freeze({ nombre: '  Prueba 1  ', tipoCanchaId: 1 });

  it('valida el tipo, inserta recortado con CreadaEn de Nicaragua y devuelve la cancha', async () => {
    const tx = crearEjecutorFalso([TIPO_SALA], [{ Id: 8 }]);
    usarTransaccion(tx);

    const cancha = await canchasService.crear(3, BODY);

    assert.deepEqual(cancha, {
      id: 8,
      nombre: 'Prueba 1',
      activa: true,
      tipoCanchaId: 1,
      tipoCodigo: 'SALA',
      tipoNombre: 'Fútbol sala',
      precioHora: 600,
    });
    assert.equal(tx.llamadas.length, 2);
    assert.match(tx.llamadas[0].texto, /FROM TipoCancha WHERE Id = @id/);
    const { inputs, texto } = tx.llamadas[1];
    assert.match(texto, /INSERT INTO Cancha/);
    assert.equal(inputs.nombre.tipo.type, sql.NVarChar);
    assert.equal(inputs.nombre.tipo.length, 50);
    assert.equal(inputs.nombre.valor, 'Prueba 1');
    assert.equal(inputs.tipoCanchaId.valor, 1);
    assert.equal(inputs.creadaEn.tipo.type, sql.DateTime2);
    assert.equal(inputs.creadaEn.tipo.scale, 0);
    assert.equal(inputs.creadaEn.valor.getTime(), AHORA_NICARAGUA.getTime());
  });

  it('audita CREAR con la transacción recibida', async () => {
    const tx = crearEjecutorFalso([TIPO_SALA], [{ Id: 8 }]);
    usarTransaccion(tx);
    await canchasService.crear(3, BODY);

    assert.equal(auditoriaService.registrar.mock.callCount(), 1);
    const [ejecutor, datos] = auditoriaService.registrar.mock.calls[0].arguments;
    assert.equal(ejecutor, tx);
    assert.deepEqual(datos, {
      entidad: 'CANCHA',
      entidadId: 8,
      accion: 'CREAR',
      estadoAnterior: null,
      estadoNuevo: 'ACTIVA',
      usuarioId: 3,
      motivo: 'Nombre: Prueba 1; tipo: SALA',
    });
  });

  it('acepta nombre de exactamente 50 caracteres', async () => {
    usarTransaccion(crearEjecutorFalso([TIPO_SALA], [{ Id: 8 }]));
    const cancha = await canchasService.crear(3, { nombre: 'n'.repeat(50), tipoCanchaId: 1 });
    assert.equal(cancha.nombre.length, 50);
  });

  const invalidos = [
    ['body ausente', undefined, /^nombre:/],
    ['nombre ausente', { tipoCanchaId: 1 }, /^nombre:/],
    ['nombre no texto', { nombre: 5, tipoCanchaId: 1 }, /^nombre:/],
    ['nombre vacío', { nombre: '', tipoCanchaId: 1 }, /^nombre:/],
    ['nombre solo espacios', { nombre: '   ', tipoCanchaId: 1 }, /^nombre:/],
    ['nombre de 51 caracteres', { nombre: 'n'.repeat(51), tipoCanchaId: 1 }, /^nombre:/],
    ['tipoCanchaId ausente', { nombre: 'Prueba 1' }, /^tipoCanchaId:/],
    ['tipoCanchaId como texto', { nombre: 'Prueba 1', tipoCanchaId: '2' }, /^tipoCanchaId:/],
    ['tipoCanchaId 0', { nombre: 'Prueba 1', tipoCanchaId: 0 }, /^tipoCanchaId:/],
    ['tipoCanchaId decimal', { nombre: 'Prueba 1', tipoCanchaId: 1.5 }, /^tipoCanchaId:/],
    ['tipoCanchaId booleano', { nombre: 'Prueba 1', tipoCanchaId: true }, /^tipoCanchaId:/],
    ['tipoCanchaId fuera de INT', { nombre: 'Prueba 1', tipoCanchaId: 2147483648 }, /^tipoCanchaId:/],
  ];

  for (const [caso, body, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin abrir transacción`, async () => {
      await assert.rejects(canchasService.crear(3, body), esValidacion(mensaje));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }

  it('tipo inexistente → VALIDACION, sin INSERT ni auditoría', async () => {
    const tx = crearEjecutorFalso([]);
    usarTransaccion(tx);

    await assert.rejects(
      canchasService.crear(3, { nombre: 'Prueba 1', tipoCanchaId: 99 }),
      esValidacion(/^tipoCanchaId: el tipo de cancha no existe$/),
    );
    assert.equal(tx.llamadas.length, 1);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
  });

  for (const numero of [2601, 2627]) {
    it(`nombre duplicado (${numero}) → VALIDACION, sin auditoría`, async () => {
      usarTransaccion(crearEjecutorFalso([TIPO_SALA], errorSql(numero)));
      await assert.rejects(
        canchasService.crear(3, BODY),
        esValidacion(/^nombre: ya existe una cancha con ese nombre$/),
      );
      assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    });
  }

  it('otro error SQL se relanza sin traducir', async () => {
    const original = errorSql(547);
    usarTransaccion(crearEjecutorFalso([TIPO_SALA], original));
    await assert.rejects(canchasService.crear(3, BODY), (err) => err === original);
  });
});

describe('editar', () => {
  it('lee la cancha con UPDLOCK y devuelve 404 si no existe', async () => {
    const tx = crearEjecutorFalso([]);
    usarTransaccion(tx);

    await assert.rejects(
      canchasService.editar(3, '99', { nombre: 'Prueba 1', tipoCanchaId: 1 }),
      esNoEncontrado(),
    );
    assert.match(tx.llamadas[0].texto, /FROM Cancha c WITH \(UPDLOCK\)/);
  });

  it('sin cambios → devuelve la cancha sin UPDATE ni auditoría', async () => {
    const tx = crearEjecutorFalso([FILA_SALA]);
    usarTransaccion(tx);

    const cancha = await canchasService.editar(3, '1', { nombre: ' Sala 1 ', tipoCanchaId: 1 });

    assert.deepEqual(cancha, CANCHA_SALA);
    assert.equal(tx.llamadas.length, 1);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
  });

  it('solo nombre → UPDATE sin consultar el tipo y motivo con el cambio de nombre', async () => {
    const tx = crearEjecutorFalso([FILA_SALA], []);
    usarTransaccion(tx);

    const cancha = await canchasService.editar(3, '1', { nombre: 'Sala Uno', tipoCanchaId: 1 });

    assert.deepEqual(cancha, { ...CANCHA_SALA, nombre: 'Sala Uno' });
    assert.equal(tx.llamadas.length, 2);
    const { inputs, texto } = tx.llamadas[1];
    assert.match(texto, /UPDATE Cancha SET Nombre = @nombre, TipoCanchaId = @tipoCanchaId/);
    assert.equal(inputs.nombre.valor, 'Sala Uno');
    assert.equal(inputs.tipoCanchaId.valor, 1);

    const [ejecutor, datos] = auditoriaService.registrar.mock.calls[0].arguments;
    assert.equal(ejecutor, tx);
    assert.deepEqual(datos, {
      entidad: 'CANCHA',
      entidadId: 1,
      accion: 'EDITAR',
      estadoAnterior: null,
      estadoNuevo: null,
      usuarioId: 3,
      motivo: 'Nombre: Sala 1 → Sala Uno',
    });
  });

  it('solo tipo → consulta el tipo nuevo y responde con su código y precio', async () => {
    const tx = crearEjecutorFalso([FILA_SALA], [TIPO_CAMPO], []);
    usarTransaccion(tx);

    const cancha = await canchasService.editar(3, '1', { nombre: 'Sala 1', tipoCanchaId: 2 });

    assert.deepEqual(cancha, {
      ...CANCHA_SALA,
      tipoCanchaId: 2,
      tipoCodigo: 'CAMPO',
      tipoNombre: 'Fútbol campo',
      precioHora: 1200,
    });
    assert.match(tx.llamadas[1].texto, /FROM TipoCancha WHERE Id = @id/);
    assert.equal(tx.llamadas[1].inputs.id.valor, 2);
    const datos = auditoriaService.registrar.mock.calls[0].arguments[1];
    assert.equal(datos.motivo, 'tipo: SALA → CAMPO');
  });

  it('nombre y tipo → motivo con los dos cambios', async () => {
    usarTransaccion(crearEjecutorFalso([FILA_SALA], [TIPO_CAMPO], []));
    await canchasService.editar(3, '1', { nombre: 'Campo 9', tipoCanchaId: 2 });
    const datos = auditoriaService.registrar.mock.calls[0].arguments[1];
    assert.equal(datos.motivo, 'Nombre: Sala 1 → Campo 9; tipo: SALA → CAMPO');
  });

  it('vale sobre una cancha inactiva y la devuelve inactiva', async () => {
    usarTransaccion(crearEjecutorFalso([{ ...FILA_SALA, Activa: false }], []));
    const cancha = await canchasService.editar(3, '1', { nombre: 'Sala Uno', tipoCanchaId: 1 });
    assert.equal(cancha.activa, false);
    assert.equal(auditoriaService.registrar.mock.callCount(), 1);
  });

  it('tipo nuevo inexistente → VALIDACION, sin UPDATE ni auditoría', async () => {
    const tx = crearEjecutorFalso([FILA_SALA], []);
    usarTransaccion(tx);

    await assert.rejects(
      canchasService.editar(3, '1', { nombre: 'Sala 1', tipoCanchaId: 99 }),
      esValidacion(/^tipoCanchaId: el tipo de cancha no existe$/),
    );
    assert.equal(tx.llamadas.length, 2);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
  });

  for (const numero of [2601, 2627]) {
    it(`nombre duplicado (${numero}) → VALIDACION, sin auditoría`, async () => {
      usarTransaccion(crearEjecutorFalso([FILA_SALA], errorSql(numero)));
      await assert.rejects(
        canchasService.editar(3, '1', { nombre: 'Sala 2', tipoCanchaId: 1 }),
        esValidacion(/^nombre: ya existe una cancha con ese nombre$/),
      );
      assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    });
  }

  const invalidos = [
    ['body ausente', '1', undefined, /^nombre:/],
    ['sin nombre', '1', { tipoCanchaId: 1 }, /^nombre:/],
    ['sin tipoCanchaId', '1', { nombre: 'Sala 1' }, /^tipoCanchaId:/],
    ['tipoCanchaId como texto', '1', { nombre: 'Sala 1', tipoCanchaId: '1' }, /^tipoCanchaId:/],
    ['id no numérico', 'abc', { nombre: 'Sala 1', tipoCanchaId: 1 }, /^id:/],
  ];

  for (const [caso, id, body, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin abrir transacción`, async () => {
      await assert.rejects(canchasService.editar(3, id, body), esValidacion(mensaje));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }
});

describe('darDeAlta', () => {
  const FILA_INACTIVA = Object.freeze({ ...FILA_SALA, Activa: false });

  it('lee con UPDLOCK, activa y audita ALTA con el motivo recortado', async () => {
    const tx = crearEjecutorFalso([FILA_INACTIVA], []);
    usarTransaccion(tx);

    const cancha = await canchasService.darDeAlta(3, '1', { motivo: '  Reparada  ' });

    assert.deepEqual(cancha, CANCHA_SALA);
    assert.match(tx.llamadas[0].texto, /FROM Cancha c WITH \(UPDLOCK\)/);
    assert.match(tx.llamadas[1].texto, /UPDATE Cancha SET Activa = 1 WHERE Id = @id/);
    const [ejecutor, datos] = auditoriaService.registrar.mock.calls[0].arguments;
    assert.equal(ejecutor, tx);
    assert.deepEqual(datos, {
      entidad: 'CANCHA',
      entidadId: 1,
      accion: 'ALTA',
      estadoAnterior: 'INACTIVA',
      estadoNuevo: 'ACTIVA',
      usuarioId: 3,
      motivo: 'Reparada',
    });
  });

  it('sin motivo (o body ausente) → audita con motivo null', async () => {
    usarTransaccion(crearEjecutorFalso([FILA_INACTIVA], []));
    await canchasService.darDeAlta(3, '1', undefined);
    assert.equal(auditoriaService.registrar.mock.calls[0].arguments[1].motivo, null);
  });

  it('acepta motivo de exactamente 250 caracteres', async () => {
    usarTransaccion(crearEjecutorFalso([FILA_INACTIVA], []));
    await canchasService.darDeAlta(3, '1', { motivo: 'm'.repeat(250) });
    assert.equal(auditoriaService.registrar.mock.calls[0].arguments[1].motivo.length, 250);
  });

  it('inexistente → 404', async () => {
    usarTransaccion(crearEjecutorFalso([]));
    await assert.rejects(canchasService.darDeAlta(3, '99', {}), esNoEncontrado());
  });

  it('ya activa → 409 TRANSICION_INVALIDA, sin UPDATE ni auditoría', async () => {
    const tx = crearEjecutorFalso([FILA_SALA]);
    usarTransaccion(tx);

    await assert.rejects(canchasService.darDeAlta(3, '1', {}), esAppError(409, 'TRANSICION_INVALIDA'));
    assert.equal(tx.llamadas.length, 1);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
  });

  const invalidos = [
    ['motivo de 251 caracteres', '1', { motivo: 'm'.repeat(251) }, /^motivo:/],
    ['motivo vacío', '1', { motivo: '' }, /^motivo:/],
    ['motivo solo espacios', '1', { motivo: '   ' }, /^motivo:/],
    ['motivo no texto', '1', { motivo: 5 }, /^motivo:/],
    ['id inválido', '0', {}, /^id:/],
  ];

  for (const [caso, id, body, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin abrir transacción`, async () => {
      await assert.rejects(canchasService.darDeAlta(3, id, body), esValidacion(mensaje));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }
});

describe('listarTipos', () => {
  it('devuelve los tipos mapeados, ordenados por Id', async () => {
    const pool = crearEjecutorFalso([TIPO_SALA, TIPO_CAMPO]);
    usarPool(pool);

    assert.deepEqual(await canchasService.listarTipos(), [
      { id: 1, codigo: 'SALA', nombre: 'Fútbol sala', precioHora: 600 },
      { id: 2, codigo: 'CAMPO', nombre: 'Fútbol campo', precioHora: 1200 },
    ]);
    assert.match(pool.llamadas[0].texto, /ORDER BY Id/);
  });
});

describe('cambiarPrecio', () => {
  it('envía el precio como Decimal(10,2) y devuelve el tipo actualizado, sin auditar', async () => {
    const pool = crearEjecutorFalso([{ ...TIPO_SALA, PrecioHora: 650 }]);
    usarPool(pool);

    const tipo = await canchasService.cambiarPrecio('1', { precioHora: 650 });

    assert.deepEqual(tipo, { id: 1, codigo: 'SALA', nombre: 'Fútbol sala', precioHora: 650 });
    const { inputs, texto } = pool.llamadas[0];
    assert.match(texto, /UPDATE TipoCancha SET PrecioHora = @precio/);
    assert.match(texto, /OUTPUT INSERTED\.Id/);
    assert.equal(inputs.precio.tipo.type, sql.Decimal);
    assert.equal(inputs.precio.tipo.precision, 10);
    assert.equal(inputs.precio.tipo.scale, 2);
    assert.equal(inputs.precio.valor, 650);
    assert.equal(inputs.id.valor, 1);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
  });

  for (const precio of [19.99, 0.01, 99999999.98, 99999999.99]) {
    it(`acepta ${precio} y lo envía sin alterar`, async () => {
      const pool = crearEjecutorFalso([{ ...TIPO_SALA, PrecioHora: precio }]);
      usarPool(pool);
      await canchasService.cambiarPrecio('1', { precioHora: precio });
      assert.equal(pool.llamadas[0].inputs.precio.valor, precio);
    });
  }

  it('inexistente → 404', async () => {
    usarPool(crearEjecutorFalso([]));
    await assert.rejects(
      canchasService.cambiarPrecio('99', { precioHora: 600 }),
      esNoEncontrado(/tipo de cancha/),
    );
  });

  const invalidos = [
    ['tres decimales', '1', { precioHora: 12.345 }, /^precioHora:/],
    ['0.30000000000000004', '1', { precioHora: 0.30000000000000004 }, /^precioHora:/],
    ['0', '1', { precioHora: 0 }, /^precioHora:/],
    ['negativo', '1', { precioHora: -1 }, /^precioHora:/],
    ['NaN', '1', { precioHora: NaN }, /^precioHora:/],
    ['Infinity', '1', { precioHora: Infinity }, /^precioHora:/],
    ['texto', '1', { precioHora: '600' }, /^precioHora:/],
    ['ausente', '1', {}, /^precioHora:/],
    ['body ausente', '1', undefined, /^precioHora:/],
    ['por encima de DECIMAL(10,2)', '1', { precioHora: 100000000 }, /^precioHora:/],
    ['id inválido', 'abc', { precioHora: 600 }, /^id:/],
  ];

  for (const [caso, id, body, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin pedir el pool`, async () => {
      await assert.rejects(canchasService.cambiarPrecio(id, body), esValidacion(mensaje));
      assert.equal(db.obtenerPool.mock.callCount(), 0);
    });
  }
});

describe('obtenerActiva', () => {
  it('usa el ejecutor recibido con HOLDLOCK y Activa = 1, sin abrir pool ni transacción', async () => {
    const tx = crearEjecutorFalso([FILA_SALA]);

    const cancha = await canchasService.obtenerActiva(tx, 1);

    assert.deepEqual(cancha, { id: 1, nombre: 'Sala 1', tipoCodigo: 'SALA', precioHora: 600 });
    const { inputs, texto } = tx.llamadas[0];
    assert.match(texto, /FROM Cancha c WITH \(HOLDLOCK\)/);
    assert.match(texto, /c\.Activa = 1/);
    assert.equal(inputs.id.tipo, sql.Int);
    assert.equal(inputs.id.valor, 1);
    assert.equal(db.obtenerPool.mock.callCount(), 0);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
  });

  it('inexistente o inactiva → 404 NO_ENCONTRADO', async () => {
    await assert.rejects(canchasService.obtenerActiva(crearEjecutorFalso([]), 1), esNoEncontrado());
  });

  for (const valor of ['1', 0, 1.5, null]) {
    it(`canchaId ${JSON.stringify(valor)} → TypeError sin consultar`, async () => {
      const ejecutor = crearEjecutorFalso();
      await assert.rejects(canchasService.obtenerActiva(ejecutor, valor), TypeError);
      assert.equal(ejecutor.llamadas.length, 0);
    });
  }
});

describe('obtenerParaActualizar', () => {
  it('usa el ejecutor recibido con UPDLOCK y devuelve la cancha aunque esté inactiva', async () => {
    const tx = crearEjecutorFalso([{ ...FILA_SALA, Activa: false }]);

    const cancha = await canchasService.obtenerParaActualizar(tx, 1);

    assert.deepEqual(cancha, { ...CANCHA_SALA, activa: false });
    const { inputs, texto } = tx.llamadas[0];
    assert.match(texto, /FROM Cancha c WITH \(UPDLOCK\)/);
    assert.equal(inputs.id.tipo, sql.Int);
    assert.equal(inputs.id.valor, 1);
    assert.equal(db.obtenerPool.mock.callCount(), 0);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
  });

  it('inexistente → 404 NO_ENCONTRADO', async () => {
    await assert.rejects(canchasService.obtenerParaActualizar(crearEjecutorFalso([]), 1), esNoEncontrado());
  });

  for (const valor of ['1', 0, 1.5, null]) {
    it(`canchaId ${JSON.stringify(valor)} → TypeError sin consultar`, async () => {
      const ejecutor = crearEjecutorFalso();
      await assert.rejects(canchasService.obtenerParaActualizar(ejecutor, valor), TypeError);
      assert.equal(ejecutor.llamadas.length, 0);
    });
  }
});

describe('listarActivas', () => {
  it('usa el ejecutor recibido, solo activas y sin filtro de tipo por defecto', async () => {
    const ejecutor = crearEjecutorFalso([FILA_SALA, FILA_CAMPO]);

    const canchas = await canchasService.listarActivas(ejecutor);

    assert.deepEqual(canchas, [
      { id: 1, nombre: 'Sala 1', tipoCodigo: 'SALA', precioHora: 600 },
      { id: 6, nombre: 'Campo 1', tipoCodigo: 'CAMPO', precioHora: 1200 },
    ]);
    const { inputs } = ejecutor.llamadas[0];
    assert.equal(inputs.tipo.valor, null);
    assert.equal(inputs.incluirInactivas.valor, false);
    assert.equal(db.obtenerPool.mock.callCount(), 0);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
  });

  it('filtra por el tipo recibido', async () => {
    const ejecutor = crearEjecutorFalso();
    await canchasService.listarActivas(ejecutor, 'CAMPO');
    assert.equal(ejecutor.llamadas[0].inputs.tipo.valor, 'CAMPO');
  });
});
