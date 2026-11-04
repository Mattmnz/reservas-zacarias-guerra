const { describe, it, test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const { sql } = db;
const AppError = require('../../shared/AppError');
const auditoriaService = require('../auditoria/auditoria.service');
const notificacionesService = require('../notificaciones/notificaciones.service');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('../horarios/horarios.service');
const usuariosService = require('../usuarios/usuarios.service');
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
      montoPenalizado: null,
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

// AHORA_NICARAGUA es el martes 2026-10-20 13:00.
function filaReserva(cambios = {}) {
  return {
    Id: 12,
    ClienteId: 5,
    CanchaId: 3,
    Inicio: new Date('2026-10-21T19:00:00Z'),
    Monto: 600,
    Estado: 'PAGADA',
    MontoPenalizado: null,
    ...cambios,
  };
}

const PAGOS = [
  { Tipo: 'CARGO', Monto: 600, Referencia: 'SIM-C-12', CreadoEn: new Date('2026-10-19T10:00:00Z') },
];

function auditoriaEsperada(cambios) {
  return { entidad: 'RESERVA', entidadId: 12, motivo: null, ...cambios };
}

describe('barrerNoShow', () => {
  const VENCIDAS = [
    { Id: 7, ClienteId: 5, Inicio: new Date('2026-10-20T11:00:00Z'), Estado: 'PAGADA' },
    { Id: 8, ClienteId: 6, Inicio: new Date('2026-10-20T12:00:00Z'), Estado: 'CONFIRMADA' },
  ];

  it('con el pool abre su propia transacción y devuelve la cantidad marcada', async () => {
    const tx = crearEjecutorFalso(VENCIDAS);
    usarTransaccion(tx);

    assert.equal(await reservasService.barrerNoShow({}), 2);
    assert.equal(db.enTransaccion.mock.callCount(), 1);
    assert.equal(auditoriaService.registrar.mock.calls[0].arguments[0], tx);
  });

  it('con una transacción la usa sin abrir otra', async () => {
    const tx = Object.setPrototypeOf(crearEjecutorFalso(VENCIDAS), sql.Transaction.prototype);

    assert.equal(await reservasService.barrerNoShow(tx), 2);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
    assert.equal(tx.llamadas.length, 1);
  });

  it('el UPDATE filtra por estado activo y vencido hace 1 h, y no asigna Activa', async () => {
    const tx = crearEjecutorFalso([]);
    usarTransaccion(tx);
    await reservasService.barrerNoShow({});

    const { texto, inputs } = tx.llamadas[0];
    // El filtro por estado hace idempotente el barrido: una fila ya marcada no vuelve a salir.
    assert.match(texto, /WHERE Estado IN \('PAGADA', 'CONFIRMADA'\)/);
    assert.match(texto, /Inicio <= DATEADD\(HOUR, -1, @ahora\)/);
    assert.match(texto, /SET Estado = 'NO_SHOW', MontoPenalizado = Monto, ActualizadaEn = @ahora/);
    assert.doesNotMatch(texto, /Activa/);
    assert.equal(inputs.ahora.tipo.type, sql.DateTime2);
    assert.equal(inputs.ahora.valor.getTime(), AHORA_NICARAGUA.getTime());
  });

  it('audita como sistema y notifica a cada cliente, sin reembolso', async () => {
    const tx = crearEjecutorFalso(VENCIDAS);
    usarTransaccion(tx);
    await reservasService.barrerNoShow({});

    const comun = { entidad: 'RESERVA', accion: 'MARCAR_NO_SHOW', estadoNuevo: 'NO_SHOW', usuarioId: null, motivo: null };
    assert.deepEqual(
      auditoriaService.registrar.mock.calls.map((c) => c.arguments[1]),
      [
        { ...comun, entidadId: 7, estadoAnterior: 'PAGADA' },
        { ...comun, entidadId: 8, estadoAnterior: 'CONFIRMADA' },
      ],
    );
    assert.deepEqual(notificacionesService.crear.mock.calls[1].arguments, [
      tx,
      { usuarioId: 6, reservaId: 8, mensaje: 'Reserva #8 marcada como no-show: 20/10/2026 12:00. Sin reembolso.' },
    ]);
    // Solo el UPDATE: ningún INSERT en Pago.
    assert.equal(tx.llamadas.length, 1);
  });

  it('sin reservas vencidas no audita ni notifica', async () => {
    usarTransaccion(crearEjecutorFalso([]));
    assert.equal(await reservasService.barrerNoShow({}), 0);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    assert.equal(notificacionesService.crear.mock.callCount(), 0);
  });
});

describe('ocupadosEnRango', () => {
  const DESDE = new Date('2026-10-21T00:00:00Z');
  const HASTA = new Date('2026-10-22T00:00:00Z');

  it('consulta las activas del rango semiabierto y devuelve { canchaId, inicio }', async () => {
    const inicio = new Date('2026-10-21T19:00:00Z');
    const ejecutor = crearEjecutorFalso([{ CanchaId: 3, Inicio: inicio }]);

    assert.deepEqual(await reservasService.ocupadosEnRango(ejecutor, DESDE, HASTA), [{ canchaId: 3, inicio }]);
    const { texto, inputs } = ejecutor.llamadas[0];
    assert.match(texto, /WHERE Activa = 1 AND Inicio >= @desde AND Inicio < @hasta/);
    assert.deepEqual(Object.keys(inputs).sort(), ['desde', 'hasta']);
  });

  const invalidos = [
    ['desde inválido', new Date('x'), HASTA],
    ['hasta como texto', DESDE, '2026-10-22T00:00:00'],
  ];
  for (const [caso, desde, hasta] of invalidos) {
    it(`${caso} → TypeError`, async () => {
      await assert.rejects(reservasService.ocupadosEnRango(crearEjecutorFalso(), desde, hasta), TypeError);
    });
  }
});

describe('confirmar', () => {
  for (const id of ['abc', '0', '-1', '1.5', '2147483648', undefined]) {
    it(`id ${id} → 400 VALIDACION sin tocar la base`, async () => {
      await assert.rejects(reservasService.confirmar(id, 1), esAppError(400, 'VALIDACION'));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }

  it('reserva inexistente → 404 NO_ENCONTRADO', async () => {
    usarTransaccion(crearEjecutorFalso([]));
    await assert.rejects(reservasService.confirmar('12', 1), esAppError(404, 'NO_ENCONTRADO'));
  });

  for (const estado of ['CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_SHOW']) {
    it(`desde ${estado} → 409 TRANSICION_INVALIDA sin UPDATE`, async () => {
      const tx = crearEjecutorFalso([filaReserva({ Estado: estado })]);
      usarTransaccion(tx);
      await assert.rejects(reservasService.confirmar('12', 1), esAppError(409, 'TRANSICION_INVALIDA'));
      assert.equal(tx.llamadas.length, 1);
      assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    });
  }

  it('reserva que empieza justo ahora → 409 TRANSICION_INVALIDA', async () => {
    usarTransaccion(crearEjecutorFalso([filaReserva({ Inicio: AHORA_NICARAGUA })]));
    await assert.rejects(reservasService.confirmar('12', 1), esAppError(409, 'TRANSICION_INVALIDA'));
  });

  describe('éxito', () => {
    let tx;
    let reserva;

    beforeEach(async () => {
      tx = crearEjecutorFalso([filaReserva()], [], PAGOS);
      usarTransaccion(tx);
      reserva = await reservasService.confirmar('12', 1);
    });

    it('lee con UPDLOCK y actualiza a CONFIRMADA con ActualizadaEn', () => {
      assert.match(tx.llamadas[0].texto, /FROM Reserva WITH \(UPDLOCK\)/);
      assert.equal(tx.llamadas[0].inputs.id.valor, 12);
      const { texto, inputs } = tx.llamadas[1];
      assert.match(texto, /UPDATE Reserva SET Estado = @estado, ActualizadaEn = @ahora WHERE Id = @id/);
      assert.equal(inputs.estado.tipo.type, sql.VarChar);
      assert.equal(inputs.estado.valor, 'CONFIRMADA');
      assert.equal(inputs.ahora.valor.getTime(), AHORA_NICARAGUA.getTime());
    });

    it('audita con el admin y notifica al cliente dentro de la transacción', () => {
      assert.deepEqual(auditoriaService.registrar.mock.calls[0].arguments, [
        tx,
        auditoriaEsperada({ accion: 'CONFIRMAR', estadoAnterior: 'PAGADA', estadoNuevo: 'CONFIRMADA', usuarioId: 1 }),
      ]);
      assert.deepEqual(notificacionesService.crear.mock.calls[0].arguments, [
        tx,
        { usuarioId: 5, reservaId: 12, mensaje: 'Reserva #12 confirmada: 21/10/2026 19:00' },
      ]);
    });

    it('lee los pagos después del UPDATE y responde con el formato de crear', () => {
      assert.match(tx.llamadas[2].texto, /FROM Pago\s+WHERE ReservaId = @reservaId\s+ORDER BY Id/);
      assert.deepEqual(reserva, {
        id: 12,
        canchaId: 3,
        inicio: '2026-10-21T19:00:00',
        monto: 600,
        estado: 'CONFIRMADA',
        montoPenalizado: null,
        pagos: [{ tipo: 'CARGO', monto: 600, referencia: 'SIM-C-12', creadoEn: '2026-10-19T10:00:00' }],
      });
    });
  });
});

describe('registrarAsistencia', () => {
  // Respuestas en orden: barrido sin filas, lectura, UPDATE y pagos.
  function preparar(fila) {
    mock.method(db, 'obtenerPool', async () => ({}));
    const tx = crearEjecutorFalso([], [fila], [], PAGOS);
    usarTransaccion(tx);
    return tx;
  }
  const inicioEn = (segundos) => new Date(AHORA_NICARAGUA.getTime() + segundos * 1000);

  it('id inválido → 400 VALIDACION sin barrer', async () => {
    await assert.rejects(reservasService.registrarAsistencia('x', 1), esAppError(400, 'VALIDACION'));
    assert.equal(db.enTransaccion.mock.callCount(), 0);
  });

  it('barre los no-show antes de leer la reserva, en otra transacción', async () => {
    const tx = preparar(filaReserva({ Inicio: inicioEn(0) }));
    await reservasService.registrarAsistencia('12', 1);
    assert.match(tx.llamadas[0].texto, /SET Estado = 'NO_SHOW'/);
    assert.match(tx.llamadas[1].texto, /WITH \(UPDLOCK\)/);
    assert.equal(db.enTransaccion.mock.callCount(), 2);
  });

  // Inicio relativo a ahora: positivo = todavía no empezó.
  const aceptados = [
    ['15 min antes del inicio', 15 * 60],
    ['el último segundo del bloque', -(3600 - 1)],
  ];
  for (const [caso, segundos] of aceptados) {
    it(`acepta ${caso}`, async () => {
      preparar(filaReserva({ Inicio: inicioEn(segundos) }));
      const reserva = await reservasService.registrarAsistencia('12', 1);
      assert.equal(reserva.estado, 'COMPLETADA');
    });
  }

  const rechazados = [
    ['15 min + 1 s antes del inicio', 15 * 60 + 1],
    ['terminado el bloque', -3600],
  ];
  for (const [caso, segundos] of rechazados) {
    it(`${caso} → 409 TRANSICION_INVALIDA`, async () => {
      preparar(filaReserva({ Inicio: inicioEn(segundos) }));
      await assert.rejects(reservasService.registrarAsistencia('12', 1), esAppError(409, 'TRANSICION_INVALIDA'));
    });
  }

  for (const estado of ['PAGADA', 'CONFIRMADA']) {
    it(`desde ${estado} → COMPLETADA, auditado y notificado`, async () => {
      const tx = preparar(filaReserva({ Estado: estado, Inicio: inicioEn(0) }));
      await reservasService.registrarAsistencia('12', 1);

      assert.equal(tx.llamadas[2].inputs.estado.valor, 'COMPLETADA');
      assert.deepEqual(
        auditoriaService.registrar.mock.calls[0].arguments[1],
        auditoriaEsperada({ accion: 'REGISTRAR_ASISTENCIA', estadoAnterior: estado, estadoNuevo: 'COMPLETADA', usuarioId: 1 }),
      );
      assert.equal(
        notificacionesService.crear.mock.calls[0].arguments[1].mensaje,
        'Asistencia registrada en la reserva #12: 20/10/2026 13:00',
      );
    });
  }

  for (const estado of ['COMPLETADA', 'CANCELADA', 'NO_SHOW']) {
    it(`desde ${estado} → 409 TRANSICION_INVALIDA`, async () => {
      preparar(filaReserva({ Estado: estado, Inicio: inicioEn(0) }));
      await assert.rejects(reservasService.registrarAsistencia('12', 1), esAppError(409, 'TRANSICION_INVALIDA'));
    });
  }
});

describe('cancelar', () => {
  const CLIENTE = Object.freeze({ id: 5, rol: 'CLIENTE' });
  const OTRO_CLIENTE = Object.freeze({ id: 6, rol: 'CLIENTE' });
  const ADMIN = Object.freeze({ id: 1, rol: 'ADMIN' });
  const inicioEn = (segundos) => new Date(AHORA_NICARAGUA.getTime() + segundos * 1000);
  const H24 = 24 * 3600;

  // Respuestas en orden: barrido sin filas, lectura, UPDATE, pago de reembolso y pagos.
  function preparar(fila, pagos = PAGOS) {
    mock.method(db, 'obtenerPool', async () => ({}));
    const tx = crearEjecutorFalso([], [fila], [], [], pagos);
    usarTransaccion(tx);
    return tx;
  }

  for (const id of ['abc', '0', '2147483648', undefined]) {
    it(`id ${id} → 400 VALIDACION sin tocar la base`, async () => {
      await assert.rejects(reservasService.cancelar(id, CLIENTE), esAppError(400, 'VALIDACION'));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }

  for (const [caso, motivo] of [['número', 3], ['en blanco', '   '], ['de 151 caracteres', 'x'.repeat(151)]]) {
    it(`motivo ${caso} → 400 VALIDACION sin tocar la base`, async () => {
      await assert.rejects(reservasService.cancelar('12', CLIENTE, { motivo }), esAppError(400, 'VALIDACION'));
      assert.equal(db.enTransaccion.mock.callCount(), 0);
    });
  }

  it('motivo de 150 caracteres se acepta', async () => {
    preparar(filaReserva({ Inicio: inicioEn(H24) }));
    const reserva = await reservasService.cancelar('12', CLIENTE, { motivo: 'x'.repeat(150) });
    assert.equal(reserva.estado, 'CANCELADA');
  });

  it('sin cuerpo cancela igual y audita solo el prefijo de penalización', async () => {
    preparar(filaReserva({ Inicio: inicioEn(H24 + 3600) }));
    const reserva = await reservasService.cancelar('12', CLIENTE, undefined);
    assert.equal(reserva.estado, 'CANCELADA');
    assert.equal(
      auditoriaService.registrar.mock.calls[0].arguments[1].motivo,
      'Penalización 0 %: C$ 0.00; reembolso: C$ 600.00.',
    );
  });

  it('barre los no-show antes de leer la reserva, en otra transacción', async () => {
    const tx = preparar(filaReserva({ Inicio: inicioEn(H24) }));
    await reservasService.cancelar('12', CLIENTE);
    assert.match(tx.llamadas[0].texto, /SET Estado = 'NO_SHOW'/);
    assert.match(tx.llamadas[1].texto, /WITH \(UPDLOCK\)/);
    assert.equal(db.enTransaccion.mock.callCount(), 2);
  });

  it('reserva inexistente → 404 NO_ENCONTRADO', async () => {
    mock.method(db, 'obtenerPool', async () => ({}));
    usarTransaccion(crearEjecutorFalso([], []));
    await assert.rejects(reservasService.cancelar('12', CLIENTE), esAppError(404, 'NO_ENCONTRADO'));
  });

  it('reserva ajena en estado final → 403 SIN_PERMISO (no 409), sin escribir', async () => {
    const tx = preparar(filaReserva({ Estado: 'CANCELADA' }));
    await assert.rejects(reservasService.cancelar('12', OTRO_CLIENTE), esAppError(403, 'SIN_PERMISO'));
    assert.equal(tx.llamadas.length, 2);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    assert.equal(notificacionesService.crear.mock.callCount(), 0);
  });

  it('el admin cancela una reserva ajena: audita con su id y notifica al dueño', async () => {
    preparar(filaReserva({ Inicio: inicioEn(H24) }));
    const reserva = await reservasService.cancelar('12', ADMIN);
    assert.equal(reserva.estado, 'CANCELADA');
    assert.equal(auditoriaService.registrar.mock.calls[0].arguments[1].usuarioId, 1);
    assert.equal(notificacionesService.crear.mock.calls[0].arguments[1].usuarioId, 5);
  });

  for (const estado of ['CANCELADA', 'COMPLETADA', 'NO_SHOW']) {
    it(`desde ${estado} → 409 TRANSICION_INVALIDA sin UPDATE`, async () => {
      const tx = preparar(filaReserva({ Estado: estado }));
      await assert.rejects(reservasService.cancelar('12', CLIENTE), esAppError(409, 'TRANSICION_INVALIDA'));
      assert.equal(tx.llamadas.length, 2);
      assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    });
  }

  for (const [caso, segundos] of [['que empieza justo ahora', 0], ['ya empezada', -60]]) {
    it(`reserva ${caso} → 409 TRANSICION_INVALIDA sin UPDATE`, async () => {
      const tx = preparar(filaReserva({ Inicio: inicioEn(segundos) }));
      await assert.rejects(reservasService.cancelar('12', CLIENTE), esAppError(409, 'TRANSICION_INVALIDA'));
      assert.equal(tx.llamadas.length, 2);
    });
  }

  for (const [caso, segundos] of [['exactamente 24 h antes', H24], ['más de 24 h antes', H24 + 1]]) {
    it(`${caso} → 0 % de penalización y reembolso total SIM-R-<id>`, async () => {
      const PAGOS_REEMBOLSO_TOTAL = [
        ...PAGOS,
        { Tipo: 'REEMBOLSO', Monto: 600, Referencia: 'SIM-R-12', CreadoEn: AHORA_NICARAGUA },
      ];
      const tx = preparar(filaReserva({ Estado: 'CONFIRMADA', Inicio: inicioEn(segundos) }), PAGOS_REEMBOLSO_TOTAL);
      const reserva = await reservasService.cancelar('12', CLIENTE);

      const { texto, inputs } = tx.llamadas[2];
      assert.match(texto, /SET Estado = 'CANCELADA', Activa = 0, MontoPenalizado = @montoPenalizado, ActualizadaEn = @ahora/);
      assert.equal(inputs.id.valor, 12);
      assert.equal(inputs.montoPenalizado.tipo.type, sql.Decimal);
      assert.equal(inputs.montoPenalizado.valor, 0);
      assert.equal(inputs.ahora.valor.getTime(), AHORA_NICARAGUA.getTime());
      assert.match(tx.llamadas[3].texto, /INSERT INTO Pago/);
      assert.equal(tx.llamadas[3].inputs.tipo.valor, 'REEMBOLSO');
      assert.equal(tx.llamadas[3].inputs.monto.valor, 600);
      assert.equal(tx.llamadas[3].inputs.referencia.valor, 'SIM-R-12');
      assert.match(tx.llamadas[4].texto, /FROM Pago\s+WHERE ReservaId/);

      assert.equal(reserva.montoPenalizado, 0);
      assert.deepEqual(reserva.pagos.map((p) => [p.tipo, p.monto]), [['CARGO', 600], ['REEMBOLSO', 600]]);
      assert.deepEqual(
        auditoriaService.registrar.mock.calls[0].arguments[1],
        auditoriaEsperada({
          accion: 'CANCELAR',
          estadoAnterior: 'CONFIRMADA',
          estadoNuevo: 'CANCELADA',
          usuarioId: 5,
          motivo: 'Penalización 0 %: C$ 0.00; reembolso: C$ 600.00.',
        }),
      );
    });
  }

  describe('menos de 24 h antes → 50 %', () => {
    let tx;
    let reserva;
    const PAGOS_CON_REEMBOLSO = [
      ...PAGOS,
      { Tipo: 'REEMBOLSO', Monto: 300, Referencia: 'SIM-R-12', CreadoEn: AHORA_NICARAGUA },
    ];

    beforeEach(async () => {
      tx = preparar(filaReserva({ Inicio: inicioEn(H24 - 1) }), PAGOS_CON_REEMBOLSO);
      reserva = await reservasService.cancelar('12', CLIENTE, { motivo: '  Me enfermé  ' });
    });

    it('guarda la mitad como penalización e inserta el reembolso SIM-R-<id>', () => {
      assert.equal(tx.llamadas[2].inputs.montoPenalizado.valor, 300);
      const { texto, inputs } = tx.llamadas[3];
      assert.match(texto, /INSERT INTO Pago/);
      assert.equal(inputs.reservaId.valor, 12);
      assert.equal(inputs.tipo.valor, 'REEMBOLSO');
      assert.equal(inputs.monto.valor, 300);
      assert.equal(inputs.referencia.valor, 'SIM-R-12');
      assert.equal(inputs.creadoEn.valor.getTime(), AHORA_NICARAGUA.getTime());
    });

    it('audita con el motivo recortado y notifica al cliente en la misma transacción', () => {
      assert.deepEqual(auditoriaService.registrar.mock.calls[0].arguments, [
        tx,
        auditoriaEsperada({
          accion: 'CANCELAR',
          estadoAnterior: 'PAGADA',
          estadoNuevo: 'CANCELADA',
          usuarioId: 5,
          motivo: 'Penalización 50 %: C$ 300.00; reembolso: C$ 300.00. Motivo: Me enfermé',
        }),
      ]);
      assert.deepEqual(notificacionesService.crear.mock.calls[0].arguments, [
        tx,
        {
          usuarioId: 5,
          reservaId: 12,
          mensaje: 'Reserva #12 cancelada: 21/10/2026 12:59. Penalización 50 %: C$ 300.00; reembolso: C$ 300.00.',
        },
      ]);
    });

    it('responde con montoPenalizado y los dos pagos', () => {
      assert.deepEqual(reserva, {
        id: 12,
        canchaId: 3,
        inicio: '2026-10-21T12:59:59',
        monto: 600,
        estado: 'CANCELADA',
        montoPenalizado: 300,
        pagos: [
          { tipo: 'CARGO', monto: 600, referencia: 'SIM-C-12', creadoEn: '2026-10-19T10:00:00' },
          { tipo: 'REEMBOLSO', monto: 300, referencia: 'SIM-R-12', creadoEn: '2026-10-20T13:00:00' },
        ],
      });
    });
  });

  it('con el monto máximo de DECIMAL(10,2) y un motivo de 150 caracteres, el motivo auditado cabe en 250', async () => {
    preparar(filaReserva({ Monto: 99999999.99, Inicio: inicioEn(3600) }));
    await reservasService.cancelar('12', CLIENTE, { motivo: 'x'.repeat(150) });
    const { motivo } = auditoriaService.registrar.mock.calls[0].arguments[1];
    assert.match(motivo, /^Penalización 50 %: C\$ 50000000\.00; reembolso: C\$ 49999999\.99\. Motivo: x{150}$/);
    assert.ok(motivo.length <= 250, `motivo de ${motivo.length} caracteres`);
  });
});

describe('consultarCancelacion', () => {
  const CLIENTE = Object.freeze({ id: 5, rol: 'CLIENTE' });
  const OTRO_CLIENTE = Object.freeze({ id: 6, rol: 'CLIENTE' });
  const ADMIN = Object.freeze({ id: 1, rol: 'ADMIN' });
  const inicioEn = (segundos) => new Date(AHORA_NICARAGUA.getTime() + segundos * 1000);
  const H24 = 24 * 3600;

  // Solo el pool: enTransaccion sigue con el mock que prohíbe conectarse.
  function preparar(...respuestas) {
    const pool = crearEjecutorFalso(...respuestas);
    mock.method(db, 'obtenerPool', async () => pool);
    return pool;
  }

  it('id inválido → 400 VALIDACION sin tocar la base', async () => {
    await assert.rejects(reservasService.consultarCancelacion('abc', CLIENTE), esAppError(400, 'VALIDACION'));
    assert.equal(db.obtenerPool.mock.callCount(), 0);
  });

  it('reserva inexistente → 404 NO_ENCONTRADO', async () => {
    preparar([]);
    await assert.rejects(reservasService.consultarCancelacion('12', CLIENTE), esAppError(404, 'NO_ENCONTRADO'));
  });

  it('reserva ajena en estado final → 403 SIN_PERMISO (no 409)', async () => {
    preparar([filaReserva({ Estado: 'CANCELADA' })]);
    await assert.rejects(reservasService.consultarCancelacion('12', OTRO_CLIENTE), esAppError(403, 'SIN_PERMISO'));
  });

  for (const estado of ['CANCELADA', 'COMPLETADA', 'NO_SHOW']) {
    it(`desde ${estado} → 409 TRANSICION_INVALIDA`, async () => {
      preparar([filaReserva({ Estado: estado })]);
      await assert.rejects(reservasService.consultarCancelacion('12', CLIENTE), esAppError(409, 'TRANSICION_INVALIDA'));
    });
  }

  for (const [caso, segundos] of [['que empieza justo ahora', 0], ['ya empezada', -60]]) {
    it(`reserva ${caso} → 409 TRANSICION_INVALIDA`, async () => {
      preparar([filaReserva({ Inicio: inicioEn(segundos) })]);
      await assert.rejects(reservasService.consultarCancelacion('12', CLIENTE), esAppError(409, 'TRANSICION_INVALIDA'));
    });
  }

  it('exactamente 24 h antes → 0 % y reembolso total', async () => {
    preparar([filaReserva({ Inicio: inicioEn(H24) })]);
    assert.deepEqual(await reservasService.consultarCancelacion('12', CLIENTE), {
      porcentajePenalizacion: 0,
      montoPenalizado: 0,
      reembolso: 600,
    });
  });

  it('menos de 24 h con monto impar → 50 %, el centavo de redondeo va a la penalización', async () => {
    preparar([filaReserva({ Monto: 600.01, Inicio: inicioEn(H24 - 1) })]);
    assert.deepEqual(await reservasService.consultarCancelacion('12', CLIENTE), {
      porcentajePenalizacion: 50,
      montoPenalizado: 300.01,
      reembolso: 300,
    });
  });

  it('el admin consulta una reserva ajena', async () => {
    preparar([filaReserva({ Inicio: inicioEn(H24) })]);
    const costo = await reservasService.consultarCancelacion('12', ADMIN);
    assert.equal(costo.reembolso, 600);
  });

  it('lee con el pool sin bloqueo y no escribe nada', async () => {
    const pool = preparar([filaReserva({ Inicio: inicioEn(H24 - 1) })]);
    await reservasService.consultarCancelacion('12', CLIENTE);

    assert.equal(pool.llamadas.length, 1);
    const { texto, inputs } = pool.llamadas[0];
    assert.match(texto, /SELECT Id, ClienteId, CanchaId, Inicio, Monto, Estado, MontoPenalizado\s+FROM Reserva\s+WHERE Id = @id/);
    assert.doesNotMatch(texto, /UPDLOCK|UPDATE|INSERT/);
    assert.equal(inputs.id.valor, 12);
    assert.equal(db.enTransaccion.mock.callCount(), 0);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    assert.equal(notificacionesService.crear.mock.callCount(), 0);
  });
});

describe('contarFuturasActivas', () => {
  it('cuenta PAGADA/CONFIRMADA futuras con Activa = 1 literal', async () => {
    const ejecutor = crearEjecutorFalso([{ Cantidad: 4 }]);
    assert.equal(await reservasService.contarFuturasActivas(ejecutor, 3), 4);
    const { texto, inputs } = ejecutor.llamadas[0];
    assert.match(texto, /WHERE Activa = 1 AND CanchaId = @canchaId/);
    assert.match(texto, /Estado IN \('PAGADA', 'CONFIRMADA'\) AND Inicio > @ahora/);
    assert.equal(inputs.canchaId.valor, 3);
    assert.equal(inputs.ahora.valor.getTime(), AHORA_NICARAGUA.getTime());
  });

  for (const canchaId of ['3', 0, 1.5, null]) {
    it(`canchaId ${canchaId} → TypeError`, async () => {
      await assert.rejects(reservasService.contarFuturasActivas(crearEjecutorFalso(), canchaId), TypeError);
    });
  }
});

describe('cancelarPorBajaDeCancha', () => {
  const FUTURAS = [
    { Id: 20, ClienteId: 5, Inicio: new Date('2026-10-22T08:00:00Z'), Monto: 600, Estado: 'PAGADA' },
    { Id: 21, ClienteId: 6, Inicio: new Date('2026-10-23T19:00:00Z'), Monto: 1200, Estado: 'CONFIRMADA' },
  ];
  const comoTransaccion = (ejecutor) => Object.setPrototypeOf(ejecutor, sql.Transaction.prototype);

  it('con un pool → TypeError', async () => {
    await assert.rejects(reservasService.cancelarPorBajaDeCancha({}, 3, 1), TypeError);
  });

  it('con un ejecutor que no es Transaction → TypeError sin escribir', async () => {
    const ejecutor = crearEjecutorFalso(FUTURAS);
    await assert.rejects(reservasService.cancelarPorBajaDeCancha(ejecutor, 3, 1), TypeError);
    assert.equal(ejecutor.llamadas.length, 0);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
  });

  for (const [caso, canchaId, adminId] of [['canchaId como texto', '3', 1], ['adminId nulo', 3, null]]) {
    it(`${caso} → TypeError sin escribir`, async () => {
      const tx = comoTransaccion(crearEjecutorFalso(FUTURAS));
      await assert.rejects(reservasService.cancelarPorBajaDeCancha(tx, canchaId, adminId), TypeError);
      assert.equal(tx.llamadas.length, 0);
    });
  }

  describe('con dos reservas futuras', () => {
    let tx;
    let cantidad;

    beforeEach(async () => {
      tx = comoTransaccion(crearEjecutorFalso(FUTURAS));
      cantidad = await reservasService.cancelarPorBajaDeCancha(tx, 3, 1);
    });

    it('cancela con un solo UPDATE filtrado con Activa = 1 literal y devuelve la cantidad', () => {
      const { texto, inputs } = tx.llamadas[0];
      assert.match(texto, /SET Estado = 'CANCELADA', Activa = 0, MontoPenalizado = 0, ActualizadaEn = @ahora/);
      assert.match(texto, /WHERE Activa = 1 AND CanchaId = @canchaId/);
      assert.match(texto, /Estado IN \('PAGADA', 'CONFIRMADA'\) AND Inicio > @ahora/);
      assert.equal(inputs.canchaId.valor, 3);
      assert.equal(inputs.ahora.valor.getTime(), AHORA_NICARAGUA.getTime());
      assert.equal(cantidad, 2);
    });

    it('reembolsa el monto completo de cada una con SIM-R-<id>', () => {
      const pagos = tx.llamadas
        .slice(1)
        .map(({ inputs }) => [inputs.tipo.valor, inputs.monto.valor, inputs.referencia.valor]);
      assert.deepEqual(pagos, [
        ['REEMBOLSO', 600, 'SIM-R-20'],
        ['REEMBOLSO', 1200, 'SIM-R-21'],
      ]);
    });

    it('audita con el admin y notifica a cada cliente en la misma transacción', () => {
      assert.deepEqual(
        auditoriaService.registrar.mock.calls.map((c) => c.arguments),
        [
          [tx, {
            entidad: 'RESERVA',
            entidadId: 20,
            accion: 'CANCELAR',
            estadoAnterior: 'PAGADA',
            estadoNuevo: 'CANCELADA',
            usuarioId: 1,
            motivo: 'Penalización 0 %: C$ 0.00; reembolso: C$ 600.00. Motivo: baja de la cancha',
          }],
          [tx, {
            entidad: 'RESERVA',
            entidadId: 21,
            accion: 'CANCELAR',
            estadoAnterior: 'CONFIRMADA',
            estadoNuevo: 'CANCELADA',
            usuarioId: 1,
            motivo: 'Penalización 0 %: C$ 0.00; reembolso: C$ 1200.00. Motivo: baja de la cancha',
          }],
        ],
      );
      assert.deepEqual(
        notificacionesService.crear.mock.calls.map((c) => c.arguments),
        [
          [tx, {
            usuarioId: 5,
            reservaId: 20,
            mensaje: 'Reserva #20 cancelada por baja de la cancha: 22/10/2026 08:00. Reembolso total: C$ 600.00',
          }],
          [tx, {
            usuarioId: 6,
            reservaId: 21,
            mensaje: 'Reserva #21 cancelada por baja de la cancha: 23/10/2026 19:00. Reembolso total: C$ 1200.00',
          }],
        ],
      );
    });
  });

  it('sin reservas futuras devuelve 0 y no escribe nada más', async () => {
    const tx = comoTransaccion(crearEjecutorFalso([]));
    assert.equal(await reservasService.cancelarPorBajaDeCancha(tx, 3, 1), 0);
    assert.equal(tx.llamadas.length, 1);
    assert.equal(auditoriaService.registrar.mock.callCount(), 0);
    assert.equal(notificacionesService.crear.mock.callCount(), 0);
  });
});

// ─── Consultas (#19) ───

const CLIENTE = Object.freeze({ id: 5, rol: 'CLIENTE', nombre: 'Cliente Uno' });
const ADMIN = Object.freeze({ id: 1, rol: 'ADMIN', nombre: 'Admin' });

const FILA_PAGADA = Object.freeze({
  Id: 30, ClienteId: 5, CanchaId: 3, Inicio: new Date('2026-10-21T19:00:00Z'),
  Monto: 600, Estado: 'PAGADA', MontoPenalizado: null,
});
const FILA_CANCELADA = Object.freeze({
  Id: 31, ClienteId: 6, CanchaId: 6, Inicio: new Date('2026-10-22T08:00:00Z'),
  Monto: 1200, Estado: 'CANCELADA', MontoPenalizado: 0,
});
const FILA_NO_SHOW = Object.freeze({
  Id: 32, ClienteId: 5, CanchaId: 3, Inicio: new Date('2026-10-19T10:00:00Z'),
  Monto: 600, Estado: 'NO_SHOW', MontoPenalizado: 600,
});
const CREADO = new Date('2026-10-18T09:00:00Z');
const FILAS_PAGO = Object.freeze([
  { ReservaId: 30, Tipo: 'CARGO', Monto: 600, Referencia: 'SIM-C-30', CreadoEn: CREADO },
  { ReservaId: 31, Tipo: 'CARGO', Monto: 1200, Referencia: 'SIM-C-31', CreadoEn: CREADO },
  { ReservaId: 32, Tipo: 'CARGO', Monto: 600, Referencia: 'SIM-C-32', CreadoEn: CREADO },
  { ReservaId: 31, Tipo: 'REEMBOLSO', Monto: 1200, Referencia: 'SIM-R-31', CreadoEn: AHORA_NICARAGUA },
]);
const CANCHAS = Object.freeze([
  { id: 3, nombre: 'Sala 3', tipoCodigo: 'SALA', precioHora: 600 },
  { id: 6, nombre: 'Campo 1', tipoCodigo: 'CAMPO', precioHora: 1200 },
]);
const CLIENTES = Object.freeze([
  { id: 5, nombre: 'Cliente Uno' },
  { id: 6, nombre: 'Cliente Dos' },
]);

const cargo = (id, monto) => ({ tipo: 'CARGO', monto, referencia: `SIM-C-${id}`, creadoEn: '2026-10-18T09:00:00' });

const RESPUESTA_PAGADA = Object.freeze({
  id: 30, canchaId: 3, inicio: '2026-10-21T19:00:00', monto: 600, estado: 'PAGADA', montoPenalizado: null,
  pagos: [cargo(30, 600)],
  canchaNombre: 'Sala 3', tipoCodigo: 'SALA',
});
const RESPUESTA_CANCELADA = Object.freeze({
  id: 31, canchaId: 6, inicio: '2026-10-22T08:00:00', monto: 1200, estado: 'CANCELADA', montoPenalizado: 0,
  pagos: [
    cargo(31, 1200),
    { tipo: 'REEMBOLSO', monto: 1200, referencia: 'SIM-R-31', creadoEn: '2026-10-20T13:00:00' },
  ],
  canchaNombre: 'Campo 1', tipoCodigo: 'CAMPO',
});
const RESPUESTA_NO_SHOW = Object.freeze({
  id: 32, canchaId: 3, inicio: '2026-10-19T10:00:00', monto: 600, estado: 'NO_SHOW', montoPenalizado: 600,
  pagos: [cargo(32, 600)],
  canchaNombre: 'Sala 3', tipoCodigo: 'SALA',
});

// El barrido usa su propia transacción; la lectura, el pool. El barrido tiene que ocurrir antes de leer.
function prepararConsulta(...respuestasPool) {
  const barrido = crearEjecutorFalso([]);
  const pool = crearEjecutorFalso(...respuestasPool);
  mock.method(db, 'enTransaccion', async (fn) => {
    assert.equal(pool.llamadas.length, 0, 'el barrido debe ir antes de cualquier lectura');
    return fn(barrido);
  });
  mock.method(db, 'obtenerPool', async () => pool);
  return { barrido, pool };
}

function simularOtrosModulos() {
  mock.method(canchasService, 'listarPorIds', async () => CANCHAS.map((c) => ({ ...c })));
  mock.method(usuariosService, 'listarNombresPorIds', async () => CLIENTES.map((u) => ({ ...u })));
}

function sinTocarLaBase() {
  assert.equal(db.obtenerPool.mock.callCount(), 0);
  assert.equal(db.enTransaccion.mock.callCount(), 0);
}

describe('listarMias', () => {
  beforeEach(simularOtrosModulos);

  it('barre, lee las del cliente de la más reciente a la más antigua y arma la respuesta sin datos del cliente', async () => {
    const { barrido, pool } = prepararConsulta([FILA_PAGADA, FILA_NO_SHOW], FILAS_PAGO.filter((p) => p.ReservaId !== 31));

    const reservas = await reservasService.listarMias(5);

    assert.deepEqual(reservas, [RESPUESTA_PAGADA, RESPUESTA_NO_SHOW]);
    assert.equal(db.enTransaccion.mock.callCount(), 1);
    assert.match(barrido.llamadas[0].texto, /SET Estado = 'NO_SHOW'/);

    const { texto, inputs } = pool.llamadas[0];
    assert.match(texto, /FROM Reserva\s+WHERE ClienteId = @clienteId\s+ORDER BY Inicio DESC, Id DESC/);
    assert.doesNotMatch(texto, /JOIN/);
    assert.equal(inputs.clienteId.tipo, sql.Int);
    assert.equal(inputs.clienteId.valor, 5);
  });

  it('sin N+1: reservas y pagos en dos consultas, canchas en una llamada con ids únicos y sin usuarios', async () => {
    const { pool } = prepararConsulta([FILA_PAGADA, FILA_NO_SHOW], []);

    await reservasService.listarMias(5);

    assert.equal(pool.llamadas.length, 2);
    assert.equal(canchasService.listarPorIds.mock.callCount(), 1);
    assert.deepEqual(canchasService.listarPorIds.mock.calls[0].arguments, [pool, [3]]);
    assert.equal(usuariosService.listarNombresPorIds.mock.callCount(), 0);
  });

  it('sin reservas devuelve [] sin consultar pagos, canchas ni usuarios', async () => {
    const { pool } = prepararConsulta([]);

    assert.deepEqual(await reservasService.listarMias(5), []);
    assert.equal(pool.llamadas.length, 1);
    assert.equal(canchasService.listarPorIds.mock.callCount(), 0);
    assert.equal(usuariosService.listarNombresPorIds.mock.callCount(), 0);
  });
});

describe('obtener', () => {
  beforeEach(simularOtrosModulos);

  for (const id of ['abc', '0', '-1', '1.5', '', '2147483648']) {
    it(`id ${JSON.stringify(id)} → 400 VALIDACION sin tocar la base`, async () => {
      await assert.rejects(reservasService.obtener(id, CLIENTE), esAppError(400, 'VALIDACION'));
      sinTocarLaBase();
    });
  }

  it('inexistente → 404 NO_ENCONTRADO, después del barrido', async () => {
    const { pool } = prepararConsulta([]);

    await assert.rejects(reservasService.obtener('99', CLIENTE), esAppError(404, 'NO_ENCONTRADO'));
    assert.equal(db.enTransaccion.mock.callCount(), 1);
    assert.equal(pool.llamadas.length, 1);
    assert.match(pool.llamadas[0].texto, /FROM Reserva\s+WHERE Id = @id/);
    assert.doesNotMatch(pool.llamadas[0].texto, /UPDLOCK/);
    assert.equal(pool.llamadas[0].inputs.id.valor, 99);
  });

  it('ajena para un cliente → 403 SIN_PERMISO sin consultar pagos, canchas ni usuarios', async () => {
    const { pool } = prepararConsulta([FILA_CANCELADA]);

    await assert.rejects(reservasService.obtener('31', CLIENTE), esAppError(403, 'SIN_PERMISO'));
    assert.equal(pool.llamadas.length, 1);
    assert.equal(canchasService.listarPorIds.mock.callCount(), 0);
    assert.equal(usuariosService.listarNombresPorIds.mock.callCount(), 0);
  });

  it('propia para el cliente → la reserva con pagos y cancha, sin datos del cliente', async () => {
    const { pool } = prepararConsulta([FILA_PAGADA], [FILAS_PAGO[0]]);

    assert.deepEqual(await reservasService.obtener('30', CLIENTE), RESPUESTA_PAGADA);
    assert.equal(pool.llamadas.length, 2);
    assert.equal(pool.llamadas[1].inputs.ids.valor, '[30]');
    assert.deepEqual(canchasService.listarPorIds.mock.calls[0].arguments, [pool, [3]]);
    assert.equal(usuariosService.listarNombresPorIds.mock.callCount(), 0);
  });

  it('para el admin → cualquier reserva, con clienteId y clienteNombre', async () => {
    const { pool } = prepararConsulta([FILA_CANCELADA], FILAS_PAGO.filter((p) => p.ReservaId === 31));
    mock.method(usuariosService, 'listarNombresPorIds', async () => [{ id: 6, nombre: 'Cliente Dos' }]);

    const reserva = await reservasService.obtener('31', ADMIN);

    assert.deepEqual(reserva, { ...RESPUESTA_CANCELADA, clienteId: 6, clienteNombre: 'Cliente Dos' });
    assert.deepEqual(usuariosService.listarNombresPorIds.mock.calls[0].arguments, [pool, [6]]);
  });
});

describe('listar (admin)', () => {
  beforeEach(simularOtrosModulos);

  it('sin N+1: barrido, reservas y pagos en dos consultas, una llamada a canchas y una a usuarios con ids únicos', async () => {
    const { pool } = prepararConsulta([FILA_NO_SHOW, FILA_PAGADA, FILA_CANCELADA], FILAS_PAGO);

    const reservas = await reservasService.listar({});

    assert.equal(db.enTransaccion.mock.callCount(), 1);
    assert.equal(pool.llamadas.length, 2);
    assert.equal(canchasService.listarPorIds.mock.callCount(), 1);
    assert.deepEqual(canchasService.listarPorIds.mock.calls[0].arguments, [pool, [3, 6]]);
    assert.equal(usuariosService.listarNombresPorIds.mock.callCount(), 1);
    assert.deepEqual(usuariosService.listarNombresPorIds.mock.calls[0].arguments, [pool, [5, 6]]);

    // Los pagos se piden en una sola consulta, con todos los ids en un único parámetro JSON.
    const pagos = pool.llamadas[1];
    assert.deepEqual(Object.keys(pagos.inputs), ['ids']);
    assert.equal(pagos.inputs.ids.tipo.type, sql.NVarChar);
    assert.equal(pagos.inputs.ids.valor, '[32,30,31]');
    assert.match(pagos.texto, /WHERE ReservaId IN \(SELECT CAST\(value AS INT\) FROM OPENJSON\(@ids\)\)/);
    assert.match(pagos.texto, /ORDER BY Id/);

    // Mismo orden que la base; pagos agrupados por reserva y con datos de cliente.
    assert.deepEqual(reservas, [
      { ...RESPUESTA_NO_SHOW, clienteId: 5, clienteNombre: 'Cliente Uno' },
      { ...RESPUESTA_PAGADA, clienteId: 5, clienteNombre: 'Cliente Uno' },
      { ...RESPUESTA_CANCELADA, clienteId: 6, clienteNombre: 'Cliente Dos' },
    ]);
  });

  it('sin reservas devuelve [] sin consultar pagos, canchas ni usuarios', async () => {
    const { pool } = prepararConsulta([]);

    assert.deepEqual(await reservasService.listar({}), []);
    assert.equal(pool.llamadas.length, 1);
    assert.equal(canchasService.listarPorIds.mock.callCount(), 0);
    assert.equal(usuariosService.listarNombresPorIds.mock.callCount(), 0);
  });

  it('la consulta solo lee Reserva, en orden de agenda y con filtros opcionales', async () => {
    const { pool } = prepararConsulta([]);
    await reservasService.listar({});

    const { texto } = pool.llamadas[0];
    assert.doesNotMatch(texto, /JOIN|Cancha c|Usuario/);
    assert.match(texto, /\(@desde IS NULL OR Inicio >= @desde\)/);
    assert.match(texto, /\(@hasta IS NULL OR Inicio < @hasta\)/);
    assert.match(texto, /\(@canchaId IS NULL OR CanchaId = @canchaId\)/);
    assert.match(texto, /\(@estado IS NULL OR Estado = @estado\)/);
    assert.match(texto, /ORDER BY Inicio, Id\s+OPTION \(RECOMPILE\)/);
  });

  for (const [caso, consulta] of [
    ['sin consulta', undefined],
    ['sin filtros', {}],
    ['filtros vacíos', { desde: '', hasta: '', canchaId: '', estado: '' }],
  ]) {
    it(`${caso} → todos los filtros en null`, async () => {
      const { pool } = prepararConsulta([]);
      await reservasService.listar(consulta);

      const { inputs } = pool.llamadas[0];
      assert.equal(inputs.desde.valor, null);
      assert.equal(inputs.hasta.valor, null);
      assert.equal(inputs.canchaId.valor, null);
      assert.equal(inputs.estado.valor, null);
    });
  }

  it('desde = hasta → ese día completo: [00:00, 00:00 del día siguiente)', async () => {
    const { pool } = prepararConsulta([]);
    await reservasService.listar({ desde: '2026-10-21', hasta: '2026-10-21' });

    const { inputs } = pool.llamadas[0];
    assert.equal(inputs.desde.tipo.type, sql.DateTime2);
    assert.equal(inputs.desde.valor.toISOString(), '2026-10-21T00:00:00.000Z');
    assert.equal(inputs.hasta.tipo.type, sql.DateTime2);
    assert.equal(inputs.hasta.valor.toISOString(), '2026-10-22T00:00:00.000Z');
  });

  it('hasta inclusivo a fin de mes pasa al primer día del mes siguiente', async () => {
    const { pool } = prepararConsulta([]);
    await reservasService.listar({ desde: '2026-10-01', hasta: '2026-10-31' });

    assert.equal(pool.llamadas[0].inputs.hasta.valor.toISOString(), '2026-11-01T00:00:00.000Z');
  });

  it('solo desde → sin límite superior', async () => {
    const { pool } = prepararConsulta([]);
    await reservasService.listar({ desde: '2026-10-21' });

    const { inputs } = pool.llamadas[0];
    assert.equal(inputs.desde.valor.toISOString(), '2026-10-21T00:00:00.000Z');
    assert.equal(inputs.hasta.valor, null);
  });

  it('solo hasta → sin límite inferior', async () => {
    const { pool } = prepararConsulta([]);
    await reservasService.listar({ hasta: '2026-10-21' });

    const { inputs } = pool.llamadas[0];
    assert.equal(inputs.desde.valor, null);
    assert.equal(inputs.hasta.valor.toISOString(), '2026-10-22T00:00:00.000Z');
  });

  it('canchaId y estado → Int y VarChar(12)', async () => {
    const { pool } = prepararConsulta([]);
    await reservasService.listar({ canchaId: '3', estado: 'CANCELADA' });

    const { inputs } = pool.llamadas[0];
    assert.equal(inputs.canchaId.tipo, sql.Int);
    assert.equal(inputs.canchaId.valor, 3);
    assert.equal(inputs.estado.tipo.type, sql.VarChar);
    assert.equal(inputs.estado.tipo.length, 12);
    assert.equal(inputs.estado.valor, 'CANCELADA');
  });

  for (const estado of ['PAGADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_SHOW']) {
    it(`acepta estado ${estado}`, async () => {
      const { pool } = prepararConsulta([]);
      await reservasService.listar({ estado });
      assert.equal(pool.llamadas[0].inputs.estado.valor, estado);
    });
  }

  const invalidos = [
    ['desde con otro formato', { desde: '20/10/2026' }, /^desde: se espera YYYY-MM-DD/],
    ['desde con hora', { desde: '2026-10-20T00:00:00' }, /^desde: se espera YYYY-MM-DD/],
    ['desde inexistente', { desde: '2026-02-30' }, /^desde: no es una fecha del calendario/],
    ['hasta con mes 13', { hasta: '2026-13-01' }, /^hasta: no es una fecha del calendario/],
    ['hasta sin ceros', { hasta: '2026-1-5' }, /^hasta: se espera YYYY-MM-DD/],
    ['desde posterior a hasta', { desde: '2026-10-22', hasta: '2026-10-21' }, /^desde: no puede ser posterior a hasta/],
    ['canchaId 0', { canchaId: '0' }, /^canchaId:/],
    ['canchaId negativo', { canchaId: '-1' }, /^canchaId:/],
    ['canchaId no numérico', { canchaId: 'abc' }, /^canchaId:/],
    ['canchaId decimal', { canchaId: '1.5' }, /^canchaId:/],
    ['canchaId fuera de INT', { canchaId: '2147483648' }, /^canchaId:/],
    ['estado desconocido', { estado: 'PENDIENTE' }, /^estado:/],
    ['estado en minúsculas', { estado: 'pagada' }, /^estado:/],
    ['desde repetido', { desde: ['2026-10-20', '2026-10-21'] }, /^desde:/],
    ['hasta repetido', { hasta: ['2026-10-20', '2026-10-21'] }, /^hasta:/],
    ['canchaId repetido', { canchaId: ['1', '2'] }, /^canchaId:/],
    ['estado repetido', { estado: ['PAGADA', 'CANCELADA'] }, /^estado:/],
  ];

  for (const [caso, consulta, mensaje] of invalidos) {
    it(`rechaza ${caso} con 400 VALIDACION sin tocar la base`, async () => {
      await assert.rejects(reservasService.listar(consulta), (err) => {
        assert.ok(esAppError(400, 'VALIDACION')(err), `se esperaba 400 VALIDACION y llegó ${err}`);
        assert.match(err.message, mensaje);
        return true;
      });
      sinTocarLaBase();
    });
  }
});
