const express = require('express');
const db = require('../lib/db');
const cfg = require('../lib/config');
const { page } = require('../lib/html');
const { esc, eur, normCode, rateLimit, validEmail, token } = require('../lib/util');
const { svg, inkFor } = require('../lib/art');
const pdf = require('../lib/pdf');
const payments = require('../lib/payments');
const TYPES = require('../lib/types');
const router = express.Router();
const SIZES = ['6', '8', '10', '12', 'S', 'M', 'L', 'XL'];

const theme = (e) => ({ color: e.color, color2: e.color2, ink: inkFor(e.color) });
async function entityProducts(e) {
  const ids = e.product_ids.split(',').filter(Boolean);
  const rows = await db.all('SELECT * FROM products WHERE active ORDER BY sort');
  return rows.filter(p => ids.includes(p.id));
}
const logoUrl = (e) => e.logo ? `/media/entity/${e.id}/logo` : null;
function storeHead(e, extra = '') {
  return `<header class="store-head"><div class="wrap">${e.logo ? `<img class="crest" src="${logoUrl(e)}" alt="Escudo de ${esc(e.name)}">` : ''}
    <div><div class="nm">${esc(e.name)}</div><div class="sub">Tienda solidaria</div></div>${extra}</div></header>
    ${e.hero ? `<div class="store-hero" style="background-image:url('/media/entity/${e.id}/hero')" role="img" aria-label="Imagen de ${esc(e.name)}"></div>` : '<div class="store-hero empty"></div>'}`;
}
const footer = (e) => `<footer class="foot"><div class="wrap"><span>Tienda solidaria de ${esc(e.name)}, con ${esc(cfg.brand)}</span><a href="/privacidad">Protección de datos</a><a href="/aviso-legal">Aviso legal</a></div></footer>`;
const bodyOf = (html, e) => html; // marcador por claridad

// ---- Tienda de la entidad: entrar con código
router.get('/t/:slug', async (req, res) => {
  const e = await db.one("SELECT * FROM entities WHERE slug=$1 AND status='active'", [req.params.slug]);
  if (!e) return res.status(404).send(page({ title: 'No encontrada', body: '<div class="wrap narrow hero"><h1>Tienda no encontrada</h1><p><a href="/">Volver al inicio</a></p></div>' }));
  const prods = await entityProducts(e);
  const T = TYPES[e.type] || TYPES.otra;
  res.send(page({
    title: `${e.name} · Tienda solidaria`, desc: `Tienda solidaria de ${e.name}: ${e.goal_title}`, bare: true, theme: theme(e), nav: 'none',
    body: `${storeHead(e)}<main class="wrap store-main">
    <div class="code-card"><h1>${esc(e.goal_title)}</h1>
      <p class="note">Cada ${esc(T.m)} tiene su propio código y su propio QR. Escanéalo o escríbelo aquí para saber a quién ayudas con tu compra.</p>
      <form action="/t/${esc(e.slug)}/entrar" method="get" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <label class="sr" style="position:absolute;left:-9999px" for="code">Código personal</label>
        <input id="code" class="in" name="code" placeholder="Código, p. ej. LUC-4821" autocomplete="off" required style="max-width:280px;text-transform:uppercase;text-align:center;font-weight:700;letter-spacing:.05em">
        <button class="btn" type="submit">Entrar</button></form>
      ${req.query.error ? '<p class="alert err" style="margin-top:14px" role="alert">No encontramos ese código. Revísalo e inténtalo de nuevo.</p>' : ''}</div>
    <h2>Lo que puedes comprar</h2><div class="grid g4">${prods.map(p => `<div class="prod"><div class="pic">${svg(p.shape, e.color, '', logoUrl(e))}</div><div class="nm">${esc(p.name)}</div><div class="pr">${eur(p.price_cents)}</div></div>`).join('')}</div>
    <p class="note" style="margin-top:14px">Todos los artículos se personalizan con la imagen de ${esc(e.name)} y se entregan en tu domicilio.</p></main>${footer(e)}`,
  }));
});
router.get('/t/:slug/entrar', async (req, res) => {
  if (!rateLimit('code:' + req.ip, 40, 600_000)) return res.status(429).send('Demasiados intentos');
  const code = normCode(req.query.code);
  const s = await db.one(`SELECT s.code FROM sellers s JOIN entities e ON e.id=s.entity_id WHERE e.slug=$1 AND s.code=$2 AND s.active AND s.consent`, [req.params.slug, code]);
  res.redirect(s ? `/c/${s.code}` : `/t/${encodeURIComponent(req.params.slug)}?error=1`);
});
router.get('/entrar', (req, res) => res.redirect('/'));

async function loadSeller(code) {
  const s = await db.one(`SELECT s.* FROM sellers s WHERE s.code=$1 AND s.active AND s.consent`, [normCode(code)]);
  if (!s) return {};
  const e = await db.one("SELECT * FROM entities WHERE id=$1 AND status='active'", [s.entity_id]);
  return e ? { s, e } : {};
}

// ---- Página personal del vendedor (QR / código)
router.get('/c/:code', async (req, res) => {
  const { s, e } = await loadSeller(req.params.code);
  if (!s) return res.status(404).send(page({ title: 'Código no encontrado', body: '<div class="wrap narrow hero"><h1>Código no encontrado</h1><p>Revisa el código o pide a tu contacto que te lo vuelva a enviar.</p><p><a href="/">Inicio</a></p></div>' }));
  const prods = await entityProducts(e);
  const goalTitle = s.goal_title || e.goal_title;
  const pj = JSON.stringify(prods.map(p => ({ id: p.id, name: p.name, price_cents: p.price_cents, sizes: p.sizes }))).replace(/</g, '\\u003c');
  res.send(page({
    title: `Ayuda a ${s.name} · ${e.name}`, desc: `Tu compra va al objetivo de ${s.name}: ${goalTitle}`, bare: true, theme: theme(e), nav: 'none',
    body: `${storeHead(e, `<button type="button" id="open-cart" class="btn cart-btn"><span>Cesta (<span id="cart-count">0</span>)</span></button>`)}
    <main class="wrap store-main" id="seller-root" data-code="${esc(s.code)}">
     <section class="for" aria-labelledby="who">
      ${s.photo ? `<img class="ph" src="/media/seller/${esc(s.code)}/photo" alt="Foto de ${esc(s.name)}">` : ''}
      <div style="${s.photo ? '' : 'grid-column:1/-1'}"><div class="kicker">Esto es para</div><div class="who" id="who">${esc(s.name)}</div>
       <div style="font-size:18px;margin:4px 0 0">${esc(goalTitle)}</div>
       </div>
      ${s.thanks ? `<div class="quote">«${esc(s.thanks)}» <span class="note">— ${esc(s.name)}</span></div>` : ''}
     </section>
     <p class="note" style="margin-bottom:16px">Todo lo que compres aquí va al objetivo de ${esc(s.name)}. Pagas con tarjeta y recibes el pedido en tu domicilio.</p>
     <h2>Elige tus artículos</h2>
     <div class="grid g4">${prods.map(p => `<div class="prod"><div class="pic">${svg(p.shape, e.color, '', logoUrl(e))}</div><div class="nm">${esc(p.name)}</div>
       <div class="pr">${eur(p.price_cents)} <span class="note" style="font-weight:400">· ${eur(p.commission_cents)} para ${esc(s.name.split(' ')[0])}</span></div>
       ${p.sizes ? `<label class="f" style="margin:0"><span class="note">Talla</span><select class="in">${SIZES.map(z => `<option>${z}</option>`).join('')}</select></label>` : ''}
       <button type="button" class="btn" data-add="${esc(p.id)}">Añadir</button></div>`).join('')}</div>
     <p style="margin-top:22px"><a class="btn ghost" href="/c/${esc(s.code)}/catalogo.pdf">Descargar catálogo en PDF</a></p>
    </main>
    <div class="scrim" id="scrim" hidden></div>
    <aside class="cart" id="cart" hidden aria-label="Cesta"><header><b>Tu cesta</b><button type="button" class="btn ghost sm" id="close-cart">Cerrar</button></header>
     <div class="body"><div id="cart-lines"></div>
      <form id="checkout" style="margin-top:16px"><h3>Datos de entrega</h3>
       <label class="f">Nombre y apellidos<input class="in" name="name" required maxlength="100" autocomplete="name"></label>
       <label class="f">Correo electrónico<input class="in" type="email" name="email" required maxlength="120" autocomplete="email"></label>
       <label class="f">Teléfono<input class="in" name="phone" maxlength="30" inputmode="tel" autocomplete="tel"></label>
       <label class="f">Dirección<input class="in" name="address" required maxlength="150" autocomplete="street-address"></label>
       <div class="row"><label class="f">Localidad<input class="in" name="city" required maxlength="80" autocomplete="address-level2"></label>
       <label class="f">Código postal<input class="in" name="zip" required pattern="[0-9]{5}" inputmode="numeric" autocomplete="postal-code"></label></div>
       <h3 style="margin-top:6px">Un mensaje para ${esc(s.name.split(' ')[0])} <span class="note" style="font-weight:400">(opcional)</span></h3>
       <label class="f">Tu nombre en el mensaje<input class="in" name="sign" maxlength="60" placeholder="Tu tío Manuel"></label>
       <label class="f">Mensaje<textarea class="in" name="message" maxlength="300" placeholder="¡Disfruta mucho del viaje!"></textarea></label>
       <p class="note">Solo lo verán ${esc(s.name.split(' ')[0])}, su familia y la entidad.</p>
       <label class="check"><input type="checkbox" name="terms" value="1" required><span>Acepto el <a href="/aviso-legal" target="_blank">aviso legal</a> y la <a href="/privacidad" target="_blank">política de privacidad</a>. Entiendo que los artículos son personalizados.</span></label>
       <p class="note">Envíos a España. El pedido llegará a tu domicilio.</p>
       <div class="alert err" id="co-err" hidden role="alert"></div>
      </form></div>
     <footer><div class="line" style="border:0"><b>Total</b><b id="cart-total">0,00 €</b></div>
      <button class="btn" id="pay-btn" form="checkout" type="submit" style="width:100%" disabled>Pagar con tarjeta</button></footer></aside>
    <script type="application/json" id="prods">${pj}</script>${footer(e)}`,
    scripts: '<script src="/store.js"></script>',
  }));
});

router.get('/c/:code/catalogo.pdf', async (req, res) => {
  const { s, e } = await loadSeller(req.params.code);
  if (!s) return res.sendStatus(404);
  const prods = await entityProducts(e);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="catalogo-${s.code}.pdf"`);
  await pdf.catalogPdf({ entity: e, seller: s, products: prods }, res);
});
router.get('/qr/:code.png', async (req, res) => {
  const { s } = await loadSeller(req.params.code);
  if (!s) return res.sendStatus(404);
  res.type('png').set('Cache-Control', 'public, max-age=3600').send(await pdf.qrBuf(pdf.sellerUrl(s), 480));
});

// ---- Imágenes
function sendDataUrl(res, d) {
  if (!d) return res.sendStatus(404);
  const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(d);
  if (!m) return res.sendStatus(404);
  res.type(m[1]).set('Cache-Control', 'public, max-age=300').send(Buffer.from(m[2], 'base64'));
}
router.get('/media/entity/:id/:kind', async (req, res) => {
  if (!['logo', 'hero'].includes(req.params.kind)) return res.sendStatus(404);
  const e = await db.one(`SELECT ${req.params.kind} AS d FROM entities WHERE id=$1`, [Number(req.params.id) || 0]);
  sendDataUrl(res, e && e.d);
});
router.get('/media/seller/:code/photo', async (req, res) => {
  const s = await db.one('SELECT photo AS d FROM sellers WHERE code=$1 AND active AND consent', [normCode(req.params.code)]);
  sendDataUrl(res, s && s.d);
});

// ---- Crear pedido
router.post('/api/pedido', express.json({ limit: '50kb' }), async (req, res) => {
  try {
    if (!rateLimit('order:' + req.ip, 20, 3600_000)) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo más tarde.' });
    const b = req.body || {}, buyer = b.buyer || {};
    const { s, e } = await loadSeller(b.code);
    if (!s) return res.status(404).json({ error: 'Código no válido.' });
    const need = ['name', 'email', 'address', 'city', 'zip'];
    if (need.some(k => !String(buyer[k] || '').trim())) return res.status(400).json({ error: 'Rellena los datos de entrega.' });
    if (!validEmail(buyer.email)) return res.status(400).json({ error: 'El correo no es válido.' });
    if (!/^\d{5}$/.test(String(buyer.zip))) return res.status(400).json({ error: 'El código postal debe tener 5 cifras.' });
    if (!buyer.terms) return res.status(400).json({ error: 'Debes aceptar las condiciones.' });
    const prods = await entityProducts(e); const byId = Object.fromEntries(prods.map(p => [p.id, p]));
    const items = [];
    for (const l of (Array.isArray(b.items) ? b.items : []).slice(0, 30)) {
      const p = byId[l.id]; const qty = Math.floor(Number(l.qty));
      if (!p || !(qty >= 1 && qty <= 20)) return res.status(400).json({ error: 'La cesta contiene un artículo no válido.' });
      if (p.sizes && !SIZES.includes(l.size)) return res.status(400).json({ error: `Elige talla para ${p.name}.` });
      items.push({ id: p.id, name: p.name, size: p.sizes ? l.size : '', qty, price_cents: p.price_cents, commission_cents: p.commission_cents, cost_cents: p.cost_cents });
    }
    if (!items.length) return res.status(400).json({ error: 'La cesta está vacía.' });
    const sum = (f) => items.reduce((a, i) => a + i[f] * i.qty, 0); // siempre × cantidad
    const publicId = 'RS-' + token().slice(0, 8).toUpperCase();
    const o = await db.one(`INSERT INTO orders(public_id,entity_id,seller_id,buyer_name,buyer_email,buyer_phone,ship_address,ship_city,ship_zip,items,total_cents,seller_cents,cost_cents,buyer_sign,buyer_message)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [publicId, e.id, s.id, buyer.name.trim(), buyer.email.trim(), (buyer.phone || '').trim(), buyer.address.trim(), buyer.city.trim(), buyer.zip,
        JSON.stringify(items), sum('price_cents'), sum('commission_cents'), sum('cost_cents'),
        String(buyer.sign || '').trim().slice(0, 60) || null, String(buyer.message || '').trim().slice(0, 300) || null]);
    if (payments.getStripe()) {
      const url = await payments.createCheckout({ order: o, entity: e, seller: s, lines: items });
      return res.json({ url });
    }
    if (cfg.demo) return res.json({ url: `/demo-pago/${o.public_id}` });
    return res.status(503).json({ error: 'El pago con tarjeta no está disponible todavía.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'No se pudo crear el pedido.' }); }
});

// ---- Pago simulado (solo si no hay Stripe configurado y estamos en modo demostración)
router.get('/demo-pago/:id', async (req, res) => {
  if (!cfg.demo) return res.sendStatus(404);
  const o = await db.one('SELECT * FROM orders WHERE public_id=$1', [req.params.id]);
  if (!o) return res.sendStatus(404);
  res.send(page({ title: 'Pago de demostración', nav: 'none', body: `<div class="wrap narrow hero"><span class="chip warn">Modo demostración</span><h1>Pago simulado · ${eur(o.total_cents)}</h1>
   <p>No se cobra nada. Con Stripe configurado, aquí se mostraría su pasarela de pago.</p>
   <form method="post" action="/demo-pago/${esc(o.public_id)}"><button class="btn">Simular pago correcto</button></form></div>` }));
});
router.post('/demo-pago/:id', express.urlencoded({ extended: false }), async (req, res) => {
  if (!cfg.demo) return res.sendStatus(404);
  const o = await db.one('SELECT * FROM orders WHERE public_id=$1', [req.params.id]);
  if (!o) return res.sendStatus(404);
  await payments.markPaid(o.id, {});
  res.redirect(`/gracias/${o.public_id}`);
});

router.get('/gracias/:id', async (req, res) => {
  const o = await db.one(`SELECT o.*, s.name AS sname, s.code, e.name AS ename FROM orders o JOIN sellers s ON s.id=o.seller_id JOIN entities e ON e.id=o.entity_id WHERE o.public_id=$1`, [req.params.id]);
  if (!o) return res.sendStatus(404);
  const paid = o.status === 'paid';
  res.send(page({ title: 'Gracias por tu compra', nav: 'none', body: `<div class="wrap narrow hero">
   <span class="chip ${paid ? 'ok' : 'warn'}">${paid ? 'Pedido confirmado' : 'Pago pendiente de confirmar'}</span>
   <h1>${paid ? '¡Gracias por tu compra!' : 'Estamos confirmando tu pago'}</h1>
   <p class="lead">${paid ? `Has ayudado a <b>${esc(o.sname)}</b> (${esc(o.ename)}). Recibirás tu pedido en tu domicilio.` : 'Si ya has pagado, esta página se actualizará en unos segundos. Recarga para ver el estado.'}</p>
   <p class="note">Número de pedido: <b>${esc(o.public_id)}</b> · Total ${eur(o.total_cents)}</p>
   <div class="actions"><a class="btn" href="/c/${esc(o.code)}">Volver a la tienda de ${esc(o.sname.split(' ')[0])}</a></div></div>` }));
});

module.exports = router;
