const express = require('express');
const path = require('path');
const db = require('./lib/db');
const cfg = require('./lib/config');
const auth = require('./lib/auth');
const catalog = require('./lib/catalog');
const payments = require('./lib/payments');

async function build() {
  await db.init();
  for (const p of catalog) {
    await db.query(`INSERT INTO products(id,name,shape,sizes,price_cents,commission_cents,cost_cents,supplier_ref,sort)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.shape, p.sizes, Math.round(p.price * 100), Math.round(p.com * 100), Math.round(p.cost * 100), p.ref, p.sort]);
  }
  for (const s of await db.all('SELECT id FROM sellers WHERE private_token IS NULL')) await db.query('UPDATE sellers SET private_token=$2 WHERE id=$1', [s.id, require('./lib/util').token().slice(0, 24)]);
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (cfg.prod) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(require('./lib/candado').candado);
  // Webhook de Stripe: necesita el cuerpo sin procesar
  app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = payments.getStripe();
    if (!stripe || !cfg.stripeWebhookSecret) return res.sendStatus(503);
    let ev;
    try { ev = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], cfg.stripeWebhookSecret); }
    catch (e) { return res.status(400).send('Firma no válida'); }
    try {
      if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
        const s = ev.data.object;
        if (s.payment_status === 'paid') {
          const o = await db.one('SELECT id, total_cents FROM orders WHERE public_id=$1 AND stripe_session=$2', [s.metadata && s.metadata.public_id, s.id]);
          if (o && s.amount_total === o.total_cents) await payments.markPaid(o.id, { paymentIntent: s.payment_intent });
          else console.error('Pago no coincide con el pedido', s.id);
        }
      } else if (ev.type === 'charge.refunded') {
        const pi = ev.data.object.payment_intent;
        if (pi) await db.query("UPDATE orders SET status='refunded' WHERE stripe_payment_intent=$1", [pi]);
      }
      res.json({ received: true });
    } catch (e) { console.error('webhook', e); res.sendStatus(500); }
  });
  app.use(auth.sameOrigin);
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
  app.use(require('./routes/public'));
  app.use(require('./routes/store'));
  app.use(require('./routes/panel'));
  app.use(require('./routes/owner'));
  app.use(require('./routes/mine'));
  app.get('/favicon.ico', (req, res) => res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#2748E8"/><circle cx="16" cy="16" r="7" fill="#FFC53D"/></svg>'));
  app.get('/salud', (req, res) => res.json({ ok: true }));
  app.use((req, res) => res.status(404).send(require('./lib/html').page({ title: 'No encontrada', body: '<div class="wrap narrow hero"><h1>Página no encontrada</h1><p><a href="/">Volver al inicio</a></p></div>' })));
  app.use((err, req, res, next) => { console.error(err); res.status(500).send('Ha ocurrido un error. Inténtalo de nuevo.'); });
  return app;
}
module.exports = { build };
if (require.main === module) {
  build().then(app => app.listen(cfg.port, () => {
    console.log(`${cfg.brand} escuchando en ${cfg.baseUrl} (base de datos: ${db.kind()})`);
    if (cfg.demo) console.log('MODO DEMOSTRACIÓN: pago simulado (sin STRIPE_SECRET_KEY).');
    if (cfg.prod && !cfg.ownerPassword) console.warn('AVISO: falta OWNER_PASSWORD; el panel de propietario no será accesible.');
  })).catch(e => { console.error(e); process.exit(1); });
}
