const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { manejarErrores, rutaNoEncontrada } = require('./middlewares/manejarErrores');
const path = require('node:path');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', routes);

// Después de la API para que /api siga teniendo prioridad; `/` no consulta la base (health check de Render).
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(rutaNoEncontrada);
app.use(manejarErrores);

module.exports = app;
