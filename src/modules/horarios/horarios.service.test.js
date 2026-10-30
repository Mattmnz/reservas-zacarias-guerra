const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const { sql } = db;
const AppError = require('../../shared/AppError');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('./horarios.service');

// Imita pool/transacción: guarda inputs y texto de cada request y responde en orden.
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
const esNoEncontrado = () => esAppError(404, 'NO_ENCONTRADO');

const CANCHA = Object.freeze({ id: 3, nombre: 'Sala 3', activa: true });

beforeEach(() => {
  // Si alguna llamada escapa a los mocks, la prueba falla en vez de abrir una conexión.
  const conexionProhibida = async () => {
    throw new Error('la prueba intentó conectarse');
  };
  mock.method(db, 'obtenerPool', conexionProhibida);
  mock.method(db, 'enTransaccion', conexionProhibida);
  mock.method(canchasService, 'obtener', async () => CANCHA);
  mock.method(canchasService, 'obtenerParaActualizar', async () => CANCHA);
});

afterEach(() => mock.restoreAll());

describe('listar', () => {
  it('pasa rol e id a canchas y devuelve los días con horas HH:00, en orden', async () => {
    const pool = crearEjecutorFalso([
      { DiaSemana: 1, Apertura: 7, Cierre: 22 },
      { DiaSemana: 6, Apertura: 0, Cierre: 23 },
    ]);
    usarPool(pool);

    const dias = await horariosService.listar('CLIENTE', '3');

    assert.deepEqual(canchasService.obtener.mock.calls[0].arguments, ['CLIENTE', '3']);
    assert.deepEqual(dias, [
      { diaSemana: 1, apertura: '07:00', cierre: '22:00' },
      { diaSemana: 6, apertura: '00:00', cierre: '23:00' },
    ]);
    const { inputs, texto } = pool.llamadas[0];
    assert.equal(inputs.canchaId.tipo, sql.Int);
    assert.equal(inputs.canchaId.valor, 3);
    assert.match(texto, /DATEPART\(HOUR, HoraApertura\)/);
    assert.match(texto, /ORDER BY DiaSemana/);
  });

  it('sin filas (todos los días cerrados) → []', async () => {
    usarPool(crearEjecutorFalso([]));
    assert.deepEqual(await horariosService.listar('ADMIN', '3'), []);
  });

  it('si canchas rechaza (id inválido, inexistente o inactiva para cliente), no consulta horarios', async () => {
    mock.method(canchasService, 'obtener', async () => {
      throw new AppError(404, 'NO_ENCONTRADO', 'La cancha no existe');
    });

    await assert.rejects(horariosService.listar('CLIENTE', '99'), esNoEncontrado());
    assert.equal(db.obtenerPool.mock.callCount(), 0);
  });
});

describe('reemplazar', () => {
  it('bloquea la cancha con la transacción, borra la semana e inserta un día por fila, ordenados', async () => {
    const tx = crearEjecutorFalso();
    usarTransaccion(tx);

    const resultado = await horariosService.reemplazar('3', {
      dias: [
        { diaSemana: 7, apertura: '08:00', cierre: '20:00' },
        { diaSemana: 1, apertura: '07:00', cierre: '22:00' },
      ],
    });

    assert.deepEqual(resultado, [
      { diaSemana: 1, apertura: '07:00', cierre: '22:00' },
      { diaSemana: 7, apertura: '08:00', cierre: '20:00' },
    ]);
    assert.deepEqual(canchasService.obtenerParaActualizar.mock.calls[0].arguments, [tx, 3]);

    const [borrado, lunes, domingo] = tx.llamadas;
    assert.equal(tx.llamadas.length, 3);
    assert.match(borrado.texto, /DELETE FROM Horario WHERE CanchaId = @canchaId/);
    assert.equal(borrado.inputs.canchaId.valor, 3);
    assert.match(lunes.texto, /TIMEFROMPARTS\(@apertura, 0, 0, 0, 0\)/);
    assert.deepEqual(
      Object.fromEntries(Object.entries(lunes.inputs).map(([k, v]) => [k, v.valor])),
      { canchaId: 3, dia: 1, apertura: 7, cierre: 22 },
    );
    assert.equal(lunes.inputs.dia.tipo, sql.TinyInt);
    assert.equal(lunes.inputs.apertura.tipo, sql.TinyInt);
    assert.equal(domingo.inputs.dia.valor, 7);
  });

  it('acepta los extremos 00:00 y 23:00', async () => {
    usarTransaccion(crearEjecutorFalso());
    const resultado = await horariosService.reemplazar('3', {
      dias: [{ diaSemana: 2, apertura: '00:00', cierre: '23:00' }],
    });
    assert.deepEqual(resultado, [{ diaSemana: 2, apertura: '00:00', cierre: '23:00' }]);
  });

  it('dias vacío deja la cancha cerrada: solo el DELETE', async () => {
    const tx = crearEjecutorFalso();
    usarTransaccion(tx);

    assert.deepEqual(await horariosService.reemplazar('3', { dias: [] }), []);
    assert.equal(tx.llamadas.length, 1);
    assert.match(tx.llamadas[0].texto, /DELETE/);
  });

  it('cancha inexistente → 404 NO_ENCONTRADO sin borrar nada', async () => {
    const tx = crearEjecutorFalso();
    usarTransaccion(tx);
    mock.method(canchasService, 'obtenerParaActualizar', async () => {
      throw new AppError(404, 'NO_ENCONTRADO', 'La cancha no existe');
    });

    await assert.rejects(horariosService.reemplazar('99', { dias: [] }), esNoEncontrado());
    assert.equal(tx.llamadas.length, 0);
  });

  const DIA_OK = { diaSemana: 1, apertura: '07:00', cierre: '22:00' };
  const invalidos = [
    ['id no numérico', 'abc', { dias: [] }, /^id:/],
    ['id 0', '0', { dias: [] }, /^id:/],
    ['id fuera de INT', '2147483648', { dias: [] }, /^id:/],
    ['sin cuerpo', '3', undefined, /^dias: debe ser un arreglo/],
    ['dias ausente', '3', {}, /^dias: debe ser un arreglo/],
    ['dias como objeto', '3', { dias: DIA_OK }, /^dias: debe ser un arreglo/],
    ['elemento null', '3', { dias: [null] }, /^dias\[0\]: debe ser un objeto/],
    ['elemento arreglo', '3', { dias: [[1, '07:00', '22:00']] }, /^dias\[0\]: debe ser un objeto/],
    ['diaSemana como texto', '3', { dias: [{ ...DIA_OK, diaSemana: '1' }] }, /^dias\[0\]\.diaSemana/],
    ['diaSemana 0', '3', { dias: [{ ...DIA_OK, diaSemana: 0 }] }, /^dias\[0\]\.diaSemana/],
    ['diaSemana 8', '3', { dias: [{ ...DIA_OK, diaSemana: 8 }] }, /^dias\[0\]\.diaSemana/],
    ['diaSemana decimal', '3', { dias: [{ ...DIA_OK, diaSemana: 1.5 }] }, /^dias\[0\]\.diaSemana/],
    ['día repetido', '3', { dias: [DIA_OK, { ...DIA_OK }] }, /^dias\[1\]\.diaSemana: el día 1 está repetido/],
    ['apertura sin cero inicial', '3', { dias: [{ ...DIA_OK, apertura: '7:00' }] }, /^dias\[0\]\.apertura/],
    ['apertura a media hora', '3', { dias: [{ ...DIA_OK, apertura: '07:30' }] }, /^dias\[0\]\.apertura/],
    ['apertura con segundos', '3', { dias: [{ ...DIA_OK, apertura: '07:00:00' }] }, /^dias\[0\]\.apertura/],
    ['apertura como número', '3', { dias: [{ ...DIA_OK, apertura: 7 }] }, /^dias\[0\]\.apertura/],
    ['cierre 24:00', '3', { dias: [{ ...DIA_OK, cierre: '24:00' }] }, /^dias\[0\]\.cierre/],
    ['cierre ausente', '3', { dias: [{ diaSemana: 1, apertura: '07:00' }] }, /^dias\[0\]\.cierre/],
    ['apertura igual al cierre', '3', { dias: [{ ...DIA_OK, cierre: '07:00' }] }, /^dias\[0\]: la apertura/],
    ['apertura posterior al cierre', '3', { dias: [{ ...DIA_OK, apertura: '23:00' }] }, /^dias\[0\]: la apertura/],
  ];

  for (const [caso, id, cuerpo, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin abrir la transacción`, async () => {
      await assert.rejects(horariosService.reemplazar(id, cuerpo), esValidacion(mensaje));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }
});

describe('obtenerDelDia', () => {
  it('usa el ejecutor recibido y devuelve horas enteras, sin abrir pool ni transacción', async () => {
    const tx = crearEjecutorFalso([{ Apertura: 7, Cierre: 22 }]);

    assert.deepEqual(await horariosService.obtenerDelDia(tx, 3, 2), { apertura: 7, cierre: 22 });
    const { inputs, texto } = tx.llamadas[0];
    assert.equal(inputs.canchaId.tipo, sql.Int);
    assert.equal(inputs.canchaId.valor, 3);
    assert.equal(inputs.dia.tipo, sql.TinyInt);
    assert.equal(inputs.dia.valor, 2);
    assert.match(texto, /WHERE CanchaId = @canchaId AND DiaSemana = @dia/);
    assert.equal(db.obtenerPool.mock.callCount(), 0);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
  });

  it('día cerrado (sin fila) → null', async () => {
    assert.equal(await horariosService.obtenerDelDia(crearEjecutorFalso([]), 3, 7), null);
  });

  for (const [canchaId, dia] of [['3', 1], [0, 1], [1.5, 1], [3, 0], [3, 8], [3, '1'], [3, null]]) {
    it(`canchaId ${JSON.stringify(canchaId)}, diaSemana ${JSON.stringify(dia)} → TypeError sin consultar`, async () => {
      const ejecutor = crearEjecutorFalso();
      await assert.rejects(horariosService.obtenerDelDia(ejecutor, canchaId, dia), TypeError);
      assert.equal(ejecutor.llamadas.length, 0);
    });
  }
});

describe('listarDelDia', () => {
  it('usa el ejecutor recibido y devuelve [{ canchaId, apertura, cierre }] por CanchaId', async () => {
    const ejecutor = crearEjecutorFalso([
      { CanchaId: 1, Apertura: 7, Cierre: 22 },
      { CanchaId: 6, Apertura: 8, Cierre: 20 },
    ]);

    assert.deepEqual(await horariosService.listarDelDia(ejecutor, 5), [
      { canchaId: 1, apertura: 7, cierre: 22 },
      { canchaId: 6, apertura: 8, cierre: 20 },
    ]);
    const { inputs, texto } = ejecutor.llamadas[0];
    assert.equal(inputs.dia.valor, 5);
    assert.match(texto, /ORDER BY CanchaId/);
    assert.equal(db.obtenerPool.mock.callCount(), 0);
  });

  for (const dia of [0, 8, 2.5, '3', undefined]) {
    it(`diaSemana ${JSON.stringify(dia)} → TypeError sin consultar`, async () => {
      const ejecutor = crearEjecutorFalso();
      await assert.rejects(horariosService.listarDelDia(ejecutor, dia), TypeError);
      assert.equal(ejecutor.llamadas.length, 0);
    });
  }
});
