import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cambiosDe, consultaUsuarios } from './usuarios.js';

describe('consultaUsuarios', () => {
  it('omite los filtros vacíos', () => {
    assert.equal(consultaUsuarios({ rol: '', activo: '' }), '');
    assert.equal(consultaUsuarios({ rol: 'ADMIN', activo: '' }), 'rol=ADMIN');
  });

  it('conserva activo=false', () => {
    assert.equal(consultaUsuarios({ rol: '', activo: 'false' }), 'activo=false');
  });

  it('combina los dos filtros', () => {
    assert.equal(consultaUsuarios({ rol: 'CLIENTE', activo: 'true' }), 'rol=CLIENTE&activo=true');
  });
});

describe('cambiosDe', () => {
  const base = { nombre: 'Ana' };

  it('un cliente activo puede pasar a administrador o desactivarse', () => {
    const [rol, estado] = cambiosDe({ ...base, rol: 'CLIENTE', activo: true });

    assert.deepEqual(rol.cuerpo, { rol: 'ADMIN' });
    assert.equal(rol.boton, 'Hacer administrador');
    assert.equal(rol.peligro, false);
    assert.equal(rol.exito, 'Se cambió el rol de Ana a Administrador.');
    assert.deepEqual(estado.cuerpo, { activo: false });
    assert.equal(estado.boton, 'Desactivar');
    assert.equal(estado.peligro, true);
  });

  it('quitar el rol de administrador se marca como peligroso', () => {
    const [rol] = cambiosDe({ ...base, rol: 'ADMIN', activo: true });

    assert.deepEqual(rol.cuerpo, { rol: 'CLIENTE' });
    assert.equal(rol.boton, 'Hacer cliente');
    assert.equal(rol.peligro, true);
  });

  it('un usuario inactivo se puede activar, con activo booleano', () => {
    const [, estado] = cambiosDe({ ...base, rol: 'CLIENTE', activo: false });

    assert.deepEqual(estado.cuerpo, { activo: true });
    assert.equal(estado.boton, 'Activar');
    assert.equal(estado.peligro, false);
    assert.equal(estado.exito, 'Se activó a Ana.');
  });
});
