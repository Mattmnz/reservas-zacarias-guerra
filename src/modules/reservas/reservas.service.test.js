const { describe, it, test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const { sql } = db;
const AppError = require('../../shared/AppError');
const auditoriaService = require('../auditoria/auditoria.service');
const notificacionesService = require('../notificaciones/notificaciones.service');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('../horarios/horarios.service');
const reservasService = require('./reservas.service');

// Ahora: 2026-10-20 13:00 en Nicaragua.
const AHORA_UTC = Date.UTC(2026, 9, 20, 19, 0, 0);
const AHORA_NICARAGUA = new Date('2026-10-20T13:00:00Z');
const CANCHA = Object.freeze({ id: 3, nombre: 'Sala 3', tipoCodigo: 'SALA', precioHora: 600 });
const BASE = Object.freeze({ canchaId: 3, inicio: '2026-10-21T19:00:00' });

// Imita la transacción: guarda inputs y texto de cada request y responde los recordsets en orden.
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

// Simula enTransaccion: ejecuta fn con la transacción falsa y anota el nivel de aislamiento.
function usarTransaccion(tx) {
  return mock.method(db, 'enTransaccion', async (fn, nivel) => fn(tx, nivel));
}

function errorSql(numero) {
  return Object.assign(new Error(`error SQL ${numero}`), { number: numero });
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
  mock.method(canchasService, 'obtenerActiva', async () => ({ ...CANCHA }));
  mock.method(horariosService, 'obtenerDelDia', async () => ({ apertura: 7, cierre: 22 }));
  mock.method(auditoriaService, 'registrar', async () => undefined);
  mock.method(notificacionesService, 'crear', async () => undefined);
});

afterEach(() => mock.restoreAll());

describe('crear: validación de entrada', () => {
  const invalidos = [
    ['inicio ausente', { inicio: undefined }],
    ['inicio con Z', { inicio: '2026-10-21T19:00:00Z' }],
    ['inicio sin segundos', { inicio: '2026-10-21T19:00' }],
    ['inicio imposible', { inicio: '2026-02-30T19:00:00' }],
    ['inicio con minutos', { inicio: '2026-10-21T19:30:00' }],
    ['inicio con segundos', { inicio: '2026-10-21T19:00:01' }],
    ['canchaId ausente', { canchaId: undefined }],
    ['canchaId 0', { canchaId: 0 }],
    ['canchaId negativo', { canchaId: -1 }],
    ['canchaId decimal', { canchaId: 1.5 }],
    ['canchaId como texto', { canchaId: '3' }],
    ['canchaId fuera de INT', { canchaId: 2147483648 }],
    ['inicio igual a ahora', { inicio: '2026-10-20T13:00:00' }],
    ['inicio pasado', { inicio: '2026-10-20T12:00:00' }],
    ['inicio a 30 días + 1 h', { inicio: '2026-11-19T14:00:00' }],
  ];

  for (const [caso, cambio] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin tocar la base`, async () => {
      await assert.rejects(reservasService.crear(5, { ...BASE, ...cambio }), esAppError(400, 'VALIDACION'));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
      assert.equal(db.obtenerPool.mock.callCount(), 0);
    });
  }

  it('rechaza un cuerpo ausente con 400 VALIDACION', async () => {
    await assert.rejects(reservasService.crear(5), esAppError(400, 'VALIDACION'));
  });

  it('acepta exactamente 30 días de anticipación', async () => {
    usarTransaccion(crearEjecutorFalso([], [{ Id: 1 }]));
    const reserva = await reservasService.crear(5, { ...BASE, inicio: '2026-11-19T13:00:00' });
    assert.equal(reserva.inicio, '2026-11-19T13:00:00');
  });
});

describe('crear: transacción', () => {
  it('cancha inexistente o de baja → propaga NO_ENCONTRADO sin consultar Reserva', async () => {
    const tx = crearEjecutorFalso();
    usarTransaccion(tx);
    canchasService.obtenerActiva.mock.mockImplementation(async () => {
      throw new AppError(404, 'NO_ENCONTRADO', 'La cancha no existe o no está activa');
    });

    await assert.rejects(reservasService.crear(5, BASE), esAppError(404, 'NO_ENCONTRADO'));
    assert.equal(tx.llamadas.length, 0);
  });

  it('lee la cancha con la transacción, antes de cualquier otra consulta', async () => {
    const tx = crearEjecutorFalso([], [{ Id: 12 }]);
    usarTransaccion(tx);
    canchasService.obtenerActiva.mock.mockImplementation(async (ejecutor, canchaId) => {
      assert.equal(tx.llamadas.length, 0);
      return { ...CANCHA, id: canchaId };
    });

    await reservasService.crear(5, BASE);
    assert.deepEqual(canchasService.obtenerActiva.mock.calls[0].arguments, [tx, 3]);
  });

  it('bloque ocupado → 409 HORARIO_OCUPADO sin INSERT, auditoría ni notificación', async () => {
    const tx = crearEjecutorFalso([{ Id: 40 }]);
    usarTransaccion(tx);

    await assert.rejects(reservasService.crear(5, BASE), esAppError(409, 'HORARIO_OCUPADO'));
    assert.equal(tx.llamadas.length, 1);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    assert.equal(notificacionesService.crear.mock.callCount(), 0);
  });

  for (const numero of [2601, 2627]) {
    it(`error SQL ${numero} en un INSERT → 409 HORARIO_OCUPADO`, async () => {
      usarTransaccion(crearEjecutorFalso([], errorSql(numero)));
      await assert.rejects(reservasService.crear(5, BASE), esAppError(409, 'HORARIO_OCUPADO'));
    });
  }

  it('otro error SQL se propaga tal cual', async () => {
    const original = errorSql(547);
    usarTransaccion(crearEjecutorFalso([], original));
    await assert.rejects(reservasService.crear(5, BASE), (err) => err === original);
  });
});

describe('crear: éxito', () => {
  let tx;
  let reserva;

  beforeEach(async () => {
    tx = crearEjecutorFalso([], [{ Id: 12 }]);
    usarTransaccion(tx);
    reserva = await reservasService.crear(5, BASE);
  });

  it('abre la transacción con READ COMMITTED', () => {
    assert.equal(db.enTransaccion.mock.calls[0].arguments[1], sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  it('bloquea el bloque con UPDLOCK, HOLDLOCK y Activa = 1 literal', () => {
    const { texto, inputs } = tx.llamadas[0];
    assert.match(texto, /FROM Reserva WITH \(UPDLOCK, HOLDLOCK\)/);
    assert.match(texto, /WHERE CanchaId = @canchaId AND Inicio = @inicio AND Activa = 1/);
    assert.deepEqual(Object.keys(inputs).sort(), ['canchaId', 'inicio']);
    assert.equal(inputs.canchaId.valor, 3);
    assert.equal(inputs.inicio.tipo.type, sql.DateTime2);
    assert.equal(inputs.inicio.valor.getTime(), new Date('2026-10-21T19:00:00Z').getTime());
  });

  it('inserta la reserva PAGADA con el precio de la cancha y los tipos del esquema', () => {
    const { texto, inputs } = tx.llamadas[1];
    assert.match(texto, /INSERT INTO Reserva/);
    assert.match(texto, /VALUES \(@clienteId, @canchaId, @inicio, @monto, @estado, 1, @ahora, @ahora\)/);
    assert.equal(inputs.clienteId.valor, 5);
    assert.equal(inputs.monto.tipo.type, sql.Decimal);
    assert.equal(inputs.monto.tipo.precision, 10);
    assert.equal(inputs.monto.tipo.scale, 2);
    assert.equal(inputs.monto.valor, 600);
    assert.equal(inputs.estado.tipo.type, sql.VarChar);
    assert.equal(inputs.estado.valor, 'PAGADA');
    assert.equal(inputs.ahora.valor.getTime(), AHORA_NICARAGUA.getTime());
  });

  it('inserta el cargo simulado por el mismo monto con referencia SIM-C-<id>', () => {
    const { texto, inputs } = tx.llamadas[2];
    assert.match(texto, /INSERT INTO Pago/);
    assert.equal(inputs.reservaId.valor, 12);
    assert.equal(inputs.tipo.tipo.type, sql.VarChar);
    assert.equal(inputs.tipo.valor, 'CARGO');
    assert.equal(inputs.monto.valor, 600);
    assert.equal(inputs.referencia.valor, 'SIM-C-12');
    assert.equal(inputs.creadoEn.valor.getTime(), AHORA_NICARAGUA.getTime());
  });

  it('audita y notifica dentro de la misma transacción', () => {
    assert.deepEqual(auditoriaService.registrar.mock.calls[0].arguments, [
      tx,
      {
        entidad: 'RESERVA',
        entidadId: 12,
        accion: 'CREAR',
        estadoAnterior: null,
        estadoNuevo: 'PAGADA',
        usuarioId: 5,
        motivo: null,
      },
    ]);
    assert.deepEqual(notificacionesService.crear.mock.calls[0].arguments, [
      tx,
      { usuarioId: 5, reservaId: 12, mensaje: 'Reserva #12 pagada: 21/10/2026 19:00, C$ 600.00' },
    ]);
  });

  it('responde la reserva con sus pagos y fechas locales', () => {
    assert.deepEqual(reserva, {
      id: 12,
      canchaId: 3,
      inicio: '2026-10-21T19:00:00',
      monto: 600,
      estado: 'PAGADA',
      pagos: [{ tipo: 'CARGO', monto: 600, referencia: 'SIM-C-12', creadoEn: '2026-10-20T13:00:00' }],
    });
  });
});

// BASE es el miércoles 2026-10-21 a las 19:00 (diaSemana 3).
describe('crear: horario', () => {
  function conHorario(horario) {
    horariosService.obtenerDelDia.mock.mockImplementation(async () => horario);
  }

  it('pide el horario del día con la transacción', async () => {
    const tx = crearEjecutorFalso([], [{ Id: 12 }]);
    usarTransaccion(tx);
    await reservasService.crear(5, BASE);
    assert.deepEqual(horariosService.obtenerDelDia.mock.calls[0].arguments, [tx, 3, 3]);
  });

  it('día cerrado → 400 VALIDACION sin consultar Reserva, auditar ni notificar', async () => {
    const tx = crearEjecutorFalso();
    usarTransaccion(tx);
    conHorario(null);

    await assert.rejects(reservasService.crear(5, BASE), esAppError(400, 'VALIDACION'));
    assert.equal(tx.llamadas.length, 0);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    assert.equal(notificacionesService.crear.mock.callCount(), 0);
  });

  const rechazados = [
    ['antes de la apertura', { apertura: 20, cierre: 22 }],
    ['exactamente en el cierre', { apertura: 7, cierre: 19 }],
  ];
  for (const [caso, horario] of rechazados) {
    it(`${caso} → 400 VALIDACION`, async () => {
      const tx = crearEjecutorFalso();
      usarTransaccion(tx);
      conHorario(horario);

      await assert.rejects(reservasService.crear(5, BASE), esAppError(400, 'VALIDACION'));
      assert.equal(tx.llamadas.length, 0);
    });
  }

  const aceptados = [
    ['justo en la apertura', { apertura: 19, cierre: 22 }],
    ['la última hora válida (cierre − 1)', { apertura: 7, cierre: 20 }],
  ];
  for (const [caso, horario] of aceptados) {
    it(`acepta ${caso}`, async () => {
      usarTransaccion(crearEjecutorFalso([], [{ Id: 12 }]));
      conHorario(horario);

      const reserva = await reservasService.crear(5, BASE);
      assert.equal(reserva.inicio, '2026-10-21T19:00:00');
    });
  }
});
