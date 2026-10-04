const express = require('express');
const db = require('../lib/db');
const cfg = require('../lib/config');
const auth = require('../lib/auth');
const { page, alertBox } = require('../lib/html');
const { esc, eur, toCents, codeFor, hashPassword, checkPassword, validEmail, validIban, isHex, isImg, parseCsv, csvCell, rateLimit, token } = require('../lib/util');
const ledger = require('../lib/ledger');
const pdf = require('../lib/pdf');
const TYPES = require('../lib/types');
const router = express.Router();
const form = express.urlencoded({ extended: false, limit: '3mb' });

const tabs = (cur) => `<nav class="tabs" aria-label="Secciones">${[['/panel', 'Resumen'], ['/panel/vendedores', 'Vendedores'], ['/panel/tienda', 'Mi tienda'], ['/panel/dinero', 'Dinero'], ['/panel/datos', 'Datos']]
  .map(([h, l]) => `<a href="${h}"${h === cur ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
const shell = (e, cur, title, inner, extra = {}) => page({ title: `${title} · ${e.name}`, nav: 'panel', current: cur, scripts: '<script src="/panel.js"></script>',
  body: `<div class="wrap" style="padding-top:26px"><p class="note" style="margin:0">Panel del administrador · ${esc(e.name)}</p><h1 style="font-size:32px">${esc(title)}</h1>${tabs(cur)}${inner}</div>`, ...extra });
const flash = (req) => req.query.ok ? alertBox(String(req.query.ok), 'okk') : req.query.err ? alertBox(String(req.query.err)) : '';
const bool = (v) => v === '1' || v === 'on' || v === 'si' || v === 'sí' || v === 'true';

// ---------- acceso
const loginPage = (err = '') => page({ title: `Acceso entidades · ${cfg.brand}`, current: '/panel', body: `<div class="wrap narrow"><div class="hero" style="padding-bottom:10px"><h1>Acceso para entidades</h1></div>
  ${alertBox(err)}<form class="card" method="post" action="/panel/entrar"><label class="f">Correo electrónico<input class="in" type="email" name="email" required autocomplete="username"></label>
  <label class="f">Contraseña<input class="in" type="password" name="password" required autocomplete="current-password"></label>
  <button class="btn" type="submit">Entrar</button> <a class="btn ghost" href="/alta">Dar de alta mi entidad</a></form>
  <p class="note" style="margin-top:12px">¿Has olvidado la contraseña? Escríbenos a <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a> desde el correo del administrador.</p></div>` });
router.get('/panel/entrar', (req, res) => res.send(loginPage()));
router.post('/panel/entrar', form, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!rateLimit('login:' + req.ip, 10, 600_000) || !rateLimit('loginm:' + email, 8, 600_000)) return res.status(429).send(loginPage('Demasiados intentos. Espera unos minutos.'));
  const e = await db.one('SELECT * FROM entities WHERE email=$1', [email]);
  if (!e || !checkPassword(String(req.body.password || ''), e.password_hash)) return res.status(401).send(loginPage('Correo o contraseña incorrectos.'));
  await auth.createSession(res, 'entity', e.id);
  res.redirect('/panel');
});
router.get('/panel/salir', async (req, res) => { await auth.destroySession(req, res); res.redirect('/'); });

router.get('/panel', async (req, res, next) => {
  const s = await auth.load(req);
  if (!s || s.role !== 'entity') return res.send(loginPage());
  next();
}, auth.needEntity, async (req, res) => {
  const e = req.entity, T = TYPES[e.type] || TYPES.otra;
  const sellers = await ledger.sellerTotals(e.id), bal = await ledger.entityBalance(e.id);
  const orders = (await db.one("SELECT COUNT(*)::int AS n FROM orders WHERE entity_id=$1 AND status='paid'", [e.id])).n;
  const ready = sellers.filter(s => s.consent && s.active).length;
  res.send(shell(e, '/panel', 'Resumen', `${flash(req)}
  <div class="grid g4"><div class="card stat"><div class="v">${eur(bal.total)}</div><div class="l">Recaudado en total</div></div>
   <div class="card stat"><div class="v">${eur(bal.available)}</div><div class="l">Disponible para retirar</div></div>
   <div class="card stat"><div class="v">${orders}</div><div class="l">Pedidos pagados</div></div>
   <div class="card stat"><div class="v">${ready}/${sellers.length}</div><div class="l">${esc(T.ms)} con tienda activa</div></div></div>
  <div class="card" style="margin-top:18px"><h2>Enlace de tu tienda</h2><p>Comparte este enlace o, mejor, entrega a cada ${esc(T.m)} su QR personal desde la sección Vendedores.</p>
   <p><code>${esc(cfg.baseUrl)}/t/${esc(e.slug)}</code> <button class="btn ghost sm" data-copy="${esc(cfg.baseUrl)}/t/${esc(e.slug)}">Copiar</button> <a class="btn ghost sm" href="/t/${esc(e.slug)}" target="_blank">Ver tienda</a></p></div>
  <div class="card" style="margin-top:18px"><h2>Cuentas de los vendedores</h2><p class="note">Solo tú ves esta lista. Cada vendedor y su familia ven únicamente lo suyo.</p>
   <div class="tablewrap"><table class="t"><thead><tr><th>Nombre</th><th>Grupo</th><th>Código</th><th class="n">Pedidos</th><th class="n">Recaudado</th><th class="n">Objetivo</th></tr></thead><tbody>
   ${sellers.map(s => `<tr><td><a href="/panel/vendedores/${s.id}">${esc(s.name)}</a></td><td>${esc(s.group_name || '')}</td><td><code>${esc(s.code)}</code></td><td class="n">${s.orders}</td><td class="n">${eur(s.raised_cents)}</td><td class="n">${eur(s.goal_cents || e.goal_cents)}</td></tr>`).join('') || '<tr><td colspan="6" class="note">Aún no hay vendedores. Añádelos en la sección Vendedores.</td></tr>'}
   </tbody></table></div></div>`));
});

// ---------- vendedores
function sellerForm(e, s = {}, action) {
  const T = TYPES[e.type] || TYPES.otra;
  return `<form method="post" action="${action}" class="card" style="margin-bottom:18px">
   <div class="row"><label class="f">Nombre y apellidos *<input class="in" name="name" value="${esc(s.name || '')}" required maxlength="100"></label>
   <label class="f">Curso, grupo o equipo<input class="in" name="group_name" value="${esc(s.group_name || '')}" maxlength="60"></label></div>
   <label class="check"><input type="checkbox" name="minor" value="1" ${s.minor ? 'checked' : ''}><span>Es menor de edad (se necesitan los datos y el consentimiento de su madre, padre o tutor)</span></label>
   <div class="row"><label class="f">Tutor: nombre<input class="in" name="tutor_name" value="${esc(s.tutor_name || '')}" maxlength="100"></label>
   <label class="f">Tutor: correo<input class="in" type="email" name="tutor_email" value="${esc(s.tutor_email || '')}" maxlength="120"></label>
   <label class="f">Tutor: teléfono<input class="in" name="tutor_phone" value="${esc(s.tutor_phone || '')}" maxlength="30"></label></div>
   <label class="check"><input type="checkbox" name="consent" value="1" ${s.consent ? 'checked' : ''}><span>Confirmo que dispongo del consentimiento para tratar estos datos (del propio vendedor si es mayor, o de su tutor si es menor). Sin esto, su tienda no se activa.</span></label>
   <details ${s.id ? 'open' : ''}><summary class="note" style="cursor:pointer;margin:8px 0">Objetivo propio, mensaje de agradecimiento y foto (opcional)</summary>
   <div class="row"><label class="f">Objetivo propio<small>Vacío = el de la entidad</small><input class="in" name="goal_title" value="${esc(s.goal_title || '')}" maxlength="100"></label>
   <label class="f">Importe (€)<input class="in" name="goal" value="${s.goal_cents ? s.goal_cents / 100 : ''}" inputmode="decimal"></label></div>
   <label class="f">Mensaje de agradecimiento (lo verá quien compre)<textarea class="in" name="thanks" maxlength="300">${esc(s.thanks || '')}</textarea></label>
   <label class="f">Foto (opcional)<input class="in" type="file" accept="image/*" data-target="photo" data-max="480" data-type="jpeg"></label>
   <input type="hidden" name="photo" id="photo" value=""><img id="photo-pv" alt="" hidden width="80" height="80" style="border-radius:50%;object-fit:cover">
   ${s.photo ? `<p class="note">Ya tiene foto. <button type="button" class="btn ghost sm" data-clear="photo">Quitarla</button></p>` : ''}</details>
   <button class="btn" type="submit">${s.id ? 'Guardar cambios' : `Añadir ${esc(T.m)}`}</button></form>`;
}
async function newCode(name) { for (let i = 0; i < 30; i++) { const c = codeFor(name); if (!(await db.one('SELECT 1 FROM sellers WHERE code=$1', [c]))) return c; } throw new Error('code'); }
const sellerFields = (b) => ({
  name: String(b.name || '').trim().slice(0, 100), group: String(b.group_name || '').trim().slice(0, 60), minor: bool(b.minor),
  tutor_name: String(b.tutor_name || '').trim(), tutor_email: String(b.tutor_email || '').trim(), tutor_phone: String(b.tutor_phone || '').trim(),
  consent: bool(b.consent), goal_title: String(b.goal_title || '').trim().slice(0, 100) || null, goal: b.goal ? toCents(b.goal) || null : null,
  thanks: String(b.thanks || '').trim().slice(0, 300) || null,
});
const sellerErr = (f) => !f.name ? 'Falta el nombre.' : (f.minor && (!f.tutor_name || !(f.tutor_email || f.tutor_phone))) ? `Faltan los datos del tutor de ${f.name}.` : null;

router.get('/panel/vendedores', auth.needEntity, async (req, res) => {
  const e = req.entity, T = TYPES[e.type] || TYPES.otra;
  const sellers = await ledger.sellerTotals(e.id);
  res.send(shell(e, '/panel/vendedores', 'Vendedores', `${flash(req)}
  <div class="actions" style="margin:0 0 18px"><a class="btn" href="/panel/tarjetas.pdf" target="_blank">Descargar QR de todos (PDF)</a><a class="btn ghost" href="/panel/vendedores.csv">Descargar lista (CSV)</a></div>
  <div class="card" style="margin-bottom:18px"><h2>Registro de ${esc(T.ms)}</h2><p class="note">Cada uno recibe un código y un QR personales. Aparecen aquí con su estado de consentimiento.</p>
   <div class="tablewrap"><table class="t"><thead><tr><th>Nombre</th><th>Grupo</th><th>Código</th><th>QR</th><th>Estado</th><th></th></tr></thead><tbody>
   ${sellers.map(s => `<tr><td>${esc(s.name)}${s.minor ? ' <span class="chip">menor</span>' : ''}</td><td>${esc(s.group_name || '')}</td><td><code>${esc(s.code)}</code></td>
    <td><img src="/qr/${esc(s.code)}.png" alt="QR de ${esc(s.name)}" width="54" height="54" loading="lazy"></td>
    <td>${s.consent ? '<span class="chip ok">Activo</span>' : '<span class="chip warn">Falta consentimiento</span>'}</td>
    <td><a class="btn ghost sm" href="/panel/vendedores/${s.id}">Abrir</a></td></tr>`).join('') || '<tr><td colspan="6" class="note">Aún no hay vendedores.</td></tr>'}
   </tbody></table></div></div>
  <h2>Añadir uno</h2>${sellerForm(e, {}, '/panel/vendedores')}
  <h2>Añadir varios a la vez</h2><form method="post" action="/panel/vendedores/importar" class="card"><p class="note">Pega una línea por persona, con columnas separadas por punto y coma o coma:<br><code>nombre; grupo; menor (sí/no); tutor; correo del tutor; teléfono del tutor; consentimiento (sí/no)</code></p>
   <label class="f">Lista<textarea class="in" name="csv" rows="7" placeholder="Lucía Martín; 6ºA; sí; Ana Gómez; ana@correo.es; 600111222; sí"></textarea></label>
   <button class="btn" type="submit">Importar lista</button></form>`));
});
router.post('/panel/vendedores', auth.needEntity, form, async (req, res) => {
  const f = sellerFields(req.body), err = sellerErr(f);
  if (err) return res.redirect('/panel/vendedores?err=' + encodeURIComponent(err));
  const photo = isImg(req.body.photo) ? req.body.photo : null;
  await db.query(`INSERT INTO sellers(entity_id,name,code,group_name,minor,tutor_name,tutor_email,tutor_phone,consent,goal_title,goal_cents,thanks,photo,private_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [req.entity.id, f.name, await newCode(f.name), f.group, f.minor, f.tutor_name, f.tutor_email, f.tutor_phone, f.consent, f.goal_title, f.goal, f.thanks, photo, token().slice(0, 24)]);
  res.redirect('/panel/vendedores?ok=' + encodeURIComponent(`${f.name} añadido.`));
});
router.post('/panel/vendedores/importar', auth.needEntity, form, async (req, res) => {
  const rows = parseCsv(String(req.body.csv || '')).slice(0, 500); let ok = 0; const bad = [];
  for (const r of rows) {
    const f = sellerFields({ name: r[0], group_name: r[1], minor: bool((r[2] || '').trim().toLowerCase()) ? '1' : '', tutor_name: r[3], tutor_email: r[4], tutor_phone: r[5], consent: bool((r[6] || '').trim().toLowerCase()) ? '1' : '' });
    const err = sellerErr(f); if (err) { bad.push(err); continue; }
    await db.query(`INSERT INTO sellers(entity_id,name,code,group_name,minor,tutor_name,tutor_email,tutor_phone,consent,private_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [req.entity.id, f.name, await newCode(f.name), f.group, f.minor, f.tutor_name, f.tutor_email, f.tutor_phone, f.consent, token().slice(0, 24)]); ok++;
  }
  const msg = `${ok} añadidos.` + (bad.length ? ` Con problemas: ${bad.slice(0, 3).join(' ')}` : '');
  res.redirect(`/panel/vendedores?${bad.length ? 'err' : 'ok'}=` + encodeURIComponent(msg));
});
router.get('/panel/vendedores/:id', auth.needEntity, async (req, res) => {
  const e = req.entity;
  const s = await db.one('SELECT * FROM sellers WHERE id=$1 AND entity_id=$2', [Number(req.params.id) || 0, e.id]);
  if (!s) return res.redirect('/panel/vendedores');
  const t = (await ledger.sellerTotals(e.id)).find(x => x.id === s.id);
  const orders = await db.all("SELECT public_id, total_cents, seller_cents, paid_at, items FROM orders WHERE seller_id=$1 AND status='paid' ORDER BY paid_at DESC LIMIT 100", [s.id]);
  const url = `${cfg.baseUrl}/c/${s.code}`, priv = `${cfg.baseUrl}/mi/${s.private_token}`;
  const msgs = await db.all("SELECT buyer_sign, buyer_message, paid_at FROM orders WHERE seller_id=$1 AND status='paid' AND buyer_message IS NOT NULL ORDER BY paid_at DESC", [s.id]);
  res.send(shell(e, '/panel/vendedores', s.name, `${flash(req)}
  <div class="grid g2"><div class="card"><h2>Su tienda</h2><div class="qrbox"><img src="/qr/${esc(s.code)}.png" alt="QR de ${esc(s.name)}"></div>
   <p>Código: <b><code>${esc(s.code)}</code></b></p><p class="note">${esc(url)}</p>
   <p class="actions" style="margin:0"><a class="btn sm" href="/c/${esc(s.code)}/catalogo.pdf" target="_blank">Catálogo PDF</a><a class="btn ghost sm" href="/c/${esc(s.code)}" target="_blank">Ver su página</a><button class="btn ghost sm" data-copy="${esc(url)}">Copiar enlace</button></p></div>
   <div class="card"><h2>Cuenta</h2><div class="v" style="font-size:32px;font-weight:800">${eur(t.raised_cents)}</div><div class="note">recaudados de ${eur(s.goal_cents || e.goal_cents)} · ${t.orders} pedidos</div>
   <p class="note" style="margin-top:12px">Enlace privado para ${esc(s.name.split(' ')[0])} y su familia (muestra lo recaudado y los mensajes; no lo compartas con compradores):</p>
   <p class="note"><code style="word-break:break-all">${esc(priv)}</code></p><button class="btn ghost sm" data-copy="${esc(priv)}">Copiar enlace privado</button></div></div>
  <h2 style="margin-top:22px">Mensajes recibidos</h2><div class="card">${msgs.map(m => `<p><b>${esc(m.buyer_sign || 'Anónimo')}</b> <span class="note">· ${new Date(m.paid_at).toLocaleDateString('es-ES')}</span><br>${esc(m.buyer_message)}</p>`).join('') || '<p class="note">Todavía no hay mensajes.</p>'}</div>
  <h2 style="margin-top:22px">Datos</h2>${sellerForm(e, s, `/panel/vendedores/${s.id}`)}
  <form method="post" action="/panel/vendedores/${s.id}/${s.active ? 'baja' : 'alta'}" onsubmit="return confirm('¿Seguro?')"><button class="btn ghost" type="submit">${s.active ? 'Dar de baja (la tienda deja de estar disponible)' : 'Reactivar'}</button></form>
  <h2 style="margin-top:22px">Compras a su favor</h2><div class="tablewrap card"><table class="t"><thead><tr><th>Pedido</th><th>Fecha</th><th>Artículos</th><th class="n">Total</th><th class="n">Para su objetivo</th></tr></thead><tbody>
   ${orders.map(o => `<tr><td>${esc(o.public_id)}</td><td>${new Date(o.paid_at).toLocaleDateString('es-ES')}</td><td>${o.items.map(i => `${i.qty}× ${esc(i.name)}`).join(', ')}</td><td class="n">${eur(o.total_cents)}</td><td class="n">${eur(o.seller_cents)}</td></tr>`).join('') || '<tr><td colspan="5" class="note">Todavía no hay compras.</td></tr>'}</tbody></table></div>`));
});
router.post('/panel/vendedores/:id', auth.needEntity, form, async (req, res) => {
  const s = await db.one('SELECT * FROM sellers WHERE id=$1 AND entity_id=$2', [Number(req.params.id) || 0, req.entity.id]);
  if (!s) return res.redirect('/panel/vendedores');
  const f = sellerFields(req.body), err = sellerErr(f);
  if (err) return res.redirect(`/panel/vendedores/${s.id}?err=` + encodeURIComponent(err));
  let photo = s.photo; if (req.body.photo === '__clear__') photo = null; else if (isImg(req.body.photo)) photo = req.body.photo;
  await db.query(`UPDATE sellers SET name=$2,group_name=$3,minor=$4,tutor_name=$5,tutor_email=$6,tutor_phone=$7,consent=$8,goal_title=$9,goal_cents=$10,thanks=$11,photo=$12 WHERE id=$1`,
    [s.id, f.name, f.group, f.minor, f.tutor_name, f.tutor_email, f.tutor_phone, f.consent, f.goal_title, f.goal, f.thanks, photo]);
  res.redirect(`/panel/vendedores/${s.id}?ok=` + encodeURIComponent('Cambios guardados.'));
});
for (const what of ['baja', 'alta']) router.post(`/panel/vendedores/:id/${what}`, auth.needEntity, async (req, res) => {
  await db.query('UPDATE sellers SET active=$3 WHERE id=$1 AND entity_id=$2', [Number(req.params.id) || 0, req.entity.id, what === 'alta']);
  res.redirect('/panel/vendedores');
});
router.get('/panel/tarjetas.pdf', auth.needEntity, async (req, res) => {
  const sellers = await db.all('SELECT * FROM sellers WHERE entity_id=$1 AND active AND consent ORDER BY name', [req.entity.id]);
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'inline; filename="tarjetas-qr.pdf"');
  await pdf.cardsPdf({ entity: req.entity, sellers }, res);
});
router.get('/panel/vendedores.csv', auth.needEntity, async (req, res) => {
  const rows = await ledger.sellerTotals(req.entity.id);
  const lines = [['Nombre', 'Grupo', 'Menor', 'Tutor', 'Correo tutor', 'Teléfono tutor', 'Consentimiento', 'Código', 'Enlace público', 'Enlace privado (familia)', 'Recaudado €'].join(';')]
    .concat(rows.map(s => [s.name, s.group_name, s.minor ? 'sí' : 'no', s.tutor_name, s.tutor_email, s.tutor_phone, s.consent ? 'sí' : 'no', s.code, `${cfg.baseUrl}/c/${s.code}`, `${cfg.baseUrl}/mi/${s.private_token}`, (s.raised_cents / 100).toFixed(2).replace('.', ',')].map(csvCell).join(';')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="vendedores.csv"');
  res.send('﻿' + lines.join('\r\n'));
});

// ---------- tienda
router.get('/panel/tienda', auth.needEntity, async (req, res) => {
  const e = req.entity; const prods = await db.all('SELECT * FROM products WHERE active ORDER BY sort'); const sel = e.product_ids.split(',');
  res.send(shell(e, '/panel/tienda', 'Mi tienda', `${req.query.nuevo ? alertBox('¡Entidad creada! Personaliza tu tienda y después da de alta a tus vendedores.', 'okk') : ''}${flash(req)}
  <form method="post" action="/panel/tienda" class="card">
   <h2>Marca</h2><div class="row"><label class="f">Nombre público<input class="in" name="name" value="${esc(e.name)}" required maxlength="80"></label>
   <label class="f">Tipo<select class="in" name="type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${e.type === k ? ' selected' : ''}>${t.label}</option>`).join('')}</select></label></div>
   <div class="row"><label class="f">Nombre del objetivo<input class="in" name="goal_title" value="${esc(e.goal_title)}" required maxlength="100"></label>
   <label class="f">Objetivo por vendedor (€)<input class="in" name="goal" value="${e.goal_cents / 100}" inputmode="decimal"></label></div>
   <div class="row"><label class="f">Color principal<input class="in" type="color" id="color" name="color" value="${esc(e.color)}" style="padding:4px"></label>
   <label class="f">Color de acento<input class="in" type="color" id="color2" name="color2" value="${esc(e.color2)}" style="padding:4px"></label></div>
   <div id="brand-pv" style="border-radius:12px;padding:14px 16px;display:flex;gap:10px;align-items:center;margin-bottom:16px"><b style="width:22px;height:22px;border-radius:50%;display:inline-block"></b><span>Así se verá la cabecera de ${esc(e.name)}</span></div>
   <div class="row"><div><label class="f">Logo o escudo<small>PNG o JPG, se ajusta solo</small><input class="in" type="file" accept="image/*" data-target="logo" data-max="512"></label>
   <input type="hidden" name="logo" id="logo" value=""><img id="logo-pv" ${e.logo ? `src="/media/entity/${e.id}/logo"` : 'hidden'} alt="Logo actual" height="70" style="max-height:70px;background:#f3f4f8;border-radius:8px;padding:4px"> ${e.logo ? '<button type="button" class="btn ghost sm" data-clear="logo">Quitar</button>' : ''}</div>
   <div><label class="f">Imagen de cabecera (opcional)<small>Foto del centro, del equipo…</small><input class="in" type="file" accept="image/*" data-target="hero" data-max="1400" data-type="jpeg"></label>
   <input type="hidden" name="hero" id="hero" value=""><img id="hero-pv" ${e.hero ? `src="/media/entity/${e.id}/hero"` : 'hidden'} alt="Imagen actual" height="70" style="max-height:70px;border-radius:8px"> ${e.hero ? '<button type="button" class="btn ghost sm" data-clear="hero">Quitar</button>' : ''}</div></div>
   <h2 style="margin-top:22px">Artículos que vendes</h2><p class="note">Elige del muestrario. Solo estos aparecerán en tu tienda y en los catálogos PDF.</p>
   <div class="grid g3">${prods.map(p => `<label class="card flat check" style="margin:0;align-items:center"><input type="checkbox" name="prod" value="${esc(p.id)}" ${sel.includes(p.id) ? 'checked' : ''}><span><b>${esc(p.name)}</b><br><span class="note">${eur(p.price_cents)} · ${eur(p.commission_cents)} van al objetivo del vendedor</span></span></label>`).join('')}</div>
   <div class="actions"><button class="btn" type="submit">Guardar tienda</button><a class="btn ghost" href="/t/${esc(e.slug)}" target="_blank">Ver mi tienda</a></div></form>`));
});
router.post('/panel/tienda', auth.needEntity, form, async (req, res) => {
  const e = req.entity, b = req.body;
  const prods = (await db.all('SELECT id FROM products WHERE active')).map(p => p.id);
  let chosen = [].concat(b.prod || []).filter(id => prods.includes(id));
  if (!chosen.length) return res.redirect('/panel/tienda?err=' + encodeURIComponent('Elige al menos un artículo.'));
  const pick = (cur, nv) => nv === '__clear__' ? null : isImg(nv) ? nv : cur;
  await db.query(`UPDATE entities SET name=$2,type=$3,goal_title=$4,goal_cents=$5,color=$6,color2=$7,logo=$8,hero=$9,product_ids=$10 WHERE id=$1`,
    [e.id, String(b.name || e.name).trim().slice(0, 80), TYPES[b.type] ? b.type : e.type, String(b.goal_title || e.goal_title).trim().slice(0, 100),
      Math.max(100, toCents(b.goal) || e.goal_cents), isHex(b.color) ? b.color : e.color, isHex(b.color2) ? b.color2 : e.color2,
      pick(e.logo, b.logo), pick(e.hero, b.hero), chosen.join(',')]);
  res.redirect('/panel/tienda?ok=' + encodeURIComponent('Tienda guardada.'));
});

// ---------- dinero
router.get('/panel/dinero', auth.needEntity, async (req, res) => {
  const e = req.entity, bal = await ledger.entityBalance(e.id);
  const pays = await db.all('SELECT * FROM payouts WHERE entity_id=$1 ORDER BY requested_at DESC', [e.id]);
  const st = { requested: ['warn', 'Solicitada'], paid: ['ok', 'Pagada'], rejected: ['bad', 'Rechazada'] };
  res.send(shell(e, '/panel/dinero', 'Dinero', `${flash(req)}
  <div class="grid g4"><div class="card stat"><div class="v">${eur(bal.total)}</div><div class="l">Recaudado en total</div></div>
   <div class="card stat"><div class="v">${eur(bal.pending)}</div><div class="l">En plazo de retención (${cfg.holdDays} días)</div></div>
   <div class="card stat"><div class="v">${eur(bal.taken)}</div><div class="l">Ya solicitado o pagado</div></div>
   <div class="card stat"><div class="v">${eur(bal.available)}</div><div class="l">Disponible para retirar</div></div></div>
  <form method="post" action="/panel/dinero" class="card" style="margin-top:18px"><h2>Solicitar transferencia</h2>
   <p class="note">Solo el administrador puede solicitarla. Importe mínimo ${eur(cfg.minPayoutCents)}. La transferencia se hace a la cuenta que indiques, que debe ser de la entidad.</p>
   <div class="row"><label class="f">Importe (€)<input class="in" name="amount" value="${(bal.available / 100).toFixed(2).replace('.', ',')}" inputmode="decimal" required></label>
   <label class="f">IBAN de la entidad<input class="in" name="iban" value="${esc(e.iban || '')}" required placeholder="ES00 0000 0000 0000 0000 0000" autocomplete="off"></label></div>
   <button class="btn" type="submit" ${bal.available < cfg.minPayoutCents ? 'disabled' : ''}>Solicitar transferencia</button></form>
  <h2 style="margin-top:22px">Historial</h2><div class="card tablewrap"><table class="t"><thead><tr><th>Fecha</th><th class="n">Importe</th><th>Estado</th><th>IBAN</th></tr></thead><tbody>
   ${pays.map(p => `<tr><td>${new Date(p.requested_at).toLocaleDateString('es-ES')}</td><td class="n">${eur(p.amount_cents)}</td><td><span class="chip ${st[p.status][0]}">${st[p.status][1]}</span>${p.note ? ` <span class="note">${esc(p.note)}</span>` : ''}</td><td><code>…${esc(p.iban.slice(-4))}</code></td></tr>`).join('') || '<tr><td colspan="4" class="note">Todavía no has solicitado ninguna.</td></tr>'}</tbody></table></div>
  <div class="card pending" style="margin-top:18px"><span class="chip warn">Pendiente de confirmar con un asesor</span><p class="note" style="color:var(--ink);margin-top:8px">El tratamiento fiscal de estas cantidades (IVA, declaración, facturación entre la plataforma y la entidad) está por confirmar. Consúltalo con tu gestoría antes de retirar fondos.</p></div>`));
});
router.post('/panel/dinero', auth.needEntity, form, async (req, res) => {
  const e = req.entity, back = (k, m) => res.redirect(`/panel/dinero?${k}=` + encodeURIComponent(m));
  const iban = String(req.body.iban || '').replace(/\s+/g, '').toUpperCase(), amount = toCents(req.body.amount);
  if (!validIban(iban)) return back('err', 'El IBAN no es válido.');
  const bal = await ledger.entityBalance(e.id);
  if (amount < cfg.minPayoutCents) return back('err', `El mínimo es ${eur(cfg.minPayoutCents)}.`);
  if (amount > bal.available) return back('err', 'El importe supera lo disponible.');
  // inserción condicionada para evitar solicitudes simultáneas que superen el saldo
  const r = await db.query(`INSERT INTO payouts(entity_id,amount_cents,iban)
     SELECT $1::int,$2::int,$3::text WHERE $2::int <= (SELECT COALESCE(SUM(seller_cents) FILTER (WHERE status='paid' AND paid_at <= NOW() - ($4::text || ' days')::interval),0) FROM orders WHERE entity_id=$1)
       - (SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('requested','paid')),0) FROM payouts WHERE entity_id=$1) RETURNING id`, [e.id, amount, iban, String(cfg.holdDays)]);
  if (!r.rows.length) return back('err', 'El importe supera lo disponible.');
  await db.query('UPDATE entities SET iban=$2 WHERE id=$1', [e.id, iban]);
  back('ok', 'Solicitud enviada. Te avisaremos cuando se realice la transferencia.');
});

// ---------- datos
router.get('/panel/datos', auth.needEntity, (req, res) => {
  const e = req.entity;
  res.send(shell(e, '/panel/datos', 'Datos de la entidad', `${flash(req)}<form method="post" action="/panel/datos" class="card">
  <div class="row"><label class="f">Nombre oficial<input class="in" name="legal_name" value="${esc(e.legal_name)}" required></label><label class="f">NIF o CIF<input class="in" name="tax_id" value="${esc(e.tax_id)}" required></label></div>
  <div class="row"><label class="f">Domicilio<input class="in" name="address" value="${esc(e.address)}" required></label><label class="f">Localidad y código postal<input class="in" name="city" value="${esc(e.city)}" required></label></div>
  <div class="row"><label class="f">Administrador<input class="in" name="contact_name" value="${esc(e.contact_name)}" required></label><label class="f">Cargo<input class="in" name="contact_role" value="${esc(e.contact_role || '')}"></label><label class="f">Teléfono<input class="in" name="phone" value="${esc(e.phone || '')}"></label></div>
  <p class="note">Correo de acceso: <b>${esc(e.email)}</b></p><button class="btn" type="submit">Guardar</button></form>
  <form method="post" action="/panel/clave" class="card" style="margin-top:18px"><h2>Cambiar contraseña</h2><div class="row"><label class="f">Actual<input class="in" type="password" name="old" required autocomplete="current-password"></label><label class="f">Nueva (mín. 10)<input class="in" type="password" name="new" minlength="10" required autocomplete="new-password"></label></div><button class="btn" type="submit">Cambiar</button></form>`));
});
router.post('/panel/datos', auth.needEntity, form, async (req, res) => {
  const b = req.body, t = (k, n = 150) => String(b[k] || '').trim().slice(0, n);
  await db.query('UPDATE entities SET legal_name=$2,tax_id=$3,address=$4,city=$5,contact_name=$6,contact_role=$7,phone=$8 WHERE id=$1',
    [req.entity.id, t('legal_name'), t('tax_id', 20).toUpperCase(), t('address'), t('city'), t('contact_name', 100), t('contact_role', 60), t('phone', 30)]);
  res.redirect('/panel/datos?ok=' + encodeURIComponent('Datos guardados.'));
});
router.post('/panel/clave', auth.needEntity, form, async (req, res) => {
  if (!checkPassword(String(req.body.old || ''), req.entity.password_hash)) return res.redirect('/panel/datos?err=' + encodeURIComponent('La contraseña actual no es correcta.'));
  if (String(req.body.new || '').length < 10) return res.redirect('/panel/datos?err=' + encodeURIComponent('La nueva contraseña es demasiado corta.'));
  await db.query('UPDATE entities SET password_hash=$2 WHERE id=$1', [req.entity.id, hashPassword(req.body.new)]);
  res.redirect('/panel/datos?ok=' + encodeURIComponent('Contraseña cambiada.'));
});

module.exports = router;
