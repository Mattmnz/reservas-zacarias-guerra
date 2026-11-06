import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  cerrarSesion,
  consumirRetorno,
  exigirRol,
  guardarSesion,
  MENUS,
  mostrarNoLeidas,
  obtenerToken,
  obtenerUsuario,
  rutaInicio,
} from './sesion.js';

function simularGlobal(nombre, valor) {
  Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });
}

function crearAlmacen() {
  const datos = new Map();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
  };
}

function crearElemento() {
  return {
    hidden: false,
    dataset: {},
    hijos: [],
    append(...nodos) {
      this.hijos.push(...nodos);
    },
    replaceChildren(...nodos) {
      this.hijos = nodos;
    },
    setAttribute(nombre, valor) {
      this[nombre] = valor;
    },
    addEventListener() {},
  };
}

function simularDocumento({ conIndicador = true } = {}) {
  const elementos = new Map();
  if (conIndicador) {
    elementos.set('[data-no-leidas]', { ...crearElemento(), hidden: true, parentElement: crearElemento() });
  } else {
    elementos.set('[data-no-leidas]', null);
  }
  simularGlobal('document', {
    createElement: crearElemento,
    querySelector(selector) {
      if (!elementos.has(selector)) elementos.set(selector, crearElemento());
      return elementos.get(selector);
    },
  });
  document.querySelector('[data-contenido]').hidden = true;
}

function simularPerfil(perfil) {
  simularGlobal('fetch', async () => new Response(JSON.stringify({ data: perfil }), { status: 200 }));
}

function simularApi(perfil, notificaciones) {
  simularGlobal(
    'fetch',
    mock.fn(async (url) => {
      if (url !== '/api/notificaciones') return new Response(JSON.stringify({ data: perfil }), { status: 200 });
      if (notificaciones === null) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ data: notificaciones }), { status: 200 });
    }),
  );
}

const USUARIO = { id: 7, nombre: 'Ana', rol: 'CLIENTE' };
const pasarTurno = () => new Promise((resolve) => setImmediate(resolve));
const llamadasNotificaciones = () =>
  fetch.mock.calls.filter((llamada) => llamada.arguments[0] === '/api/notificaciones').length;

function textosDe(nodo) {
  return nodo.hijos.flatMap((hijo) => [hijo.textContent, ...textosDe(hijo)]);
}

describe('sesion', () => {
  beforeEach(() => {
    simularGlobal('sessionStorage', crearAlmacen());
    simularGlobal('location', {
      origin: 'http://localhost:3000',
      pathname: '/admin/panel.html',
      search: '',
      replace: mock.fn(),
    });
    simularGlobal('addEventListener', mock.fn());
    simularDocumento();
  });

  it('rutaInicio lleva a cada rol a su menú y a lo demás al login', () => {
    assert.equal(rutaInicio('CLIENTE'), '/cliente/catalogo.html');
    assert.equal(rutaInicio('ADMIN'), '/admin/panel.html');
    assert.equal(rutaInicio('OTRO'), '/login.html');
  });

  it('un usuario guardado corrupto cuenta como sin sesión', () => {
    sessionStorage.setItem('zg.usuario', '{no es json');

    assert.equal(obtenerUsuario(), null);
  });

  it('guarda solo id, nombre y rol del usuario', () => {
    guardarSesion('abc', { ...USUARIO, correo: 'ana@zg.com' });

    assert.equal(obtenerToken(), 'abc');
    assert.deepEqual(obtenerUsuario(), USUARIO);
  });

  it('consumirRetorno devuelve el dato una sola vez', () => {
    sessionStorage.setItem('zg.retorno', '/cliente/historial.html');

    assert.equal(consumirRetorno(), 'http://localhost:3000/cliente/historial.html');
    assert.equal(consumirRetorno(), null);
  });

  it('consumirRetorno descarta un retorno que sale del sitio', () => {
    // Express sirve el catálogo en esta ruta, y el navegador la guarda tal cual en location.pathname.
    sessionStorage.setItem('zg.retorno', '//evil.example/x%2F..%2F..%2Fcliente/catalogo.html');

    assert.equal(consumirRetorno(), null);
    assert.equal(sessionStorage.getItem('zg.retorno'), null);
  });

  it('consumirRetorno conserva la query del retorno', () => {
    sessionStorage.setItem('zg.retorno', '/cliente/reserva.html?cancha=3');

    assert.equal(consumirRetorno(), 'http://localhost:3000/cliente/reserva.html?cancha=3');
  });

  it('consumirRetorno sigue en el sitio con una ruta /.//host', () => {
    sessionStorage.setItem('zg.retorno', '/.//evil.example');

    assert.equal(new URL(consumirRetorno(), location.origin).origin, 'http://localhost:3000');
  });

  it('consumirRetorno descarta un retorno que no es una URL válida', () => {
    sessionStorage.setItem('zg.retorno', '//');

    assert.equal(consumirRetorno(), null);
  });

  it('cerrarSesion borra todo y va al login', () => {
    guardarSesion('abc', USUARIO);
    sessionStorage.setItem('zg.retorno', '/cliente/historial.html');

    cerrarSesion();

    assert.equal(obtenerToken(), null);
    assert.equal(obtenerUsuario(), null);
    assert.equal(consumirRetorno(), null);
    assert.deepEqual(location.replace.mock.calls[0].arguments, ['/login.html']);
  });

  describe('exigirRol', () => {
    it('sin token guarda el retorno y va al login, sin llamar a la API', async () => {
      simularGlobal('fetch', mock.fn());

      exigirRol('ADMIN');
      await pasarTurno();

      assert.equal(fetch.mock.callCount(), 0);
      assert.equal(sessionStorage.getItem('zg.retorno'), '/admin/panel.html');
      assert.deepEqual(location.replace.mock.calls[0].arguments, ['/login.html']);
    });

    it('con otro rol va al inicio del rol real y no muestra la página', async () => {
      guardarSesion('abc', USUARIO);
      simularPerfil(USUARIO);

      exigirRol('ADMIN');
      await pasarTurno();

      assert.deepEqual(location.replace.mock.calls[0].arguments, ['/cliente/catalogo.html']);
      assert.equal(document.querySelector('[data-contenido]').hidden, true);
    });

    it('usa el rol del servidor aunque el guardado diga otro', async () => {
      guardarSesion('abc', { ...USUARIO, rol: 'ADMIN' });
      simularPerfil(USUARIO);

      exigirRol('ADMIN');
      await pasarTurno();

      assert.equal(obtenerUsuario().rol, 'CLIENTE');
      assert.deepEqual(location.replace.mock.calls[0].arguments, ['/cliente/catalogo.html']);
    });

    it('con el rol correcto arma solo el menú de ese rol y muestra la página', async () => {
      guardarSesion('abc', USUARIO);
      simularPerfil({ ...USUARIO, correo: 'ana@zg.com', telefono: null });

      const usuario = await exigirRol('CLIENTE');

      assert.deepEqual(usuario, USUARIO);
      assert.equal(location.replace.mock.callCount(), 0);
      assert.equal(document.querySelector('[data-contenido]').hidden, false);
      assert.equal(document.querySelector('[data-carga]').hidden, true);

      const textos = textosDe(document.querySelector('[data-menu]'));
      for (const { texto } of MENUS.CLIENTE) assert.ok(textos.includes(texto));
      assert.ok(textos.includes('Cerrar sesión'));
      assert.ok(!textos.includes('Auditoría'));
    });

    it('un fallo que no es 401 se muestra en la página, sin redirigir', async () => {
      guardarSesion('abc', USUARIO);
      simularGlobal('fetch', async () => {
        throw new TypeError('fetch failed');
      });

      exigirRol('CLIENTE');
      await pasarTurno();

      const aviso = document.querySelector('[data-error]');
      assert.match(aviso.textContent, /No se pudo completar/);
      assert.equal(aviso.hidden, false);
      assert.equal(location.replace.mock.callCount(), 0);
      assert.equal(document.querySelector('[data-contenido]').hidden, true);
    });

    it('al volver del bfcache sin sesión va al login', async () => {
      guardarSesion('abc', USUARIO);
      simularPerfil(USUARIO);
      await exigirRol('CLIENTE');
      const [evento, alMostrar] = addEventListener.mock.calls[0].arguments;
      assert.equal(evento, 'pageshow');

      sessionStorage.removeItem('zg.token');
      alMostrar({ persisted: true });

      assert.deepEqual(location.replace.mock.calls[0].arguments, ['/login.html']);
    });

    it('cuenta solo las notificaciones no leídas en el indicador', async () => {
      guardarSesion('abc', USUARIO);
      simularApi(USUARIO, [{ leida: false }, { leida: true }, { leida: false }]);

      await exigirRol('CLIENTE');
      await pasarTurno();

      const indicador = document.querySelector('[data-no-leidas]');
      assert.equal(indicador.textContent, '2');
      assert.equal(indicador.hidden, false);
    });

    it('un fallo de las notificaciones no impide mostrar la página', async () => {
      guardarSesion('abc', USUARIO);
      simularApi(USUARIO, null);

      await exigirRol('CLIENTE');
      await pasarTurno();

      assert.equal(llamadasNotificaciones(), 1);
      assert.equal(document.querySelector('[data-contenido]').hidden, false);
      assert.equal(document.querySelector('[data-no-leidas]').hidden, true);
      assert.equal(document.querySelector('[data-error]').textContent, undefined);
    });

    it('sin indicador en el menú no pide las notificaciones', async () => {
      simularDocumento({ conIndicador: false });
      const admin = { ...USUARIO, rol: 'ADMIN' };
      guardarSesion('abc', admin);
      simularApi(admin, []);

      await exigirRol('ADMIN');
      await pasarTurno();

      assert.equal(llamadasNotificaciones(), 0);
    });

    it('al volver del bfcache con sesión refresca el indicador', async () => {
      guardarSesion('abc', USUARIO);
      simularApi(USUARIO, [{ leida: false }, { leida: false }]);
      await exigirRol('CLIENTE');
      await pasarTurno();
      const [, alMostrar] = addEventListener.mock.calls[0].arguments;

      simularApi(USUARIO, [{ leida: true }, { leida: false }]);
      alMostrar({ persisted: true });
      await pasarTurno();

      assert.equal(document.querySelector('[data-no-leidas]').textContent, '1');
      assert.equal(location.replace.mock.callCount(), 0);
    });
  });

  describe('mostrarNoLeidas', () => {
    it('con 0 oculta el indicador y deja el nombre simple en el enlace', () => {
      mostrarNoLeidas(3);
      mostrarNoLeidas(0);

      const indicador = document.querySelector('[data-no-leidas]');
      assert.equal(indicador.hidden, true);
      assert.equal(indicador.parentElement['aria-label'], 'Notificaciones');
    });

    it('con 9 muestra la cifra exacta', () => {
      mostrarNoLeidas(9);

      const indicador = document.querySelector('[data-no-leidas]');
      assert.equal(indicador.textContent, '9');
      assert.equal(indicador.parentElement['aria-label'], 'Notificaciones, 9 sin leer');
    });

    it('con más de 9 muestra 9+ y anuncia la cifra real', () => {
      mostrarNoLeidas(12);

      const indicador = document.querySelector('[data-no-leidas]');
      assert.equal(indicador.textContent, '9+');
      assert.equal(indicador.hidden, false);
      assert.equal(indicador.parentElement['aria-label'], 'Notificaciones, 12 sin leer');
    });

    it('sin indicador en la página no hace nada', () => {
      simularDocumento({ conIndicador: false });

      assert.doesNotThrow(() => mostrarNoLeidas(3));
    });
  });
});
