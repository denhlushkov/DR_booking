#!/bin/sh
# Генерує самопідписаний TLS-сертифікат для локального запуску, якщо власний не змонтовано.
set -e

CERT_DIR=/etc/nginx/certs
if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    exit 0
fi

echo "$0: генерую самопідписаний сертифікат для localhost"
mkdir -p "$CERT_DIR"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" 2>/dev/null
chmod 600 "$CERT_DIR/server.key"
