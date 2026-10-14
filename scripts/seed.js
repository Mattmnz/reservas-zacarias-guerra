// Datos iniciales. Idempotente: cada fila se inserta solo si su clave natural no existe.
const bcrypt = require('bcryptjs');
const { exigir } = require('../src/config/env');
const { sql, enTransaccion, cerrarPool } = require('../src/config/db');
const { ahoraNicaragua } = require('../src/shared/tiempo');
const { ROLES } = require('../src/shared/constantes');

const seedEnv = exigir(['SEED_ADMIN_CORREO', 'SEED_ADMIN_PASSWORD']);

const TIPOS = [
  { codigo: 'SALA', nombre: 'Fútbol sala', precioHora: 600 },
  { codigo: 'CAMPO', nombre: 'Fútbol campo', precioHora: 1200 },
];

const CANCHAS = [
  { nombre: 'Sala 1', tipo: 'SALA' },
  { nombre: 'Sala 2', tipo: 'SALA' },
  { nombre: 'Sala 3', tipo: 'SALA' },
  { nombre: 'Sala 4', tipo: 'SALA' },
  { nombre: 'Sala 5', tipo: 'SALA' },
  { nombre: 'Campo 1', tipo: 'CAMPO' },
  { nombre: 'Campo 2', tipo: 'CAMPO' },
];

const HORARIO = { apertura: '07:00:00', cierre: '22:00:00' };

// Credenciales de prueba documentadas en db/README.md; todo el sistema es simulado.
const PASSWORD_CLIENTES_PRUEBA = 'Cliente123!';

const USUARIOS = [
  {
    nombre: 'Administrador',
    correo: seedEnv.SEED_ADMIN_CORREO,
    telefono: null,
    password: seedEnv.SEED_ADMIN_PASSWORD,
    rol: ROLES.ADMIN,
  },
  {
    nombre: 'Cliente Prueba Uno',
    correo: 'cliente1@prueba.local',
    telefono: '8888-0001',
    password: PASSWORD_CLIENTES_PRUEBA,
    rol: ROLES.CLIENTE,
  },
  {
    nombre: 'Cliente Prueba Dos',
    correo: 'cliente2@prueba.local',
    telefono: '8888-0002',
    password: PASSWORD_CLIENTES_PRUEBA,
    rol: ROLES.CLIENTE,
  },
];

const TABLAS = ['TipoCancha', 'Cancha', 'Horario', 'Usuario', 'Reserva', 'Pago', 'Auditoria', 'Notificacion'];

async function sembrarTipos(tx) {
  let creados = 0;
  for (const tipo of TIPOS) {
    const r = await new sql.Request(tx)
      .input('codigo', sql.VarChar(10), tipo.codigo)
      .input('nombre', sql.NVarChar(50), tipo.nombre)
      .input('precioHora', sql.Decimal(10, 2), tipo.precioHora)
      .query(`
        INSERT INTO TipoCancha (Codigo, Nombre, PrecioHora)
        SELECT @codigo, @nombre, @precioHora
        WHERE NOT EXISTS (SELECT 1 FROM TipoCancha WHERE Codigo = @codigo)
      `);
    creados += r.rowsAffected[0];
  }
  return creados;
}

async function sembrarCanchas(tx, ahora) {
  let creados = 0;
  for (const cancha of CANCHAS) {
    const r = await new sql.Request(tx)
      .input('nombre', sql.NVarChar(50), cancha.nombre)
      .input('codigoTipo', sql.VarChar(10), cancha.tipo)
      .input('creadaEn', sql.DateTime2(0), ahora)
      .query(`
        INSERT INTO Cancha (Nombre, TipoCanchaId, Activa, CreadaEn)
        SELECT @nombre, t.Id, 1, @creadaEn
        FROM TipoCancha t
        WHERE t.Codigo = @codigoTipo
          AND NOT EXISTS (SELECT 1 FROM Cancha WHERE Nombre = @nombre)
      `);
    creados += r.rowsAffected[0];
  }
  return creados;
}

async function sembrarHorarios(tx) {
  let creados = 0;
  for (const cancha of CANCHAS) {
    for (let dia = 1; dia <= 7; dia++) {
      const r = await new sql.Request(tx)
        .input('nombreCancha', sql.NVarChar(50), cancha.nombre)
        .input('dia', sql.TinyInt, dia)
        .input('apertura', sql.VarChar(8), HORARIO.apertura)
        .input('cierre', sql.VarChar(8), HORARIO.cierre)
        .query(`
          INSERT INTO Horario (CanchaId, DiaSemana, HoraApertura, HoraCierre)
          SELECT c.Id, @dia, CAST(@apertura AS TIME(0)), CAST(@cierre AS TIME(0))
          FROM Cancha c
          WHERE c.Nombre = @nombreCancha
            AND NOT EXISTS (SELECT 1 FROM Horario h WHERE h.CanchaId = c.Id AND h.DiaSemana = @dia)
        `);
      creados += r.rowsAffected[0];
    }
  }
  return creados;
}

async function sembrarUsuarios(tx, ahora) {
  let creados = 0;
  for (const usuario of USUARIOS) {
    const correo = usuario.correo.toLowerCase();
    const existe = await new sql.Request(tx)
      .input('correo', sql.NVarChar(254), correo)
      .query('SELECT 1 AS Existe FROM Usuario WHERE Correo = @correo');
    // Se consulta antes para no calcular el hash (lento a propósito) en cada ejecución.
    if (existe.recordset.length > 0) continue;

    const hash = await bcrypt.hash(usuario.password, 10);
    await new sql.Request(tx)
      .input('nombre', sql.NVarChar(100), usuario.nombre)
      .input('correo', sql.NVarChar(254), correo)
      .input('telefono', sql.NVarChar(20), usuario.telefono)
      .input('hash', sql.VarChar(100), hash)
      .input('rol', sql.VarChar(10), usuario.rol)
      .input('creadoEn', sql.DateTime2(0), ahora)
      .query(`
        INSERT INTO Usuario (Nombre, Correo, Telefono, PasswordHash, Rol, Activo, CreadoEn)
        VALUES (@nombre, @correo, @telefono, @hash, @rol, 1, @creadoEn)
      `);
    creados += 1;
  }
  return creados;
}

async function contarFilas(tx) {
  // Los nombres de tabla salen de la constante TABLAS, no de una entrada externa.
  const consulta = TABLAS.map((t) => `SELECT '${t}' AS Tabla, COUNT(*) AS Filas FROM ${t}`).join(' UNION ALL ');
  const r = await new sql.Request(tx).query(consulta);
  return r.recordset;
}

async function main() {
  const ahora = ahoraNicaragua();
  const { creados, conteos } = await enTransaccion(async (tx) => {
    const creados = {
      TipoCancha: await sembrarTipos(tx),
      Cancha: await sembrarCanchas(tx, ahora),
      Horario: await sembrarHorarios(tx),
      Usuario: await sembrarUsuarios(tx, ahora),
    };
    return { creados, conteos: await contarFilas(tx) };
  });

  console.log('Filas creadas en esta ejecución:');
  for (const [tabla, n] of Object.entries(creados)) console.log(`  ${tabla.padEnd(13)} ${n}`);
  console.log('Filas totales por tabla:');
  for (const { Tabla, Filas } of conteos) console.log(`  ${Tabla.padEnd(13)} ${Filas}`);
}

main()
  .catch((err) => {
    console.error(`Error en el seed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
