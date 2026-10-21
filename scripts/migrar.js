// Aplica en orden alfabético las migraciones de db/migrations que no figuran en _Migraciones.
const fs = require('node:fs');
const path = require('node:path');
const { sql, obtenerPool, enTransaccion, cerrarPool } = require('../src/config/db');
const { ahoraNicaragua } = require('../src/shared/tiempo');

const CARPETA = path.join(__dirname, '..', 'db', 'migrations');
const PATRON_ARCHIVO = /^\d{3}_.+\.sql$/;
// mssql no entiende GO (es del cliente sqlcmd/SSMS): cada línea GO separa un lote.
const SEPARADOR_GO = /^\s*GO\s*(?:--.*)?$/gim;

function partirEnLotes(texto) {
  return texto
    .replace(/^﻿/, '')
    .split(SEPARADOR_GO)
    .map((lote) => lote.trim())
    .filter((lote) => lote.length > 0);
}

async function crearTablaMigraciones(pool) {
  await pool.request().batch(`
    IF OBJECT_ID('dbo._Migraciones', 'U') IS NULL
      CREATE TABLE _Migraciones (
        Nombre     VARCHAR(100) NOT NULL CONSTRAINT PK_Migraciones PRIMARY KEY,
        AplicadaEn DATETIME2(0) NOT NULL
      );
  `);
}

async function aplicar(nombre) {
  const lotes = partirEnLotes(fs.readFileSync(path.join(CARPETA, nombre), 'utf8'));
  // El archivo y su registro van juntos: si un lote falla, no queda nada a medias.
  await enTransaccion(async (tx) => {
    for (const lote of lotes) {
      await new sql.Request(tx).batch(lote);
    }
    await new sql.Request(tx)
      .input('nombre', sql.VarChar(100), nombre)
      .input('aplicadaEn', sql.DateTime2(0), ahoraNicaragua())
      .query('INSERT INTO _Migraciones (Nombre, AplicadaEn) VALUES (@nombre, @aplicadaEn)');
  });
}

async function main() {
  const pool = await obtenerPool();
  await crearTablaMigraciones(pool);

  const resultado = await pool.request().query('SELECT Nombre FROM _Migraciones');
  const aplicadas = new Set(resultado.recordset.map((fila) => fila.Nombre));

  const pendientes = fs
    .readdirSync(CARPETA)
    .filter((archivo) => PATRON_ARCHIVO.test(archivo))
    .sort()
    .filter((archivo) => !aplicadas.has(archivo));

  if (pendientes.length === 0) {
    console.log('Sin migraciones pendientes.');
    return;
  }

  for (const nombre of pendientes) {
    try {
      await aplicar(nombre);
    } catch (err) {
      err.archivo = nombre;
      throw err;
    }
    console.log(`Aplicada: ${nombre}`);
  }
}

main()
  .catch((err) => {
    const donde = err.archivo ? ` en ${err.archivo}` : '';
    console.error(`Error al migrar${donde}: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
