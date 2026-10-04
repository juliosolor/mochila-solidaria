# Publicar Mochila Solidaria en Hostinger

Esta guía sustituye a la parte de «Render» de GUIA_PUBLICACION.md. El resto (Stripe, proveedor, avisos legales) sigue igual.

## Qué necesitas

- Un plan de Hostinger con aplicaciones Node.js: **Business Web Hosting** o cualquier plan **Cloud**. El hosting compartido básico (Single) no sirve.
- Para una prueba: nada más. Para abrir al público: una base de datos Postgres externa (Neon, neon.tech, región UE, tiene plan gratuito) y un dominio.

## Cada proyecto, en su propio sitio

En hPanel, cada «sitio web» es independiente: tiene sus archivos y su dirección. Mochila Solidaria se crea como **un sitio nuevo** y no toca ni comparte nada con tus otros proyectos. No subas este zip encima de un sitio que ya exista.

## Primera prueba (sin dominio y sin base de datos externa)

Sirve para ver la web funcionando en Hostinger. No uses datos reales: en este modo los pagos son simulados y los datos pueden perderse al volver a subir el zip.

1. En hPanel entra en **Sitios web**, elige tu plan y pulsa **Crear sitio web**.
2. Elige **Aplicación web Node.js** y sube `mochila-solidaria-hostinger.zip` sin descomprimir.
3. Cuando te pregunte por el dominio, elige continuar con un **dominio temporal**.
4. Node 20 o superior. Archivo de entrada: `server.js`. Comando de arranque: `npm start`.
5. Variables de entorno: `OWNER_EMAIL`, `OWNER_PASSWORD` (una clave larga) y `BASE_URL` con la dirección temporal que te asigne Hostinger, sin barra final. No pongas `NODE_ENV=production` ni `DATABASE_URL`.
6. Abre la dirección temporal. Para ver el panel del propietario, entra en `/propietario/entrar`.

## Para abrir al público (más adelante)

1. Crea la base de datos en Neon y copia su dirección (empieza por `postgres://`): será `DATABASE_URL`.
2. Añade las variables `NODE_ENV=production`, `DATABASE_URL`, `CONTACT_EMAIL`, `LEGAL_NAME`, `LEGAL_TAX_ID`, `LEGAL_ADDRESS`, `SUPPLIER_AUTO_CONFIRM=0`, y las de Stripe.
3. Conecta tu dominio al sitio, activa el certificado SSL y pon ese dominio en `BASE_URL` **antes** de imprimir ningún QR.
4. Sigue los pasos 4 a 7 de GUIA_PUBLICACION.md (Stripe en modo de prueba, proveedor en borrador).

## Si usas un VPS de Hostinger (con Docker)

Es la vía que se está usando ahora. Cada proyecto va en su propio contenedor, así que no se mezcla con nada más del servidor (por ejemplo n8n).

1. Sube el contenido de este zip (descomprimido) a un repositorio de GitHub nuevo llamado `mochila-solidaria`. Contiene el código y el `Dockerfile`, pero ninguna clave.
2. En hPanel, abre tu VPS y entra en **Administrador de Docker**. Elige **Compose manualmente**, pega el contenido de `compose-mochila-hostinger.yml` y cambia solo los textos que empiezan por `CAMBIA`.
3. Despliega. Cuando termine, la web está en `http://IP-DEL-SERVIDOR:3100`.
4. Esta fase es solo de prueba: sin candado (http), pagos simulados y sin datos reales. Usa una clave que no uses en ningún otro sitio.
5. Los datos se guardan en un volumen de Docker y se conservan al reiniciar el contenedor.

## Notas

- Las tablas se crean solas al arrancar.
- Las tipografías van incluidas en la web (carpeta `public/fonts`); no se carga nada de Google.
- Las claves y contraseñas (`OWNER_PASSWORD`, `DATABASE_URL`, claves de Stripe) escríbelas tú directamente en hPanel; no las pegues en chats ni las guardes en el zip.
- Si la web no arranca, mira primero los registros (logs) de la app en hPanel.
