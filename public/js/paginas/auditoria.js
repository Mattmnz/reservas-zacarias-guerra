import { pedir } from '../api.js';
import { ENTIDADES, consultaAuditoria, textoAccion, textoAutor, textoCambio, textoEntidad } from '../auditoria.js';
import { formatearFecha, formatearHora } from '../formato.js';
import { leerIdPositivo, leerOpcion } from '../parametros.js';
import { exigirRol } from '../sesion.js';

await exigirRol('ADMIN');

// Los filtros viven en la URL: "atrás", recargar y volver del login retoman la misma consulta.
const parametros = new URLSearchParams(location.search);
const entidad = leerOpcion(parametros.get('entidad'), Object.keys(ENTIDADES)) ?? '';
const entidadId = leerIdPositivo(parametros.get('entidadId'));

document.querySelector('[name="entidad"]').value = entidad;
document.querySelector('[name="entidadId"]').value = entidadId ?? '';

function crearParrafo(etiqueta, valor) {
  const parrafo = document.createElement('p');
  const fuerte = document.createElement('strong');
  fuerte.textContent = valor;
  parrafo.append(`${etiqueta}: `, fuerte);
  return parrafo;
}

function crearTarjeta(registro, usuarios, canchas) {
  const tarjeta = document.createElement('section');
  tarjeta.className = 'tarjeta tarjeta--auditoria';

  const titulo = document.createElement('h2');
  titulo.textContent = textoEntidad(registro, usuarios, canchas);

  tarjeta.append(titulo, crearParrafo('Acción', textoAccion(registro.accion)));

  const cambio = textoCambio(registro);
  if (cambio) tarjeta.append(crearParrafo('Cambio', cambio));

  tarjeta.append(
    crearParrafo('Autor', textoAutor(registro.usuarioId, usuarios)),
    crearParrafo('Fecha', `${formatearFecha(registro.fecha)}, ${formatearHora(registro.fecha)}`),
  );
  if (registro.motivo) tarjeta.append(crearParrafo('Detalle', registro.motivo));
  return tarjeta;
}

try {
  const [registros, listaUsuarios, listaCanchas] = await Promise.all([
    pedir(`/auditoria?${consultaAuditoria({ entidad, entidadId })}`),
    // Los nombres son secundarios: sin ellos, la auditoría se muestra con "Usuario #N" y "Cancha #N".
    pedir('/usuarios').catch(() => []),
    // incluirInactivas: una cancha dada de baja conserva su nombre en los registros viejos.
    pedir('/canchas?incluirInactivas=true').catch(() => []),
  ]);
  const usuarios = new Map(listaUsuarios.map((u) => [u.id, u]));
  const canchas = new Map(listaCanchas.map((c) => [c.id, c]));
  document
    .querySelector('[data-registros]')
    .append(...registros.map((registro) => crearTarjeta(registro, usuarios, canchas)));
  document.querySelector('[data-vacio]').hidden = registros.length > 0;
} catch (error) {
  const aviso = document.querySelector('[data-error]');
  aviso.textContent = error.mensaje;
  aviso.hidden = false;
} finally {
  document.querySelector('[data-cargando]').hidden = true;
}
