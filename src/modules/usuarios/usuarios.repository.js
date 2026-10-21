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

module.exports = { obtenerPorId, obtenerPorCorreo, crear };
