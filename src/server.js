// env va primero: si falta una variable, el arranque se corta antes de cargar lo demás.
const env = require('./config/env');
const app = require('./app');
const { cerrarPool } = require('./config/db');

const servidor = app.listen(env.puerto, () => {
  console.log(`Servidor escuchando en http://localhost:${env.puerto}`);
});

function apagar() {
  servidor.close(async () => {
    await cerrarPool();
    process.exit(0);
  });
}

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
