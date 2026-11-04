const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');

const db = require('./config/db');
const app = require('./app');

describe('app', () => {
  let servidor;
  let base;
  let obtenerPool;

  before(async () => {
    obtenerPool = mock.method(db, 'obtenerPool', () => {
      throw new Error('La prueba no debe conectarse a la base');
    });
    await new Promise((resolve) => {
      servidor = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${servidor.address().port}`;
  });

  after(async () => {
    mock.restoreAll();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
  });

  it('GET / responde 200 con HTML sin tocar la base', async () => {
    const respuesta = await fetch(`${base}/`);

    assert.equal(respuesta.status, 200);
    assert.match(respuesta.headers.get('content-type'), /^text\/html/);
    assert.match(await respuesta.text(), /href="\/login\.html"/);
    assert.equal(obtenerPool.mock.callCount(), 0);
  });

  it('GET /api/no-existe sigue dando el 404 en JSON', async () => {
    const respuesta = await fetch(`${base}/api/no-existe`);

    assert.equal(respuesta.status, 404);
    assert.match(respuesta.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await respuesta.json(), {
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' },
    });
  });
});
