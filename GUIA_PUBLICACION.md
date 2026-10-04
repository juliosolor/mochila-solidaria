# Guía de publicación — paso a paso

Tiempo estimado: una tarde. No hace falta saber programar: son cuentas que crear y datos que copiar y pegar.
Haz primero **todo en modo de prueba** (Stripe en modo prueba y pedidos al proveedor como borrador) y solo al final pasa a real.

## Qué vas a necesitar

| Qué | Para qué | Coste orientativo* |
|---|---|---|
| Cuenta en **GitHub** | guardar el código | gratis |
| **Neon** (base de datos) | guardar entidades, vendedores y pedidos | gratis para empezar |
| **Render** (servidor) | que la web esté siempre encendida | de pago (el plan gratuito se “duerme” y no sirve para vender) |
| **Stripe** | cobrar con tarjeta | % por cobro |
| Cuenta del **proveedor de impresión** | fabricar y enviar | coste por pedido |
| Un **dominio** (p. ej. mochilasolidaria.es) | dirección de la web y de los QR | unos euros al año |

\* Comprueba los precios actuales en cada web; cambian.

---

## Paso 1 · Subir el proyecto a GitHub

1. Crea una cuenta en github.com y pulsa **New repository**. Nómbralo `mochila-solidaria`, márcalo **Private**.
2. Descomprime el archivo `mochila-solidaria.zip` en tu ordenador.
3. En el repositorio nuevo pulsa **uploading an existing file** y arrastra **el contenido de la carpeta** (no la carpeta en sí). Pulsa **Commit changes**.

## Paso 2 · Base de datos (Neon)

1. Entra en neon.tech, crea una cuenta y un proyecto. Elige región de la **UE (Fráncfort)**.
2. En el panel pulsa **Connection string** y copia la dirección completa (empieza por `postgres://`). Es tu `DATABASE_URL`. Guárdala; es secreta.
3. Las tablas se crean solas la primera vez que arranca la web.

## Paso 3 · Servidor (Render)

1. Entra en render.com con tu cuenta de GitHub.
2. **New → Web Service** → elige el repositorio `mochila-solidaria`.
3. Rellena: Runtime **Node**, Build command `npm install`, Start command `npm start`, plan **Starter** (de pago).
4. En **Environment** añade estas variables (hay una lista completa y comentada en `.env.example`):

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | la de Neon |
| `BASE_URL` | de momento la dirección que te dé Render (`https://mochila-solidaria.onrender.com`). **Cámbiala por tu dominio antes de imprimir ningún QR** |
| `OWNER_EMAIL` y `OWNER_PASSWORD` | tu acceso privado al panel de propietario. Clave larga y única |
| `CONTACT_EMAIL`, `LEGAL_NAME`, `LEGAL_TAX_ID`, `LEGAL_ADDRESS` | tus datos, para privacidad y aviso legal |
| `SUPPLIER_AUTO_CONFIRM` | `0` |

5. Pulsa **Create Web Service**. En unos minutos verás “Live”. Abre la dirección: debe verse la web.
6. Entra en `/propietario/entrar` con tu correo y clave. Si entras, todo va bien.

## Paso 4 · Cobros (Stripe)

1. Crea cuenta en stripe.com y deja el interruptor en **modo de prueba**.
2. **Desarrolladores → Claves de API** → copia la **clave secreta** (`sk_test_…`). En Render añade `STRIPE_SECRET_KEY`.
3. **Desarrolladores → Webhooks → Añadir endpoint**:
   - URL: `https://TU-DIRECCIÓN/webhook/stripe`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`
4. Copia el **secreto de firma** (`whsec_…`) y añádelo en Render como `STRIPE_WEBHOOK_SECRET`. Render se reinicia solo.
5. Prueba una compra con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC). Debe aparecer el pedido como pagado y sumar al vendedor.
6. Para cobrar de verdad: completa la verificación de tu negocio en Stripe, cambia a modo real, sustituye las dos claves por las reales (`sk_live_…` y el `whsec_…` del endpoint real) y vuelve a probar con una compra pequeña.

## Paso 5 · Proveedor de impresión y envío

1. Crea tu cuenta en el proveedor y una tienda de tipo API / pedidos manuales.
2. Genera un **token privado** con permiso para crear pedidos. Añádelo en Render como `SUPPLIER_API_TOKEN` (y `SUPPLIER_STORE_ID` si te lo piden).
3. En `/propietario/catalogo` escribe, para cada artículo, su **referencia de proveedor**:
   - artículos con tallas: `{"S":4012,"M":4013,"L":4014}` (talla → id de variante del catálogo del proveedor)
   - los demás: un solo número.
   Ajusta ahí también **precio, comisión del vendedor y coste real**. El panel te avisa del margen.
4. Con `SUPPLIER_AUTO_CONFIRM=0` cada pedido llega al proveedor como **borrador**: tú lo ves y lo confirmas allí. Haz 2–3 pedidos de prueba y comprueba dirección, talla, diseño y precio.
5. Cuando todo sea correcto, pon `SUPPLIER_AUTO_CONFIRM=1`: desde entonces cada pago confirmado se produce y envía solo.
6. Si un envío falla, aparece en tu panel en «Pedidos sin enviar al proveedor» con el motivo y un botón **Reintentar**.

> **Importante:** el envío al proveedor está probado contra una simulación, no contra su servicio real. Antes de abrir, contrasta `lib/supplier.js` con la documentación vigente de su API (versión del endpoint, formato de archivos de diseño y posición de la impresión). Está aislado en un solo archivo para que sea fácil ajustarlo.

## Paso 6 · Dominio

1. Compra el dominio donde prefieras.
2. En Render → tu servicio → **Settings → Custom Domains**, añade el dominio y copia en tu registrador los datos DNS que te indique.
3. Cambia `BASE_URL` en Render por `https://tu-dominio.es`. **Los QR y los PDF usan esta dirección**, así que hazlo antes de entregar nada a ninguna entidad.
4. En Stripe, actualiza la URL del webhook a tu dominio.

## Paso 7 · Primera vuelta completa (con el modo de prueba)

1. Da de alta una entidad ficticia en `/alta`. Sube un logo, elige colores y artículos.
2. Añade 2–3 vendedores (uno menor, con datos de tutor). Descarga el PDF de tarjetas QR y escanea uno con el móvil.
3. Compra con ese QR (tarjeta de prueba). Comprueba: aparece «Esto es para…», sube la barra de progreso, llega el borrador al proveedor.
4. Como administrador, pide una retirada (hace falta que pase `PAYOUT_HOLD_DAYS`; para probar ponlo a 0 en Render). Como propietario, márcala como pagada.
5. Revisa tu panel: ventas, beneficio y reparto cuadran con tu cuenta.

## Paso 8 · Copias de seguridad

En Neon activa el historial / copias del proyecto (en sus ajustes). Es la única copia de tus datos.

---

## Antes de abrir al público (no lo des por resuelto)

Estas cosas **no las puede resolver el código** y la web las deja marcadas como pendientes:

1. **Fiscalidad.** IVA de las ventas, quién factura qué (a los compradores, y entre tú y la entidad), cómo tributa lo que recauda cada entidad y cada vendedor menor. Habla con un asesor. La web no afirma nada fiscal y los beneficios del panel **no incluyen impuestos**.
2. **Dinero de terceros.** Hoy los cobros entran en *tu* cuenta de Stripe y luego transfieres a cada entidad. Recibir dinero para entregarlo a otros puede tener implicaciones de servicios de pago. Pídele a tu asesor que lo revise; una alternativa técnica es Stripe Connect (cada entidad con su cuenta), que cambia el flujo y habría que implementar.
3. **Textos legales.** Privacidad, aviso legal y condiciones de compra son borradores. Hace falta revisión jurídica, completar los corchetes, y especialmente: derecho de desistimiento en artículos personalizados, devoluciones, plazos de conservación y lista de destinatarios de datos.
4. **Menores.** La plataforma exige marcar que hay consentimiento, pero tú eres responsable de que las entidades lo recojan de verdad. Conviene un contrato/aceptación con cada entidad.
5. **Contrato con las entidades.** Quién es responsable de qué, plazos de retirada, qué pasa con devoluciones, etc.
6. **Precios y comisiones definitivos**, y los costes reales del proveedor (incluido el envío).
7. **Envíos.** Ahora solo a direcciones de España y al domicilio del comprador.
8. **Seguridad.** Usa claves largas, no compartas el acceso de propietario, y revisa de vez en cuando los accesos a Render, Neon y Stripe.

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| La web no abre | Render → Logs. Casi siempre falta `DATABASE_URL` o está mal copiada |
| Pago hecho pero el pedido sigue «pendiente» | Stripe → Webhooks: ¿URL correcta y secreto igual que `STRIPE_WEBHOOK_SECRET`? |
| El pedido no llega al proveedor | Tu panel → «Pedidos sin enviar»: lee el motivo (suele ser una referencia de artículo sin rellenar o un token incorrecto) |
| El QR lleva a una dirección vieja | `BASE_URL` estaba mal cuando se generó; corrígela y vuelve a descargar los PDF |
| Entidad que no recuerda su clave | Por ahora se restablece a mano en la base de datos; pídele escribir desde su correo de administrador |
