// Vista privada del vendedor y su familia: se entra con un enlace secreto (no con el código público).
const express = require('express');
const db = require('../lib/db');
const cfg = require('../lib/config');
const { page } = require('../lib/html');
const { esc, eur, rateLimit } = require('../lib/util');
const { inkFor } = require('../lib/art');
const router = express.Router();

router.get('/mi/:token', async (req, res) => {
  if (!rateLimit('mi:' + req.ip, 60, 600_000)) return res.status(429).send('Demasiados intentos');
  const s = await db.one('SELECT * FROM sellers WHERE private_token=$1 AND active', [String(req.params.token).slice(0, 40)]);
  if (!s) return res.status(404).send(page({ title: 'Enlace no válido', nav: 'none', noindex: true, body: '<div class="wrap narrow hero"><h1>Enlace no válido</h1><p>Pide a la entidad que te lo vuelva a enviar.</p></div>' }));
  const e = await db.one('SELECT * FROM entities WHERE id=$1', [s.entity_id]);
  const orders = await db.all("SELECT public_id, seller_cents, paid_at, items, buyer_sign, buyer_message FROM orders WHERE seller_id=$1 AND status='paid' ORDER BY paid_at DESC", [s.id]);
  const raised = orders.reduce((a, o) => a + o.seller_cents, 0);
  const goal = s.goal_cents || e.goal_cents, pct = Math.min(100, Math.round(raised / goal * 100));
  const units = orders.reduce((a, o) => a + o.items.reduce((x, i) => x + i.qty, 0), 0);
  const msgs = orders.filter(o => o.buyer_message);
  res.setHeader('Cache-Control', 'no-store');
  res.send(page({
    title: `Mi cuenta · ${s.name}`, nav: 'none', noindex: true, theme: { color: e.color, color2: e.color2, ink: inkFor(e.color) },
    body: `<header class="store-head"><div class="wrap">${e.logo ? `<img class="crest" src="/media/entity/${e.id}/logo" alt="">` : ''}<div><div class="nm">${esc(e.name)}</div><div class="sub">Cuenta privada de ${esc(s.name)}</div></div></div></header>
    <main class="wrap narrow" style="padding-top:26px">
     <div class="card"><div class="note">${esc(s.goal_title || e.goal_title)}</div>
      <div style="font-size:40px;font-weight:850;line-height:1.1;margin:6px 0">${eur(raised)}</div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <p class="note" style="margin-top:8px">${pct}% del objetivo de ${eur(goal)} · ${orders.length} pedidos · ${units} artículos</p></div>
     <h2 style="margin-top:26px">Mensajes para ${esc(s.name.split(' ')[0])}</h2>
     ${msgs.map(m => `<div class="card flat" style="margin-bottom:10px"><p style="margin:0 0 4px;font-size:18px">«${esc(m.buyer_message)}»</p><p class="note" style="margin:0">— ${esc(m.buyer_sign || 'Anónimo')} · ${new Date(m.paid_at).toLocaleDateString('es-ES')}</p></div>`).join('') || '<p class="note">Todavía no hay mensajes. ¡Compartid el QR!</p>'}
     <div class="card flat" style="margin-top:22px"><p class="note" style="margin:0">Esta página es privada: solo la ve quien tenga este enlace. El dinero lo gestiona el administrador de ${esc(e.name)}. Para compartir con quien quiera comprar, usad el código <b>${esc(s.code)}</b> o el QR.</p></div>
    </main>`,
  }));
});
module.exports = router;
