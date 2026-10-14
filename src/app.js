const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { manejarErrores, rutaNoEncontrada } = require('./middlewares/manejarErrores');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

module.exports = app;
