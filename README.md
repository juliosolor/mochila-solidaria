# Mochila Solidaria

Plataforma de tiendas solidarias de merchandising personalizado para colegios, clubes y asociaciones.

- Cada **entidad** tiene su tienda con su marca (nombre, logo, colores, imagen) y elige qué artículos del muestrario vende.
- Cada **vendedor** (alumno, socio…) tiene un **código** y un **QR** personales. Quien compra ve «Esto es para: …», el objetivo y el mensaje de agradecimiento (nunca lo recaudado), y puede dejarle un mensaje de ánimo firmado. Todo lo que compra va a ese vendedor.
- El **administrador de la entidad** es el único que ve todas las cuentas y solicita la transferencia del dinero.
- El **propietario** (tú) tiene un panel privado con ventas, costes, comisiones y beneficio por tienda, por vendedor y total.
- El pago es con **tarjeta (Stripe)**. Al confirmarse, el pedido se envía **automáticamente** al proveedor de impresión y envío. El nombre del proveedor no aparece en ninguna página pública.

## Cómo está hecho

Node.js 20+, Express, Postgres. Sin paso de compilación: se publica tal cual.

```
server.js            arranque, cabeceras de seguridad, webhook de Stripe
lib/schema.sql       tablas (se crean solas al arrancar)
lib/catalog.js       muestrario inicial (después se edita en el panel del propietario)
lib/payments.js      Stripe Checkout y confirmación de pago (idempotente)
lib/supplier.js      envío automático del pedido al proveedor (solo servidor)
lib/ledger.js        saldos, retención, beneficio
lib/pdf.js           catálogo PDF por vendedor y tarjetas QR
routes/public.js     inicio, cómo funciona, alta, privacidad, aviso legal
routes/store.js      tienda, página del vendedor (/c/CÓDIGO), pedido, gracias
routes/panel.js      panel del administrador de la entidad
routes/owner.js      panel del propietario
test/e2e.js          prueba automática de todo el flujo (npm test)
```

### Quién puede ver qué

| Rol | Entra con | Ve |
|---|---|---|
| Comprador | código o QR | vendedor, objetivo, agradecimiento, precios. **No ve lo recaudado.** Puede dejar un mensaje de ánimo |
| Vendedor y familia | enlace privado `/mi/…` (lo entrega el administrador) | lo recaudado, pedidos y los mensajes recibidos |
| Administrador de entidad | correo + contraseña | todas las cuentas de su entidad, pide la retirada |
| Propietario | `OWNER_EMAIL` + `OWNER_PASSWORD` | todo, incluidos costes y beneficio |

Los costes, el beneficio y las referencias del proveedor solo se leen en `/propietario` y en el servidor.

## Probar en local

```bash
npm install
npm run demo        # crea datos de ejemplo y arranca en http://localhost:3000
npm test            # 76 comprobaciones automáticas, con base de datos en memoria
```

Sin `DATABASE_URL` usa una base local en `.localdb/`. Sin `STRIPE_SECRET_KEY` el pago es **simulado** (modo demostración); en producción sin Stripe el pago queda desactivado.
Para ver el panel del propietario en local: `OWNER_EMAIL=yo@x.es OWNER_PASSWORD=clave-larga npm run demo`.

## Despliegue

Ver **GUIA_PUBLICACION.md** (paso a paso, sin conocimientos técnicos).

## Lo que NO está resuelto (decisiones y revisiones pendientes)

Está en la guía, sección «Antes de abrir al público». Resumen: fiscalidad/IVA, revisión legal de textos, regulación de custodia del dinero de terceros, contrato con las entidades, costes reales y precios definitivos.
