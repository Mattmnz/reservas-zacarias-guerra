const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const AppError = require('../shared/AppError');
const requerirRol = require('./requerirRol');

// Ejecuta el middleware y devuelve lo que recibió next (undefined si dejó pasar).
function ejecutar(middleware, usuario) {
  let recibido = 'next no llamado';
  middleware({ usuario }, {}, (err) => {
    recibido = err;
  });
  return recibido;
}

describe('requerirRol', () => {
  it('deja pasar un rol permitido', () => {
    assert.equal(ejecutar(requerirRol('ADMIN'), { id: 1, rol: 'ADMIN' }), undefined);
  });

  it('acepta varios roles', () => {
    const middleware = requerirRol('CLIENTE', 'ADMIN');
    assert.equal(ejecutar(middleware, { id: 1, rol: 'CLIENTE' }), undefined);
    assert.equal(ejecutar(middleware, { id: 2, rol: 'ADMIN' }), undefined);
  });

  it('rechaza un rol no incluido con 403 SIN_PERMISO', () => {
    const err = ejecutar(requerirRol('ADMIN'), { id: 1, rol: 'CLIENTE' });
    assert.ok(err instanceof AppError);
    assert.equal(err.status, 403);
    assert.equal(err.codigo, 'SIN_PERMISO');
  });

  it('compara el rol de forma exacta', () => {
    const err = ejecutar(requerirRol('ADMIN'), { id: 1, rol: 'admin' });
    assert.equal(err.status, 403);
  });

  it('sin usuario autenticado responde 401 NO_AUTENTICADO', () => {
    const err = ejecutar(requerirRol('ADMIN'), undefined);
    assert.ok(err instanceof AppError);
    assert.equal(err.status, 401);
    assert.equal(err.codigo, 'NO_AUTENTICADO');
  });
});
