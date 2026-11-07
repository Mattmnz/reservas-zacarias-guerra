import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { consultaAuditoria, textoAccion, textoAutor, textoCambio, textoEntidad } from './auditoria.js';

describe('consultaAuditoria', () => {
  it('omite los filtros vacíos', () => {
    assert.equal(consultaAuditoria({ entidad: '', entidadId: null }), '');
    assert.equal(consultaAuditoria({ entidad: 'CANCHA', entidadId: null }), 'entidad=CANCHA');
    assert.equal(consultaAuditoria({ entidad: '', entidadId: 5 }), 'entidadId=5');
  });

  it('combina los dos filtros', () => {
    assert.equal(consultaAuditoria({ entidad: 'RESERVA', entidadId: 12 }), 'entidad=RESERVA&entidadId=12');
  });
});

describe('textoAccion', () => {
  it('traduce una acción conocida', () => {
    assert.equal(textoAccion('CAMBIAR_HORARIO'), 'Cambio de horario');
  });

  it('muestra cruda una acción desconocida', () => {
    assert.equal(textoAccion('OTRA_ACCION'), 'OTRA_ACCION');
  });
});

describe('textoCambio', () => {
  it('muestra los dos estados', () => {
    assert.equal(textoCambio({ estadoAnterior: 'PAGADA', estadoNuevo: 'CONFIRMADA' }), 'PAGADA → CONFIRMADA');
  });

  it('marca el estado que falta', () => {
    assert.equal(textoCambio({ estadoAnterior: null, estadoNuevo: 'ACTIVA' }), '— → ACTIVA');
  });

  it('sin estados no hay cambio que mostrar', () => {
    assert.equal(textoCambio({ estadoAnterior: null, estadoNuevo: null }), null);
  });
});

describe('textoEntidad', () => {
  const usuarios = new Map([[3, { nombre: 'Ana', rol: 'CLIENTE' }]]);
  const canchas = new Map([[2, { nombre: 'Sala 2' }]]);
  const usuario = { entidad: 'USUARIO', entidadId: 3 };
  const cancha = { entidad: 'CANCHA', entidadId: 2 };

  it('con nombre muestra el nombre y la entidad', () => {
    assert.equal(textoEntidad(usuario, usuarios, canchas), 'Ana (cliente) · Usuario #3');
    assert.equal(textoEntidad(cancha, usuarios, canchas), 'Sala 2 · Cancha #2');
  });

  it('con un id que no está en el mapa queda el número', () => {
    assert.equal(textoEntidad({ entidad: 'USUARIO', entidadId: 9 }, usuarios, canchas), 'Usuario #9');
    assert.equal(textoEntidad({ entidad: 'CANCHA', entidadId: 9 }, usuarios, canchas), 'Cancha #9');
  });

  it('sin mapa queda el número', () => {
    assert.equal(textoEntidad(usuario), 'Usuario #3');
    assert.equal(textoEntidad(cancha), 'Cancha #2');
  });

  it('no cruza los mapas: el id de una cancha no se busca en usuarios', () => {
    assert.equal(textoEntidad({ entidad: 'CANCHA', entidadId: 3 }, usuarios, canchas), 'Cancha #3');
  });

  it('una reserva queda con su número', () => {
    assert.equal(textoEntidad({ entidad: 'RESERVA', entidadId: 3 }, usuarios, canchas), 'Reserva #3');
  });
});

describe('textoAutor', () => {
  const usuarios = new Map([
    [3, { nombre: 'Ana', rol: 'CLIENTE' }],
    [1, { nombre: 'Luis', rol: 'ADMIN' }],
  ]);

  it('muestra el nombre y el rol del usuario', () => {
    assert.equal(textoAutor(3, usuarios), 'Ana (cliente)');
    assert.equal(textoAutor(1, usuarios), 'Luis (administrador)');
  });

  it('con un id que no está en el mapa queda el número', () => {
    assert.equal(textoAutor(9, usuarios), 'Usuario #9');
  });

  it('sin mapa queda el número', () => {
    assert.equal(textoAutor(3), 'Usuario #3');
  });

  it('sin usuario es el sistema', () => {
    assert.equal(textoAutor(null, usuarios), 'Sistema');
    assert.equal(textoAutor(null), 'Sistema');
  });
});
