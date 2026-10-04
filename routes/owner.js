const express = require('express');
const db = require('../lib/db');
const cfg = require('../lib/config');
const auth = require('../lib/auth');
const { page, alertBox } = require('../lib/html');
const { esc, eur, toCents, csvCell, rateLimit } = require('../lib/util');
const ledger = require('../lib/ledger');
const supplier = require('../lib/supplier');
const router = express.Router();
const form = express.urlencoded({ extended: false, limit: '100kb' });

const RANGES = { '7': 'Últimos 7 días', '30': 'Últimos 30 días', '90': 'Últimos 90 días', all: 'Todo' };
const shell = (cur, title, inner) => page({ title: `${title} · Propietario`, nav: 'owner', current: cur,
  body: `<div class="wrap" style="padding-top:26px"><h1 style="font-size:32px">${esc(title)}</h1>${inner}</div>` });
const flash = (req) => req.query.ok ? alertBox(String(req.query.ok), 'okk') : req.query.err ? alertBox(String(req.query.err)) : '';

const loginPage = (err = '') => page({ title: 'Acceso propietario', nav: 'none', noindex: true, body: `<div class="wrap narrow"><div class="hero" style="padding-bottom:10px"><h1>Acceso del propietario</h1></div>
 ${!cfg.ownerEmail || !cfg.ownerPassword ? alertBox('Falta configurar OWNER_EMAIL y OWNER_PASSWORD en el servidor.') : ''}${alertBox(err)}
 <form class="card" method="post" action="/propietario/entrar"><label class="f">Correo<input class="in" type="email" name="email" required autocomplete="username"></label>
 <label class="f">Contraseña<input class="in" type="password" name="password" required autocomplete="current-password"></label><button class="btn">Entrar</button></form></div>` });
router.get('/propietario/entrar', (req, res) => res.send(loginPage()));
router.post('/propietario/entrar', form, async (req, res) => {
  if (!rateLimit('owner:' + req.ip, 8, 600_000)) return res.status(429).send(loginPage('Demasiados intentos.'));
  if (!auth.ownerLogin(req.body.email || '', req.body.password || '')) return res.status(401).send(loginPage('Datos incorrectos.'));
  await auth.createSession(res, 'owner'); res.redirect('/propietario');
});
router.get('/propietario/salir', async (req, res) => { await auth.destroySession(req, res); res.redirect('/'); });
router.use('/propietario', (req, res, next) => (req.path === '/entrar' ? next() : auth.needOwner(req, res, next)));

async function paidOrders(range) {
  const where = range === 'all' ? '' : `AND o.paid_at >= NOW() - INTERVAL '${Number(range)} days'`;
  return db.all(`SELECT o.*, e.name AS ename, s.name AS sname FROM orders o JOIN entities e ON e.id=o.entity_id JOIN sellers s ON s.id=o.seller_id WHERE o.status='paid' ${where} ORDER BY o.paid_at`);
}
function agg(orders) {
  const a = { n: 0, total: 0, seller: 0, cost: 0, fee: 0, profit: 0 };
  for (const o of orders) {
    a.n++; a.total += o.total_cents; a.seller += o.seller_cents;
    const c = o.supplier_cost_cents ?? o.cost_cents, f = o.stripe_fee_cents ?? ledger.estFee(o.total_cents);
    a.cost += c; a.fee += f; a.profit += o.total_cents - o.seller_cents - c - f;
  }
  return a;
}
const rangeBar = (cur, base) => `<nav class="tabs" aria-label="Periodo">${Object.entries(RANGES).map(([k, l]) => `<a href="${base}?r=${k}"${k === cur ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
const tile = (v, l) => `<div class="card stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
const rng = (req) => (RANGES[req.query.r] ? req.query.r : '30');

// Gráfico semanal apilado (SVG) con gemelo en tabla
const SER = [['seller', 'Para los vendedores', 'var(--c1)'], ['cost', 'Producto y envío', 'var(--c2)'], ['fee', 'Comisión de tarjeta', 'var(--c3)'], ['profit', 'Beneficio de la plataforma', 'var(--c4)']];
function weekKey(d) { const x = new Date(d); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x.toISOString().slice(0, 10); }
function chart(orders) {
  const weeks = new Map();
  for (const o of orders) { const k = weekKey(o.paid_at); (weeks.get(k) || weeks.set(k, []).get(k)).push(o); }
  const keys = [...weeks.keys()].sort().slice(-26);
  if (!keys.length) return '<p class="note">Todavía no hay ventas en este periodo.</p>';
  const data = keys.map(k => ({ k, ...agg(weeks.get(k)) }));
  const max = Math.max(...data.map(d => d.total), 100), H = 220, W = 760, pl = 46, pb = 28, bw = Math.min(24, (W - pl) / data.length - 6);
  const step = (W - pl) / data.length, y = (v) => H - pb - (v / max) * (H - pb - 10);
  const ticks = [0, .25, .5, .75, 1].map(f => f * max);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas semanales desglosadas" style="width:100%;height:auto">`;
  ticks.forEach(t => { s += `<line x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(t / 100)}</text>`; });
  data.forEach((d, i) => {
    const x = pl + i * step + (step - bw) / 2; let acc = 0;
    const tip = `Semana del ${d.k}: ${eur(d.total)} · ` + SER.map(([f, l]) => `${l} ${eur(Math.max(0, d[f]))}`).join(' · ');
    s += `<g tabindex="0"><title>${esc(tip)}</title>`;
    SER.forEach(([f, , col], si) => { const v = Math.max(0, d[f]); if (!v) return; const y1 = y(acc + v), y0 = y(acc); acc += v;
      s += `<rect x="${x}" y="${y1 + 1}" width="${bw}" height="${Math.max(0, y0 - y1 - 2)}" fill="${col}" ${si === SER.length - 1 ? 'rx="4"' : ''}/>`; });
    s += `</g>`;
    if (data.length <= 14 || i % 2 === 0) s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${d.k.slice(8)}/${d.k.slice(5, 7)}</text>`;
  });
  s += '</svg>';
  const legend = SER.map(([, l, c]) => `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:13px"><i style="width:12px;height:12px;border-radius:3px;background:${c};display:inline-block"></i>${l}</span>`).join('');
  const table = `<details style="margin-top:10px"><summary class="note" style="cursor:pointer">Ver como tabla</summary><div class="tablewrap"><table class="t"><thead><tr><th>Semana</th><th class="n">Ventas</th>${SER.map(([, l]) => `<th class="n">${l}</th>`).join('')}</tr></thead><tbody>${data.map(d => `<tr><td>${d.k}</td><td class="n">${eur(d.total)}</td>${SER.map(([f]) => `<td class="n">${eur(d[f])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  return `<div style="margin-bottom:8px">${legend}</div>${s}${table}`;
}
const style = `<style>:root{--c1:#2a78d6;--c2:#eb6834;--c3:#1baf7a;--c4:#eda100;--grid:#e1e0d9}</style>`;

router.get('/propietario', async (req, res) => {
  const r = rng(req), orders = await paidOrders(r), a = agg(orders);
  const issues = await db.all("SELECT public_id, supplier_status, supplier_error, id FROM orders WHERE status='paid' AND supplier_status IN ('error','dry','none') ORDER BY paid_at DESC LIMIT 20");
  const stores = new Set(orders.map(o => o.entity_id)).size;
  res.send(shell('/propietario', 'Negocio', `${style}${flash(req)}${rangeBar(r, '/propietario')}
  <div class="grid g4">${tile(eur(a.total), 'Ventas')}${tile(eur(a.profit), 'Beneficio de la plataforma')}${tile(eur(a.seller), 'Para los objetivos de los vendedores')}${tile(a.n, `Pedidos · ${stores} tiendas`)}</div>
  <div class="card" style="margin-top:18px"><h2>Evolución semanal y reparto</h2>${chart(orders)}
   <p class="note">El beneficio descuenta el coste del proveedor (el real si el proveedor lo ha devuelto; si no, el estimado) y la comisión de tarjeta (real de Stripe si está disponible; si no, estimada ${cfg.feePct}% + ${eur(cfg.feeFixCents)}). No incluye impuestos (pendiente de asesor).</p></div>
  ${issues.length ? `<div class="card pending" style="margin-top:18px"><h2>Pedidos sin enviar al proveedor</h2><div class="tablewrap"><table class="t"><tbody>${issues.map(i => `<tr><td>${esc(i.public_id)}</td><td><span class="chip ${i.supplier_status === 'error' ? 'bad' : 'warn'}">${i.supplier_status === 'error' ? 'Error' : i.supplier_status === 'dry' ? 'Modo prueba' : 'Pendiente'}</span></td><td class="note">${esc(i.supplier_error || '')}</td>
    <td><form method="post" action="/propietario/reintentar/${i.id}"><button class="btn sm" ${!cfg.supplierToken ? 'disabled' : ''}>Reintentar</button></form></td></tr>`).join('')}</tbody></table></div></div>` : ''}
  <p style="margin-top:18px"><a class="btn ghost" href="/propietario/pedidos.csv?r=${r}">Descargar pedidos (CSV)</a></p>`));
});
router.post('/propietario/reintentar/:id', form, async (req, res) => {
  await db.query("UPDATE orders SET supplier_status='none' WHERE id=$1 AND status='paid' AND supplier_status<>'sent'", [Number(req.params.id) || 0]);
  await supplier.sendOrder(Number(req.params.id) || 0);
  res.redirect('/propietario?ok=' + encodeURIComponent('Reintento realizado.'));
});

router.get('/propietario/tiendas', async (req, res) => {
  const r = rng(req), orders = await paidOrders(r);
  const ents = await db.all("SELECT e.*, (SELECT COUNT(*)::int FROM sellers s WHERE s.entity_id=e.id) AS nsellers FROM entities e ORDER BY e.created_at DESC");
  const rows = [];
  for (const e of ents) { const a = agg(orders.filter(o => o.entity_id === e.id)); const b = await ledger.entityBalance(e.id); rows.push({ e, a, b }); }
  rows.sort((x, y) => y.a.total - x.a.total);
  res.send(shell('/propietario/tiendas', 'Tiendas', `${flash(req)}${rangeBar(r, '/propietario/tiendas')}<div class="card tablewrap"><table class="t"><thead><tr><th>Tienda</th><th class="n">Vendedores</th><th class="n">Pedidos</th><th class="n">Ventas</th><th class="n">Para vendedores</th><th class="n">Coste</th><th class="n">Tarjeta</th><th class="n">Beneficio</th><th class="n">Retirable ahora</th><th>Estado</th></tr></thead><tbody>
  ${rows.map(({ e, a, b }) => `<tr><td><a href="/t/${esc(e.slug)}" target="_blank">${esc(e.name)}</a><div class="note">${esc(e.email)}</div></td><td class="n">${e.nsellers}</td><td class="n">${a.n}</td><td class="n">${eur(a.total)}</td><td class="n">${eur(a.seller)}</td><td class="n">${eur(a.cost)}</td><td class="n">${eur(a.fee)}</td><td class="n"><b>${eur(a.profit)}</b></td><td class="n">${eur(b.available)}</td>
   <td><form method="post" action="/propietario/tiendas/${e.id}/${e.status === 'active' ? 'suspender' : 'activar'}"><button class="btn ghost sm">${e.status === 'active' ? 'Suspender' : 'Activar'}</button></form></td></tr>`).join('') || '<tr><td colspan="10" class="note">Aún no hay tiendas.</td></tr>'}
  <tr><td><b>Total</b></td><td class="n">${rows.reduce((x, y) => x + y.e.nsellers, 0)}</td><td class="n">${agg(orders).n}</td><td class="n"><b>${eur(agg(orders).total)}</b></td><td class="n">${eur(agg(orders).seller)}</td><td class="n">${eur(agg(orders).cost)}</td><td class="n">${eur(agg(orders).fee)}</td><td class="n"><b>${eur(agg(orders).profit)}</b></td><td class="n"></td><td></td></tr>
  </tbody></table></div>`));
});
for (const [what, st] of [['suspender', 'suspended'], ['activar', 'active']]) router.post(`/propietario/tiendas/:id/${what}`, form, async (req, res) => {
  await db.query('UPDATE entities SET status=$2 WHERE id=$1', [Number(req.params.id) || 0, st]); res.redirect('/propietario/tiendas');
});

router.get('/propietario/vendedores', async (req, res) => {
  const r = rng(req), orders = await paidOrders(r);
  const sellers = await db.all('SELECT s.id, s.name, s.code, s.group_name, e.name AS ename, e.id AS eid FROM sellers s JOIN entities e ON e.id=s.entity_id ORDER BY e.name, s.name');
  const by = new Map(); orders.forEach(o => (by.get(o.seller_id) || by.set(o.seller_id, []).get(o.seller_id)).push(o));
  const rows = sellers.map(s => ({ s, a: agg(by.get(s.id) || []) })).sort((x, y) => y.a.total - x.a.total);
  res.send(shell('/propietario/vendedores', 'Vendedores', `${rangeBar(r, '/propietario/vendedores')}<div class="card tablewrap"><table class="t"><thead><tr><th>Vendedor</th><th>Tienda</th><th class="n">Pedidos</th><th class="n">Ventas</th><th class="n">Para su objetivo</th><th class="n">Coste</th><th class="n">Tarjeta</th><th class="n">Beneficio</th></tr></thead><tbody>
  ${rows.map(({ s, a }) => `<tr><td>${esc(s.name)} <span class="note">${esc(s.code)}</span></td><td>${esc(s.ename)}</td><td class="n">${a.n}</td><td class="n">${eur(a.total)}</td><td class="n">${eur(a.seller)}</td><td class="n">${eur(a.cost)}</td><td class="n">${eur(a.fee)}</td><td class="n"><b>${eur(a.profit)}</b></td></tr>`).join('') || '<tr><td colspan="8" class="note">Sin datos.</td></tr>'}</tbody></table></div>`));
});

router.get('/propietario/retiradas', async (req, res) => {
  const ps = await db.all('SELECT p.*, e.name AS ename, e.legal_name, e.tax_id FROM payouts p JOIN entities e ON e.id=p.entity_id ORDER BY (p.status=\'requested\') DESC, p.requested_at DESC');
  res.send(shell('/propietario/retiradas', 'Retiradas', `${flash(req)}<p class="note">Solicitudes del administrador de cada entidad. Haz la transferencia desde tu banco y márcala como pagada.</p>
  <div class="card tablewrap"><table class="t"><thead><tr><th>Fecha</th><th>Entidad</th><th>Titular y NIF</th><th>IBAN</th><th class="n">Importe</th><th>Estado</th><th></th></tr></thead><tbody>
  ${ps.map(p => `<tr><td>${new Date(p.requested_at).toLocaleDateString('es-ES')}</td><td>${esc(p.ename)}</td><td>${esc(p.legal_name)} · ${esc(p.tax_id)}</td><td><code>${esc(p.iban)}</code></td><td class="n"><b>${eur(p.amount_cents)}</b></td><td><span class="chip ${p.status === 'paid' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn'}">${{ requested: 'Solicitada', paid: 'Pagada', rejected: 'Rechazada' }[p.status]}</span></td>
   <td>${p.status === 'requested' ? `<form method="post" action="/propietario/retiradas/${p.id}" style="display:flex;gap:6px;flex-wrap:wrap"><input class="in" name="note" placeholder="Nota (opcional)" style="min-height:36px;width:150px"><button class="btn sm" name="to" value="paid">Pagada</button><button class="btn ghost sm" name="to" value="rejected">Rechazar</button></form>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="note">No hay solicitudes.</td></tr>'}</tbody></table></div>`));
});
router.post('/propietario/retiradas/:id', form, async (req, res) => {
  const to = req.body.to === 'paid' ? 'paid' : 'rejected';
  await db.query("UPDATE payouts SET status=$2, note=$3, resolved_at=NOW() WHERE id=$1 AND status='requested'", [Number(req.params.id) || 0, to, String(req.body.note || '').slice(0, 200) || null]);
  res.redirect('/propietario/retiradas?ok=' + encodeURIComponent('Actualizado.'));
});

router.get('/propietario/catalogo', async (req, res) => {
  const ps = await db.all('SELECT * FROM products ORDER BY sort');
  res.send(shell('/propietario/catalogo', 'Catálogo y precios', `${flash(req)}<p class="note">El margen de plataforma es precio − comisión del vendedor − coste estimado. La referencia del proveedor es privada: nunca llega al navegador de clientes. Para artículos con tallas escribe un JSON como <code>{"S":4012,"M":4013}</code>; para los demás, un número.</p>
  ${ps.map(p => {
    const m = p.price_cents - p.commission_cents - p.cost_cents;
    return `<form method="post" action="/propietario/catalogo/${esc(p.id)}" class="card" style="margin-bottom:12px"><div class="row" style="align-items:end">
    <div><b>${esc(p.name)}</b> <span class="chip ${m > 0 ? 'ok' : 'bad'}">margen ${eur(m)}</span></div>
    <label class="f" style="margin:0">Precio €<input class="in" name="price" value="${p.price_cents / 100}"></label>
    <label class="f" style="margin:0">Comisión vendedor €<input class="in" name="com" value="${p.commission_cents / 100}"></label>
    <label class="f" style="margin:0">Coste estimado €<input class="in" name="cost" value="${p.cost_cents / 100}"></label>
    <label class="f" style="margin:0">Ref. proveedor<input class="in" name="ref" value="${esc(p.supplier_ref || '')}"></label>
    <label class="check" style="margin:0"><input type="checkbox" name="active" value="1" ${p.active ? 'checked' : ''}><span>Activo</span></label>
    <button class="btn sm">Guardar</button></div></form>`; }).join('')}`));
});
router.post('/propietario/catalogo/:id', form, async (req, res) => {
  const b = req.body, price = toCents(b.price), com = toCents(b.com);
  if (price <= 0 || com < 0 || com >= price) return res.redirect('/propietario/catalogo?err=' + encodeURIComponent('Precio o comisión no válidos.'));
  await db.query('UPDATE products SET price_cents=$2, commission_cents=$3, cost_cents=$4, supplier_ref=$5, active=$6 WHERE id=$1',
    [req.params.id, price, com, toCents(b.cost), String(b.ref || '').trim(), b.active === '1']);
  res.redirect('/propietario/catalogo?ok=' + encodeURIComponent('Guardado. Los pedidos ya hechos conservan su precio.'));
});

router.get('/propietario/pedidos.csv', async (req, res) => {
  const os = await paidOrders(rng(req));
  const head = ['Pedido', 'Fecha', 'Tienda', 'Vendedor', 'Ventas €', 'Vendedor €', 'Coste €', 'Tarjeta €', 'Beneficio €', 'Proveedor'];
  const n = (c) => (c / 100).toFixed(2).replace('.', ',');
  const lines = [head.join(';')].concat(os.map(o => { const c = o.supplier_cost_cents ?? o.cost_cents, f = o.stripe_fee_cents ?? ledger.estFee(o.total_cents);
    return [o.public_id, new Date(o.paid_at).toISOString().slice(0, 10), o.ename, o.sname, n(o.total_cents), n(o.seller_cents), n(c), n(f), n(o.total_cents - o.seller_cents - c - f), o.supplier_status].map(csvCell).join(';'); }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="pedidos.csv"');
  res.send('﻿' + lines.join('\r\n'));
});
module.exports = router;
