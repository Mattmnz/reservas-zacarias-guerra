const { sql } = require('../../config/db');

const COLUMNAS = 'Id, Nombre, Correo, Telefono, PasswordHash, Rol, Activo';

function mapear(fila) {
  if (!fila) return null;
  return {
    id: fila.Id,
    nombre: fila.Nombre,
    correo: fila.Correo,
    telefono: fila.Telefono,
    passwordHash: fila.PasswordHash,
    rol: fila.Rol,
    activo: fila.Activo,
  };
}

const COLUMNAS_SIN_HASH = 'Id, Nombre, Correo, Telefono, Rol, Activo, CreadoEn';

function mapearSinHash(fila) {
  if (!fila) return null;
  return {
    id: fila.Id,
    nombre: fila.Nombre,
    correo: fila.Correo,
    telefono: fila.Telefono,
    rol: fila.Rol,
    activo: fila.Activo,
    creadoEn: fila.CreadoEn,
  };
}

async function obtenerPorId(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`SELECT ${COLUMNAS} FROM Usuario WHERE Id = @id`);
  return mapear(resultado.recordset[0]);
}

async function obtenerPorCorreo(ejecutor, correo) {
  const resultado = await ejecutor
    .request()
    .input('correo', sql.NVarChar(254), correo)
    .query(`SELECT ${COLUMNAS} FROM Usuario WHERE Correo = @correo`);
  return mapear(resultado.recordset[0]);
}

async function crear(ejecutor, { nombre, correo, telefono, passwordHash, rol, creadoEn }) {
  const resultado = await ejecutor
    .request()
    .input('nombre', sql.NVarChar(100), nombre)
    .input('correo', sql.NVarChar(254), correo)
    .input('telefono', sql.NVarChar(20), telefono)
    .input('hash', sql.VarChar(100), passwordHash)
    .input('rol', sql.VarChar(10), rol)
    .input('creadoEn', sql.DateTime2(0), creadoEn)
    .query(`
      INSERT INTO Usuario (Nombre, Correo, Telefono, PasswordHash, Rol, Activo, CreadoEn)
      OUTPUT INSERTED.Id
      VALUES (@nombre, @correo, @telefono, @hash, @rol, 1, @creadoEn)
    `);
  return resultado.recordset[0].Id;
}

async function listar(ejecutor, { rol, activo }) {
  const resultado = await ejecutor
    .request()
    .input('rol', sql.VarChar(10), rol)
    .input('activo', sql.Bit, activo)
    .query(`
      SELECT ${COLUMNAS_SIN_HASH}
      FROM Usuario
      WHERE (@rol IS NULL OR Rol = @rol)
        AND (@activo IS NULL OR Activo = @activo)
      ORDER BY Nombre, Id
    `);
  return resultado.recordset.map(mapearSinHash);
}

async function obtenerPorIdParaActualizar(ejecutor, id) {
  const resultado = await ejecutor
    .request()
    .input('id', sql.Int, id)
    .query(`SELECT ${COLUMNAS_SIN_HASH} FROM Usuario WITH (UPDLOCK) WHERE Id = @id`);
  return mapearSinHash(resultado.recordset[0]);
}

async function actualizarRol(ejecutor, id, rol) {
  await ejecutor
    .request()
    .input('id', sql.Int, id)
    .input('rol', sql.VarChar(10), rol)
    .query('UPDATE Usuario SET Rol = @rol WHERE Id = @id');
}

async function actualizarActivo(ejecutor, id, activo) {
  await ejecutor
    .request()
    .input('id', sql.Int, id)
    .input('activo', sql.Bit, activo)
    .query('UPDATE Usuario SET Activo = @activo WHERE Id = @id');
}

module.exports = {
  obtenerPorId,
  obtenerPorCorreo,
  crear,
  listar,
  obtenerPorIdParaActualizar,
  actualizarRol,
  actualizarActivo,
};