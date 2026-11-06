const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../config/db');
const AppError = require('../../shared/AppError');
const canchasService = require('../canchas/canchas.service');
const horariosService = require('../horarios/horarios.service');
const reservasService = require('../reservas/reservas.service');
const disponibilidadService = require('./disponibilidad.service');

// Ahora: martes 2026-10-20 13:20 en Nicaragua (19:20 UTC).
const AHORA_UTC = Date.UTC(2026, 9, 20, 19, 20, 0);
const POOL = Object.freeze({ nombre: 'pool' });

const CANCHAS = [
  { id: 1, nombre: 'Sala 1', tipoCodigo: 'SALA', precioHora: 600 },
  { id: 2, nombre: 'Sala 2', tipoCodigo: 'SALA', precioHora: 600 },
  { id: 6, nombre: 'Campo 1', tipoCodigo: 'CAMPO', precioHora: 1200 },
];

// La cancha 6 no tiene horario ese día; la 4 tiene horario pero no está entre las activas.
const HORARIOS = [
  { canchaId: 1, apertura: 7, cierre: 10 },
  { canchaId: 2, apertura: 7, cierre: 9 },
  { canchaId: 4, apertura: 7, cierre: 22 },
];

const fecha = (texto) => new Date(`${texto}Z`);

function esValidacion(mensaje) {
  return (err) => {
    assert.ok(err instanceof AppError, `se esperaba AppError y llegó ${err}`);
    assert.equal(err.status, 400);
    assert.equal(err.codigo, 'VALIDACION');
    if (mensaje) assert.match(err.message, mensaje);
    return true;
  };
}

// Prepara las tres consultas y anota el orden de las llamadas.
function preparar({ canchas = CANCHAS, horarios = HORARIOS, ocupadas = [] } = {}) {
  const orden = [];
  mock.method(db, 'obtenerPool', async () => POOL);
  mock.method(reservasService, 'barrerNoShow', async () => {
    orden.push('barrerNoShow');
    return 0;
  });
  mock.method(canchasService, 'listarActivas', async () => {
    orden.push('listarActivas');
    return canchas;
  });
  mock.method(horariosService, 'listarDelDia', async () => {
    orden.push('listarDelDia');
    return horarios;
  });
  mock.method(reservasService, 'ocupadosEnRango', async () => {
    orden.push('ocupadosEnRango');
    return ocupadas;
  });
  return orden;
}

const bloquesDe = (resultado, canchaId) => resultado.find((c) => c.canchaId === canchaId)?.bloques;

beforeEach(() => {
  mock.method(Date, 'now', () => AHORA_UTC);
  // Si alguna llamada escapa a los mocks, la prueba falla en vez de abrir una conexión.
  const conexionProhibida = async () => {
    throw new Error('la prueba intentó conectarse');
  };
  mock.method(db, 'obtenerPool', conexionProhibida);
  mock.method(db, 'enTransaccion', conexionProhibida);
  mock.method(reservasService, 'barrerNoShow', conexionProhibida);
  mock.method(canchasService, 'listarActivas', conexionProhibida);
  mock.method(horariosService, 'listarDelDia', conexionProhibida);
  mock.method(reservasService, 'ocupadosEnRango', conexionProhibida);
});

afterEach(() => mock.restoreAll());

describe('disponibilidad: validación de la entrada', () => {
  const invalidas = [
    ['fecha ausente', { fecha: undefined }, /YYYY-MM-DD/],
    ['fecha vacía', { fecha: '' }, /YYYY-MM-DD/],
    ['fecha con hora', { fecha: '2026-10-21T00:00:00' }, /YYYY-MM-DD/],
    ['fecha en otro orden', { fecha: '21-10-2026' }, /YYYY-MM-DD/],
    ['fecha repetida', { fecha: ['2026-10-21', '2026-10-22'] }, /YYYY-MM-DD/],
    ['fecha imposible', { fecha: '2026-02-30' }, /calendario/],
    ['mes 13', { fecha: '2026-13-01' }, /calendario/],
    ['tipo repetido', { fecha: '2026-10-21', tipo: ['SALA', 'CAMPO'] }, /tipo/],
    ['tipo de 11 caracteres', { fecha: '2026-10-21', tipo: 'ABCDEFGHIJK' }, /tipo/],
    ['ayer', { fecha: '2026-10-19' }, /entre hoy y dentro de 30 días/],
    ['hoy + 31 días', { fecha: '2026-11-20' }, /entre hoy y dentro de 30 días/],
  ];
  for (const [caso, consulta, mensaje] of invalidas) {
    it(`${caso} → 400 VALIDACION sin tocar la base`, async () => {
      await assert.rejects(disponibilidadService.consultar(consulta), esValidacion(mensaje));
      assert.equal(reservasService.barrerNoShow.mock.callCount(), 0);
    });
  }

  it('sin query → 400 VALIDACION', async () => {
    await assert.rejects(disponibilidadService.consultar(), esValidacion(/fecha/));
  });

  for (const [caso, texto] of [
    ['hoy', '2026-10-20'],
    ['hoy + 30 días', '2026-11-19'],
  ]) {
    it(`acepta ${caso}`, async () => {
      preparar();
      await disponibilidadService.consultar({ fecha: texto });
    });
  }
});

describe('disponibilidad: consultas', () => {
  it('barre los no-show con el pool antes de las tres consultas, una vez cada una', async () => {
    const orden = preparar();
    await disponibilidadService.consultar({ fecha: '2026-10-21' });

    assert.equal(orden[0], 'barrerNoShow');
    assert.deepEqual(orden.slice(1).sort(), ['listarActivas', 'listarDelDia', 'ocupadosEnRango']);
    assert.equal(reservasService.barrerNoShow.mock.calls[0].arguments[0], POOL);
  });

  it('pasa el pool, el tipo, el día de la semana y el día completo como rango semiabierto', async () => {
    preparar();
    await disponibilidadService.consultar({ fecha: '2026-10-21', tipo: 'SALA' });

    assert.deepEqual(canchasService.listarActivas.mock.calls[0].arguments, [POOL, 'SALA']);
    // 2026-10-21 es miércoles.
    assert.deepEqual(horariosService.listarDelDia.mock.calls[0].arguments, [POOL, 3]);
    const [ejecutor, desde, hasta] = reservasService.ocupadosEnRango.mock.calls[0].arguments;
    assert.equal(ejecutor, POOL);
    assert.equal(desde.getTime(), fecha('2026-10-21T00:00:00').getTime());
    assert.equal(hasta.getTime(), fecha('2026-10-22T00:00:00').getTime());
  });

  for (const tipo of [undefined, '']) {
    it(`tipo ${JSON.stringify(tipo)} → listarActivas sin filtro`, async () => {
      preparar();
      await disponibilidadService.consultar({ fecha: '2026-10-21', tipo });
      assert.equal(canchasService.listarActivas.mock.calls[0].arguments[1], null);
    });
  }

  it('un tipo sin canchas devuelve []', async () => {
    preparar({ canchas: [] });
    assert.deepEqual(await disponibilidadService.consultar({ fecha: '2026-10-21', tipo: 'NADA' }), []);
  });
});

describe('disponibilidad: bloques', () => {
  it('genera los bloques de apertura a cierre − 1 con el formato de la API', async () => {
    preparar();
    const resultado = await disponibilidadService.consultar({ fecha: '2026-10-21' });

    assert.deepEqual(resultado[0], {
      canchaId: 1,
      nombre: 'Sala 1',
      tipoCodigo: 'SALA',
      precioHora: 600,
      bloques: ['2026-10-21T07:00:00', '2026-10-21T08:00:00', '2026-10-21T09:00:00'],
    });
  });

  it('una cancha sin horario ese día no aparece, y un horario de una cancha no activa se ignora', async () => {
    preparar();
    const resultado = await disponibilidadService.consultar({ fecha: '2026-10-21' });

    assert.deepEqual(
      resultado.map((c) => c.canchaId),
      [1, 2],
    );
  });

  it('quita el bloque ocupado solo en su cancha', async () => {
    preparar({ ocupadas: [{ canchaId: 1, inicio: fecha('2026-10-21T08:00:00') }] });
    const resultado = await disponibilidadService.consultar({ fecha: '2026-10-21' });

    assert.deepEqual(bloquesDe(resultado, 1), ['2026-10-21T07:00:00', '2026-10-21T09:00:00']);
    assert.deepEqual(bloquesDe(resultado, 2), ['2026-10-21T07:00:00', '2026-10-21T08:00:00']);
  });

  it('una cancha con horario y todo ocupado aparece con bloques vacíos', async () => {
    preparar({
      ocupadas: [
        { canchaId: 2, inicio: fecha('2026-10-21T07:00:00') },
        { canchaId: 2, inicio: fecha('2026-10-21T08:00:00') },
      ],
    });
    const resultado = await disponibilidadService.consultar({ fecha: '2026-10-21' });

    assert.deepEqual(bloquesDe(resultado, 2), []);
  });

  it('hoy: quita los bloques que ya empezaron (13:00 está en curso a las 13:20)', async () => {
    preparar({ horarios: [{ canchaId: 1, apertura: 12, cierre: 16 }] });
    const resultado = await disponibilidadService.consultar({ fecha: '2026-10-20' });

    assert.deepEqual(bloquesDe(resultado, 1), ['2026-10-20T14:00:00', '2026-10-20T15:00:00']);
  });

  it('hoy, a la hora en punto: el bloque que empieza ahora ya no se ofrece, igual que al crear', async () => {
    mock.method(Date, 'now', () => Date.UTC(2026, 9, 20, 19, 0, 0));
    preparar({ horarios: [{ canchaId: 1, apertura: 12, cierre: 15 }] });
    const resultado = await disponibilidadService.consultar({ fecha: '2026-10-20' });

    assert.deepEqual(bloquesDe(resultado, 1), ['2026-10-20T14:00:00']);
  });

  it('hoy + 30: solo los bloques con inicio ≤ ahora + 30 días (13:00 sí, 14:00 no)', async () => {
    preparar({ horarios: [{ canchaId: 1, apertura: 12, cierre: 16 }] });
    const resultado = await disponibilidadService.consultar({ fecha: '2026-11-19' });

    assert.deepEqual(bloquesDe(resultado, 1), ['2026-11-19T12:00:00', '2026-11-19T13:00:00']);
  });

  it('hoy + 30 a la hora en punto: el bloque a exactamente 30 días se ofrece, igual que al crear', async () => {
    mock.method(Date, 'now', () => Date.UTC(2026, 9, 20, 19, 0, 0));
    preparar({ horarios: [{ canchaId: 1, apertura: 12, cierre: 16 }] });
    const resultado = await disponibilidadService.consultar({ fecha: '2026-11-19' });

    assert.deepEqual(bloquesDe(resultado, 1), ['2026-11-19T12:00:00', '2026-11-19T13:00:00']);
  });

  it('respeta el orden de listarActivas', async () => {
    preparar({ canchas: [CANCHAS[1], CANCHAS[0]] });
    const resultado = await disponibilidadService.consultar({ fecha: '2026-10-21' });

    assert.deepEqual(
      resultado.map((c) => c.canchaId),
      [2, 1],
    );
  });
});
