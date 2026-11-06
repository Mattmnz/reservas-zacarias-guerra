import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { ErrorApi, iniciarSesion, pedir } from './api.js';

function simularGlobal(nombre, valor) {
  Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });
}

function crearAlmacen(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
  };
}

function respuestaJson(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status });
}

const pasarTurno = () => new Promise((resolve) => setImmediate(resolve));

describe('api.pedir', () => {
  beforeEach(() => {
    simularGlobal('sessionStorage', crearAlmacen({ 'zg.token': 'abc' }));
    simularGlobal('location', {
      pathname: '/cliente/historial.html',
      search: '?id=3',
      replace: mock.fn(),
    });
  });

  it('envía el token y devuelve data', async () => {
    simularGlobal('fetch', mock.fn(async () => respuestaJson(200, { data: { id: 1 } })));

    assert.deepEqual(await pedir('/auth/yo'), { id: 1 });

    const [url, opciones] = fetch.mock.calls[0].arguments;
    assert.equal(url, '/api/auth/yo');
    assert.equal(opciones.headers.Authorization, 'Bearer abc');
  });

  it('un 401 autenticado expira la sesión, guarda el retorno y va al login', async () => {
    simularGlobal('fetch', async () =>
      respuestaJson(401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Token inválido' } }),
    );
    let termino = false;

    pedir('/auth/yo').finally(() => {
      termino = true;
    });
    await pasarTurno();

    assert.equal(termino, false);
    assert.equal(sessionStorage.getItem('zg.token'), null);
    assert.equal(sessionStorage.getItem('zg.retorno'), '/cliente/historial.html?id=3');
    assert.deepEqual(location.replace.mock.calls[0].arguments, ['/login.html']);
  });

  it('un 401 del login llega al formulario, sin token y sin redirigir', async () => {
    simularGlobal(
      'fetch',
      mock.fn(async () =>
        respuestaJson(401, {
          error: { codigo: 'NO_AUTENTICADO', mensaje: 'Correo o contraseña incorrectos' },
        }),
      ),
    );

    await assert.rejects(iniciarSesion('a@b.co', 'clave-mala'), (error) => {
      assert.ok(error instanceof ErrorApi);
      assert.equal(error.status, 401);
      assert.equal(error.mensaje, 'Correo o contraseña incorrectos');
      return true;
    });

    assert.equal(fetch.mock.calls[0].arguments[1].headers.Authorization, undefined);
    assert.equal(location.replace.mock.callCount(), 0);
    assert.equal(sessionStorage.getItem('zg.token'), 'abc');
  });

  it('un error de la API conserva código y mensaje', async () => {
    simularGlobal('fetch', async () =>
      respuestaJson(409, { error: { codigo: 'CORREO_DUPLICADO', mensaje: 'Ya existe' } }),
    );

    await assert.rejects(pedir('/auth/registro'), { codigo: 'CORREO_DUPLICADO', mensaje: 'Ya existe' });
  });

  it('un 204 devuelve null', async () => {
    simularGlobal('fetch', async () => new Response(null, { status: 204 }));

    assert.equal(await pedir('/algo'), null);
  });

  it('una respuesta que no es JSON da el error genérico', async () => {
    simularGlobal('fetch', async () => new Response('<h1>Bad gateway</h1>', { status: 502 }));

    await assert.rejects(pedir('/algo'), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.codigo, 'ERROR_INTERNO');
      assert.match(error.mensaje, /No se pudo completar/);
      return true;
    });
  });

  it('un 200 que no es JSON tampoco se toma como éxito', async () => {
    simularGlobal('fetch', async () => new Response('<html></html>', { status: 200 }));

    await assert.rejects(pedir('/algo'), ErrorApi);
  });

  it('un fallo de red da el error genérico', async () => {
    simularGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });

    await assert.rejects(pedir('/algo'), { status: 0, codigo: 'SIN_CONEXION' });
  });
});
