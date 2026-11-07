#!/usr/bin/env bash
# Prueba de humo: levanta la imagen sin base de datos y comprueba que el servidor arranca y responde.
# Uso: bash .github/scripts/prueba-humo.sh <imagen>
# No usa /api/health: sin base, esa ruta espera el tiempo de conexión y falla.
set -euo pipefail

IMAGEN="${1:?Uso: prueba-humo.sh <imagen>}"
NOMBRE=prueba-humo
PUERTO=3000
BASE="http://localhost:$PUERTO"

terminar() {
  local codigo=$?
  if [ "$codigo" -ne 0 ]; then
    echo "::error::La prueba de humo falló. Logs del contenedor:"
    docker logs "$NOMBRE" 2>&1 || true
  fi
  docker rm -f "$NOMBRE" > /dev/null 2>&1 || true
  exit "$codigo"
}
trap terminar EXIT

# Valores ficticios: env.js los exige al arrancar, pero el pool de la base se abre recién en la
# primera consulta, así que el servidor escucha sin conectarse a ninguna base.
docker run -d --name "$NOMBRE" -p "$PUERTO:$PUERTO" \
  -e PORT="$PUERTO" -e DB_SERVER=localhost -e DB_PORT=1433 -e DB_NAME=ZacariasGuerra \
  -e DB_USER=zg_app -e DB_PASSWORD=ficticia-ci -e DB_CONFIAR_CERTIFICADO=true \
  -e JWT_SECRETO=ficticio-ci -e JWT_EXPIRA=8h \
  "$IMAGEN" > /dev/null

# Hasta 30 s para que el servidor escuche.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE/"; then break; fi
  sleep 1
done

# 1. El frontend: la página de entrada. Se guarda antes de buscar para que grep -q no corte a curl.
pagina=$(curl -sf "$BASE/")
if ! grep -q "Complejo Deportivo" <<< "$pagina"; then
  echo "::error::/ no devolvió la página de entrada"
  exit 1
fi
echo "/ responde 200 con la página de entrada."

# 2. La API: una ruta protegida sin token responde 401 en JSON; el rechazo ocurre antes de consultar la base.
cuerpo=$(curl -s -w '\n%{http_code}' "$BASE/api/auth/yo")
estado=$(tail -n 1 <<< "$cuerpo")
if [ "$estado" != "401" ] || ! grep -q '"NO_AUTENTICADO"' <<< "$cuerpo"; then
  echo "::error::/api/auth/yo sin token respondió $estado; se esperaba 401 NO_AUTENTICADO"
  exit 1
fi
echo "/api/auth/yo sin token responde 401 NO_AUTENTICADO."

# 3. Lo inexistente: el 404 en JSON del manejador central.
cuerpo=$(curl -s -w '\n%{http_code}' "$BASE/api/ruta-inexistente")
estado=$(tail -n 1 <<< "$cuerpo")
if [ "$estado" != "404" ] || ! grep -q '"NO_ENCONTRADO"' <<< "$cuerpo"; then
  echo "::error::/api/ruta-inexistente respondió $estado; se esperaba 404 NO_ENCONTRADO"
  exit 1
fi
echo "/api/ruta-inexistente responde 404 NO_ENCONTRADO."
