require('dotenv').config({ quiet: true });

function cortar(mensaje) {
  console.error(`${mensaje}. Revisá .env (ver .env.example).`);
  process.exit(1);
}

// Devuelve los valores pedidos o corta el arranque listando todos los que faltan.
function exigir(nombres) {
  const faltantes = nombres.filter((nombre) => !process.env[nombre] || !process.env[nombre].trim());
  if (faltantes.length > 0) {
    cortar(`Faltan variables de entorno: ${faltantes.join(', ')}`);
  }
  return Object.fromEntries(nombres.map((nombre) => [nombre, process.env[nombre].trim()]));
}

function enteroPositivo(nombre, valor) {
  if (!/^\d+$/.test(valor) || Number(valor) <= 0) {
    cortar(`Variable de entorno inválida: ${nombre} debe ser un entero positivo`);
  }
  return Number(valor);
}

function booleano(nombre, valor) {
  if (valor !== 'true' && valor !== 'false') {
    cortar(`Variable de entorno inválida: ${nombre} debe ser true o false`);
  }
  return valor === 'true';
}

// Las SEED_* no se exigen aquí: el servidor no las usa y seed.js las pide con exigir().
const v = exigir([
  'PORT',
  'DB_SERVER',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_CONFIAR_CERTIFICADO',
  'JWT_SECRETO',
  'JWT_EXPIRA',
]);

module.exports = {
  puerto: enteroPositivo('PORT', v.PORT),
  db: {
    servidor: v.DB_SERVER,
    puerto: enteroPositivo('DB_PORT', v.DB_PORT),
    nombre: v.DB_NAME,
    usuario: v.DB_USER,
    password: v.DB_PASSWORD,
    confiarCertificado: booleano('DB_CONFIAR_CERTIFICADO', v.DB_CONFIAR_CERTIFICADO),
  },
  jwt: {
    secreto: v.JWT_SECRETO,
    expira: v.JWT_EXPIRA,
  },
  exigir,
};
