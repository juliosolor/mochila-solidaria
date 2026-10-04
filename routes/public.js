const express = require('express');
const db = require('../lib/db');
const cfg = require('../lib/config');
const { page, alertBox } = require('../lib/html');
const { esc, eur, toCents, slugify, hashPassword, validEmail, isHex, rateLimit } = require('../lib/util');
const auth = require('../lib/auth');
const TYPES = require('../lib/types');
const QRCode = require('qrcode');
const { svg } = require('../lib/art');
const router = express.Router();

router.get('/', async (req, res) => {
  const prods = (await db.all('SELECT shape,name FROM products WHERE active ORDER BY sort')).slice(0, 4);
  const inks = ['#2748E8', '#D42E22', '#0B7A5A', '#E59A0B'];
  const qr = await QRCode.toString(`${cfg.baseUrl}/como-funciona`, { type: 'svg', margin: 0, color: { dark: '#1A1446', light: '#ffffff' } });
  res.send(page({
    title: `${cfg.brand} · Tiendas solidarias para colegios, clubes y asociaciones`,
    desc: 'Tu entidad tiene su tienda con su marca. Cada persona, su QR. Lo que compran familiares y amigos va a su objetivo.',
    current: '/',
    body: `<div class="wrap"><div class="home-hero">
    <div><h1>Una tienda con vuestra marca. Cada compra, para el objetivo de quien la genera.</h1>
    <p class="lead">Camisetas, sudaderas y más con vuestro escudo. Cada alumno, socio o miembro tiene su QR y su código: familiares y amigos compran, y lo que se recauda va a su objetivo. Nosotros vendemos, cobramos y entregamos en casa.</p>
    <div class="actions"><a class="btn" href="/alta">Dar de alta mi entidad</a><a class="btn ghost" href="/como-funciona">Cómo funciona</a></div></div>
    <figure class="stage" style="margin:0" aria-label="Ejemplo de la tarjeta personal que recibe cada vendedor, con su QR y su código">
      <div class="tag"><div class="tag-top">Esto es para</div>
        <div class="tag-body"><div class="tag-name">Lucía</div><div class="tag-goal">Nuestro viaje a Lisboa</div>
          <div class="tag-code">LUC-4821<small>Su código personal</small></div><div class="tag-qr">${qr}</div></div></div>
      <div class="gear" aria-hidden="true"><div class="g">${svg('tee', '#2748E8', 'Lisboa', null)}</div><div class="g">${svg('hoodie', '#0B7A5A', '', null)}</div><div class="g">${svg('mug', '#E59A0B', '', null)}</div></div>
    </figure></div>
    <section class="block"><h2>Tres pasos y la tienda está abierta</h2>
      <ol class="legs">
        <li><b>La entidad abre su tienda</b><span>Sube el escudo, elige los colores y los artículos que quiere vender. Es gratis.</span></li>
        <li><b>Cada persona recibe su QR</b><span>Alumnos, socios o voluntarios tienen su código y su página personal para compartir.</span></li>
        <li><b>La familia compra y el pedido llega a casa</b><span>Quien compra ve a quién ayuda. Nosotros cobramos, producimos y entregamos.</span></li>
      </ol></section>
    <section class="block"><h2>Lo que vuestra gente podrá comprar</h2>
      <p class="note" style="max-width:60ch">Prendas y artículos con vuestro escudo. Cada entidad elige cuáles ofrece.</p>
      <div class="shelf">${prods.map((p, i) => `<div class="tile"><div class="pic" style="background:color-mix(in srgb,${inks[i % 4]} 13%,#fff)">${svg(p.shape, inks[i % 4], '', null)}</div><b>${esc(p.name)}</b></div>`).join('')}</div></section>
    <section class="block"><div class="trio">
      <div><h3>Sin gestionar pedidos</h3><p>Nada de cajas, tallas ni repartos. Cada pedido llega al domicilio de quien compra.</p></div>
      <div><h3>Cada uno, su objetivo</h3><p>Quien compra ve a quién ayuda, para qué y su mensaje de agradecimiento.</p></div>
      <div><h3>Gratis para la entidad</h3><p>El alta y el uso no cuestan nada. Solo el administrador ve las cuentas y solicita el dinero.</p></div>
    </div></section></div>
    <section class="band"><div class="wrap"><h2>Abre la tienda de tu entidad</h2>
      <p>El alta es gratuita. Después podréis personalizar la tienda y dar de alta a cada persona con su QR.</p>
      <div class="actions"><a class="btn" href="/alta">Dar de alta mi entidad</a><a class="btn ghost" href="/como-funciona">Ver cómo funciona</a></div></div></section>`,
  }));
});

router.get('/como-funciona', async (req, res) => {
  const p = await db.one("SELECT * FROM products WHERE id='camiseta' AND active") || await db.one('SELECT * FROM products WHERE active ORDER BY sort LIMIT 1');
  const split = p ? (() => {
    const a = p.commission_cents, b = p.price_cents - a;
    return `<div class="split" role="img" aria-label="Reparto de ${esc(p.name)}: ${eur(a)} al objetivo del vendedor, ${eur(b)} producto, envío y gestión">
      <div style="flex:${a};background:#0a7a3b">${eur(a)}</div><div style="flex:${b};background:#4b5566">${eur(b)}</div></div>
      <p class="note"><b>${esc(p.name)} a ${eur(p.price_cents)}:</b> ${eur(a)} van directamente al objetivo del vendedor; ${eur(b)} cubren el producto, el envío y la gestión.</p>`;
  })() : '';
  res.send(page({
    title: `Cómo funciona · ${cfg.brand}`, current: '/como-funciona',
    body: `<div class="wrap narrow"><div class="hero"><h1>Cómo funciona ${esc(cfg.brand)}</h1>
    <p class="lead">Tu entidad monta una tienda con su marca. Cada vendedor tiene un QR y un código personales, y lo que compran sus familiares y amigos va a su objetivo. Nosotros vendemos, cobramos y distribuimos: los pedidos llegan a casa.</p>
    <div class="actions"><a class="btn" href="/alta">Dar de alta mi entidad</a></div></div>
    <h2>El uso, paso a paso</h2>
    <ol class="steps">
      <li><b>La entidad se da de alta</b><span>Registra sus datos, sube el logo o escudo, elige los colores y marca los artículos del muestrario que quiere vender.</span></li>
      <li><b>Registra a sus vendedores</b><span>Alumnos, socios o personal. De cada uno se anotan los datos necesarios y, si es menor, los de su tutor. Cada uno recibe su QR y su código.</span></li>
      <li><b>La familia compra con el QR</b><span>Quien escanea el QR ve a quién ayuda, su objetivo y su mensaje de agradecimiento. Elige artículos, compra y, si quiere, le deja un mensaje de ánimo.</span></li>
      <li><b>Nosotros nos encargamos</b><span>Cobramos con tarjeta y entregamos cada pedido en el domicilio del comprador. La entidad no gestiona pedidos, cajas ni envíos.</span></li>
      <li><b>El administrador dispone del dinero</b><span>Solo el administrador de la entidad ve todas las cuentas y solicita la transferencia cuando llegue el momento de pagar.</span></li>
    </ol>
    <section class="block"><h2>Quién ve qué</h2><div class="grid g3">
      <div class="card flat"><h3>Quien compra</h3><p class="note">Ve a qué vendedor ayuda, su objetivo y su mensaje de agradecimiento, y puede dejarle un mensaje de ánimo. No ve cuánto se ha recaudado.</p></div>
      <div class="card flat"><h3>El vendedor</h3><p class="note">Y su familia, desde un enlace privado, ven cuánto lleva recaudado y los mensajes que le dejan. No pueden retirar ni disponer del dinero.</p></div>
      <div class="card flat"><h3>El administrador</h3><p class="note">Es la única persona que ve todas las cuentas y puede solicitar la transferencia del dinero recaudado.</p></div></div></section>
    <section class="block"><h2>Reparto económico</h2><div class="card"><p>El alta y el uso de la plataforma son gratuitos para la entidad. De cada artículo vendido, una cantidad fija va directamente al objetivo del vendedor que ha generado la venta.</p>${split}
      <p class="note">El dinero queda disponible para la entidad pasados ${cfg.holdDays} días desde la compra (plazo para posibles devoluciones). Los importes definitivos se publicarán antes de abrir el servicio.</p></div></section>
    <section class="block"><h2>Fiscalidad y gastos</h2><div class="card pending"><span class="chip warn">Pendiente de confirmar con un asesor</span>
      <p style="margin-top:10px">Esta página no da información fiscal hasta que esté confirmada. Antes de empezar, la entidad debe consultar con su gestoría o asesor fiscal cómo le afecta recaudar dinero de este modo.</p>
      <p class="note" style="color:var(--ink)">Puntos que hay que cerrar:</p><ul class="plain">
      <li>IVA de las ventas y quién emite la factura de cada pedido.</li>
      <li>Si la entidad debe declarar o contabilizar lo recaudado, según su figura legal (centro educativo, AMPA, club, asociación).</li>
      <li>Tratamiento del dinero que se asigna a cada vendedor, sobre todo cuando son menores.</li>
      <li>Facturación entre la plataforma y la entidad.</li>
      <li>Costes del cobro con tarjeta, devoluciones y plazos de transferencia a la entidad.</li></ul></div></section>
    <section class="block"><h2>Datos personales</h2><div class="card"><p>Los datos de la entidad, de los vendedores y de sus tutores se usan solo para lo que establece la ley de protección de datos y para gestionar la tienda. Los vendedores menores necesitan el consentimiento de su madre, padre o tutor.</p>
      <a class="btn ghost" href="/privacidad">Leer la información de privacidad</a></div></section></div>`,
  }));
});

function altaForm(v = {}, err = '') {
  const f = (k) => esc(v[k] || '');
  return page({
    title: `Dar de alta mi entidad · ${cfg.brand}`, current: '/alta',
    body: `<div class="wrap narrow"><div class="hero" style="padding-bottom:10px"><h1>Registra tu entidad</h1>
      <p class="lead">Es gratis. Después podrás personalizar la tienda y dar de alta a tus vendedores, cada uno con su QR y su código.</p></div>
      ${alertBox(err)}
      <form method="post" action="/alta" class="card">
      <h2>Datos de la entidad</h2>
      <label class="f">Tipo de entidad<select class="in" name="type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${v.type === k ? ' selected' : ''}>${t.label}</option>`).join('')}</select></label>
      <div class="row"><label class="f">Nombre público (el que verá la gente) *<input class="in" name="name" value="${f('name')}" required maxlength="80"></label>
      <label class="f">Nombre oficial o razón social *<input class="in" name="legal_name" value="${f('legal_name')}" required maxlength="120"></label></div>
      <div class="row"><label class="f">NIF o CIF *<input class="in" name="tax_id" value="${f('tax_id')}" required maxlength="20" style="text-transform:uppercase"></label>
      <label class="f">Teléfono<input class="in" name="phone" value="${f('phone')}" maxlength="30" inputmode="tel"></label></div>
      <div class="row"><label class="f">Domicilio *<input class="in" name="address" value="${f('address')}" required maxlength="150"></label>
      <label class="f">Localidad y código postal *<input class="in" name="city" value="${f('city')}" required maxlength="80"></label></div>
      <div class="row"><label class="f">Nombre del objetivo (p. ej. «Viaje de fin de curso a Doñana») *<input class="in" name="goal_title" value="${f('goal_title')}" required maxlength="100"></label>
      <label class="f">Objetivo por vendedor (€) *<input class="in" name="goal" value="${f('goal') || '150'}" required inputmode="decimal"></label></div>
      <h2 style="margin-top:22px">Administrador de la entidad</h2>
      <p class="note">Será la única persona con acceso a todas las cuentas y a la solicitud de transferencia del dinero.</p>
      <div class="row"><label class="f">Nombre y apellidos *<input class="in" name="contact_name" value="${f('contact_name')}" required maxlength="100" autocomplete="name"></label>
      <label class="f">Cargo<input class="in" name="contact_role" value="${f('contact_role')}" maxlength="60"></label></div>
      <div class="row"><label class="f">Correo electrónico (será tu usuario) *<input class="in" type="email" name="email" value="${f('email')}" required maxlength="120" autocomplete="email"></label>
      <label class="f">Contraseña (mínimo 10 caracteres) *<input class="in" type="password" name="password" required minlength="10" autocomplete="new-password"></label></div>
      <label class="check"><input type="checkbox" name="terms" value="1" required><span>He leído la <a href="/privacidad" target="_blank">información sobre protección de datos</a> y el <a href="/aviso-legal" target="_blank">aviso legal</a>, y actúo en nombre de la entidad.</span></label>
      <label class="check"><input type="checkbox" name="consents" value="1" required><span>Me comprometo a dar de alta como vendedores menores de edad solo a quienes cuenten con el consentimiento de su madre, padre o tutor.</span></label>
      <div class="actions"><button class="btn" type="submit">Crear mi entidad</button></div></form></div>`,
  });
}
router.get('/alta', (req, res) => res.send(altaForm()));
router.post('/alta', express.urlencoded({ extended: false, limit: '50kb' }), async (req, res) => {
  const b = req.body || {};
  if (!rateLimit('alta:' + req.ip, 8, 3600_000)) return res.status(429).send(altaForm(b, 'Demasiados intentos. Inténtalo más tarde.'));
  const need = ['name', 'legal_name', 'tax_id', 'address', 'city', 'goal_title', 'contact_name', 'email', 'password'];
  if (need.some(k => !String(b[k] || '').trim())) return res.status(400).send(altaForm(b, 'Rellena todos los campos obligatorios.'));
  if (!validEmail(b.email)) return res.status(400).send(altaForm(b, 'El correo no parece válido.'));
  if (String(b.password).length < 10) return res.status(400).send(altaForm(b, 'La contraseña debe tener al menos 10 caracteres.'));
  if (!b.terms || !b.consents) return res.status(400).send(altaForm(b, 'Debes aceptar las condiciones para continuar.'));
  if (!TYPES[b.type]) b.type = 'otra';
  if (await db.one('SELECT 1 FROM entities WHERE email=$1', [b.email.trim().toLowerCase()]))
    return res.status(400).send(altaForm(b, 'Ya existe una entidad con ese correo. Entra desde «Acceso entidades».'));
  let slug = slugify(b.name), n = 2;
  while (await db.one('SELECT 1 FROM entities WHERE slug=$1', [slug])) slug = slugify(b.name) + '-' + n++;
  const e = await db.one(`INSERT INTO entities(slug,type,name,legal_name,tax_id,address,city,contact_name,contact_role,email,phone,password_hash,goal_title,goal_cents,accepted_terms_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW()) RETURNING id`,
    [slug, b.type, b.name.trim(), b.legal_name.trim(), b.tax_id.trim().toUpperCase(), b.address.trim(), b.city.trim(), b.contact_name.trim(),
      (b.contact_role || '').trim(), b.email.trim().toLowerCase(), (b.phone || '').trim(), hashPassword(b.password), b.goal_title.trim(), Math.max(100, toCents(b.goal) || 15000)]);
  await auth.createSession(res, 'entity', e.id);
  res.redirect('/panel/tienda?nuevo=1');
});

router.get('/privacidad', (req, res) => res.send(page({
  title: `Protección de datos y confidencialidad · ${cfg.brand}`, current: '',
  body: `<div class="wrap narrow"><div class="hero" style="padding-bottom:10px"><h1>Qué datos usamos y para qué</h1>
  <p class="lead">Usamos los datos personales solo para lo que permite la normativa de protección de datos y para gestionar la tienda. Nada más.</p></div>
  <div class="card pending"><span class="chip warn">Borrador pendiente de revisión legal</span><p class="note" style="color:var(--ink);margin-top:8px">Este texto es un borrador de trabajo. Antes de abrir el servicio debe revisarlo un asesor jurídico o un delegado de protección de datos, y completarse los datos marcados entre corchetes.</p></div>
  <div class="grid legalbox" style="margin-top:18px">
  <div class="card flat"><h2>Quién es el responsable</h2><p>${esc(cfg.legal.name)}, ${esc(cfg.legal.taxId)}, ${esc(cfg.legal.address)}. Contacto para cuestiones de privacidad: <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>.</p></div>
  <div class="card flat"><h2>Qué datos tratamos</h2><ul class="plain">
    <li><b>De la entidad:</b> nombre oficial, NIF o CIF, domicilio, datos del administrador y cuenta bancaria para la transferencia.</li>
    <li><b>De cada vendedor:</b> nombre, curso o grupo y código personal. Si es menor, también nombre y contacto de su madre, padre o tutor, y la foto y el mensaje de agradecimiento si deciden añadirlos. También los mensajes de ánimo que reciba de quienes compran.</li>
    <li><b>De quien compra:</b> los datos necesarios para tramitar el pedido, el pago y el envío.</li></ul></div>
  <div class="card flat"><h2>Para qué los usamos</h2><ul class="plain"><li>Crear y gestionar la tienda de la entidad.</li><li>Asociar cada compra a su vendedor y llevar la cuenta de lo recaudado.</li><li>Cobrar los pedidos y entregarlos a quien compra.</li><li>Cumplir las obligaciones legales que apliquen.</li></ul>
    <p class="note">No usamos los datos para otras finalidades ni los cedemos a terceros, salvo a los proveedores de servicios imprescindibles para prestar el servicio, como el cobro con tarjeta (Stripe) y la logística de entrega. [Lista de destinatarios: pendiente de revisión legal.]</p></div>
  <div class="card flat"><h2>Base legal y menores</h2><p>Tratamos los datos conforme al Reglamento general de protección de datos (RGPD) y a la Ley Orgánica de Protección de Datos y garantía de los derechos digitales (LOPDGDD).</p>
    <p>Los menores de 14 años no pueden dar su consentimiento por sí mismos. En esos casos hace falta el de su madre, padre o tutor, y la entidad debe tenerlo antes de dar de alta al vendedor. En el alta, la entidad confirma que dispone de él.</p></div>
  <div class="card flat"><h2>Confidencialidad: quién puede ver qué</h2><ul class="plain">
    <li>El <b>administrador de la entidad</b> ve las cuentas de todos sus vendedores.</li>
    <li>Cada <b>vendedor y su familia</b> ven, desde un enlace privado, cuánto lleva recaudado y los mensajes recibidos.</li>
    <li>Quien compra ve el nombre del vendedor, su objetivo, su mensaje y su foto si la ha puesto. No ve datos de contacto ni lo recaudado.</li></ul></div>
  <div class="card flat"><h2>Conservación</h2><p>Conservamos los datos mientras sean necesarios para prestar el servicio y durante los plazos que exija la ley. [Plazos concretos: pendiente de definir.]</p></div>
  <div class="card flat"><h2>Tus derechos</h2><p>Puedes pedir acceso a tus datos, su rectificación, su supresión, la limitación o la oposición al tratamiento, y su portabilidad. Escribe a <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>. Si crees que no hemos atendido tus derechos, puedes reclamar ante la Agencia Española de Protección de Datos (AEPD).</p></div>
  </div></div>`,
})));

router.get('/aviso-legal', (req, res) => res.send(page({
  title: `Aviso legal · ${cfg.brand}`,
  body: `<div class="wrap narrow"><div class="hero" style="padding-bottom:10px"><h1>Aviso legal</h1></div>
  <div class="card pending"><span class="chip warn">Borrador pendiente de revisión legal</span></div>
  <div class="card flat" style="margin-top:18px"><h2>Titular del sitio</h2><p>${esc(cfg.legal.name)} · ${esc(cfg.legal.taxId)} · ${esc(cfg.legal.address)} · <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a></p>
  <h2>Condiciones de compra</h2><p>[Pendiente de redactar y revisar legalmente: precios, impuestos, plazos de entrega, derecho de desistimiento y condiciones especiales de los artículos personalizados, devoluciones.]</p>
  <h2>Cookies</h2><p>Este sitio usa únicamente una cookie técnica de sesión para los paneles de gestión. No usa cookies de publicidad ni de seguimiento.</p></div></div>`,
})));

module.exports = router;
