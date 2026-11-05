const MS_HORA = 3600 * 1000;
const MS_DIA = 24 * MS_HORA;

// timeZone UTC: las fechas de la API son hora de pared de Nicaragua cargada en los campos UTC.
const formatoFecha = new Intl.DateTimeFormat('es-NI', { dateStyle: 'full', timeZone: 'UTC' });
const formatoMonto = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Fecha de Nicaragua (UTC−6) sin importar la zona del navegador: YYYY-MM-DD.
export function fechaNicaragua(dias = 0) {
  return new Date(Date.now() - 6 * MS_HORA + dias * MS_DIA).toISOString().slice(0, 10);
}

export function formatearFecha(texto) {
  return formatoFecha.format(new Date(`${texto}Z`));
}

export function formatearHora(texto) {
  return texto.slice(11, 16);
}

export function formatearMonto(monto) {
  return `C$ ${formatoMonto.format(monto)}`;
}
