// Prueba de extremo a extremo con base de datos en memoria. Uso: npm test
const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
let pass = 0;
const ok = (c, m) => { assert(c, m); pass++; console.log('  ✓', m); };

function start(port, env) {
  const p = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: port, PGLITE_MEMORY: '1', BASE_URL: `http://localhost:${port}`, ...env } });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  return new Promise((res, rej) => { const t = setInterval(async () => { try { await fetch(`http://localhost:${port}/salud`); clearInterval(t); res({ p, out: () => out }); } catch {} }, 300); setTimeout(() => rej(new Error('no arranca: ' + out)), 30000); });
}
function client(base) {
  let cookie = '';
  return async (url, opt = {}) => {
    const h = { ...(opt.headers || {}) }; if (cookie) h.cookie = cookie;
    let body = opt.body;
    if (opt.form) { const u = new URLSearchParams(); for (const [k, v] of Object.entries(opt.form)) [].concat(v).forEach(x => u.append(k, x)); body = u.toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
    if (opt.json) { body = JSON.stringify(opt.json); h['content-type'] = 'application/json'; }
    const r = await fetch(base + url, { method: opt.method || (body ? 'POST' : 'GET'), headers: h, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, loc: r.headers.get('location'), type: r.headers.get('content-type') || '', buf, text: buf.toString('utf8') };
  };
}
// PNG 1x1 rojo
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

(async () => {
  const A = await start(3201, { OWNER_EMAIL: 'dueno@test.es', OWNER_PASSWORD: 'clave-del-dueno-123', PAYOUT_HOLD_DAYS: '0', MIN_PAYOUT_EUR: '5' });
  const base = 'http://localhost:3201', web = client(base), anon = client(base), owner = client(base);
  const allHtml = [];
  const get = async (c, u) => { const r = await c(u); if (r.type.includes('html')) allHtml.push([u, r.text]); return r; };
  try {
    console.log('Alta y panel de la entidad');
    let r = await get(web, '/alta'); ok(r.status === 200, 'formulario de alta');
    r = await web('/alta', { form: { type: 'colegio', name: 'CEIP Gloria Fuertes', legal_name: 'CEIP Gloria Fuertes', tax_id: 'q1234567a', address: 'Calle Sol 1', city: 'Sevilla 41001', goal_title: 'Viaje a Doñana', goal: '150', contact_name: 'Ana Directora', email: 'ana@cole.es', password: 'una-clave-larga-1', terms: '1', consents: '1' } });
    ok(r.status === 302 && r.loc.startsWith('/panel/tienda'), 'alta crea la entidad y abre sesión');
    r = await web('/alta', { form: { name: 'x' } }); ok(r.status === 400, 'alta incompleta rechazada');
    r = await get(web, '/panel/tienda?nuevo=1'); ok(r.text.includes('Marca') && r.text.includes('Camiseta'), 'panel de tienda con muestrario');
    r = await web('/panel/tienda', { form: { name: 'CEIP Gloria Fuertes', type: 'colegio', goal_title: 'Viaje a Doñana', goal: '150', color: '#2748E8', color2: '#FFC53D', logo: PNG, hero: '', prod: ['camiseta', 'sudadera', 'taza'] } });
    ok(r.status === 302 && r.loc.includes('ok='), 'tienda guardada con logo y artículos');
    r = await anon('/media/entity/1/logo'); ok(r.status === 200 && r.type.includes('png'), 'logo servido públicamente');
    r = await web('/panel/vendedores', { form: { name: 'Lucía Martín', group_name: '6ºA', minor: '1', tutor_name: 'Ana Gómez', tutor_email: 'ana@x.es', consent: '1', thanks: 'Gracias por ayudarme a ir a Doñana', photo: PNG } });
    ok(r.status === 302 && r.loc.includes('ok='), 'vendedor menor con tutor añadido');
    r = await web('/panel/vendedores', { form: { name: 'Mateo Ruiz', minor: '1', consent: '1' } });
    ok(r.loc.includes('err='), 'menor sin datos de tutor rechazado');
    r = await web('/panel/vendedores/importar', { form: { csv: 'Sara Pérez; 5ºB; sí; Marta; m@x.es; 600; sí\nHugo Torres; 5ºB; no; ; ; ; no' } });
    ok(r.loc.includes('ok='), 'importación en bloque');
    r = await get(web, '/panel/vendedores'); const codes = [...r.text.matchAll(/<code>([A-Z]{3}-\d{4})<\/code>/g)].map(m => m[1]);
    ok(codes.length >= 3, 'códigos personales generados: ' + [...new Set(codes)].join(', '));
    const codeOf = (html, n) => new RegExp(n + '[\\s\\S]*?<code>([A-Z]{3}-\\d{4})</code>').exec(html)[1];
    const lucia = codeOf(r.text, 'Lucía Martín'), hugo = codeOf(r.text, 'Hugo Torres');
    r = await get(web, '/panel/vendedores'); ok(r.text.includes('Falta consentimiento'), 'estado de consentimiento visible');

    console.log('Tienda y compra');
    r = await get(anon, '/t/ceip-gloria-fuertes'); ok(r.status === 200 && r.text.includes('Viaje a Doñana'), 'tienda de la entidad');
    ok(!r.text.includes('Polo'), 'solo aparecen los artículos elegidos');
    r = await anon('/t/ceip-gloria-fuertes/entrar?code=' + lucia.toLowerCase()); ok(r.loc === '/c/' + lucia, 'entrar con código (minúsculas)');
    r = await anon('/t/ceip-gloria-fuertes/entrar?code=ZZZ-0000'); ok(r.loc.includes('error=1'), 'código inexistente');
    r = await anon('/c/' + hugo); ok(r.status === 404, 'vendedor sin consentimiento no tiene tienda');
    r = await get(anon, '/c/' + lucia);
    ok(r.text.includes('Esto es para') && r.text.includes('Lucía Martín') && r.text.includes('Gracias por ayudarme'), 'página del vendedor: «Esto es para», nombre y agradecimiento');
    ok(r.text.includes('/media/seller/' + lucia + '/photo'), 'foto del vendedor');
    ok(!/tutor|ana@x\.es/i.test(r.text.replace(/Gracias por ayudarme/g, '')), 'no se filtran datos del tutor');
    r = await anon('/qr/' + lucia + '.png'); ok(r.buf.slice(1, 4).toString() === 'PNG', 'QR en PNG');
    r = await anon('/c/' + lucia + '/catalogo.pdf'); ok(r.buf.slice(0, 4).toString() === '%PDF' && r.buf.length > 4000, 'catálogo PDF del vendedor');
    const item = (id, size, qty) => ({ id, size, qty });
    const buyer = { name: 'Abuela Paz', email: 'paz@mail.es', phone: '600', address: 'C/ Luna 3', city: 'Sevilla', zip: '41002', terms: '1', sign: 'Tu tío Manuel', message: 'Disfruta de tu viaje, ¡lo vas a pasar genial!' };
    r = await anon('/api/pedido', { json: { code: lucia, items: [item('polo', 'M', 1)], buyer } }); ok(r.status === 400, 'artículo no ofrecido por la tienda rechazado');
    r = await anon('/api/pedido', { json: { code: lucia, items: [item('camiseta', '', 1)], buyer } }); ok(r.status === 400, 'talla obligatoria');
    r = await anon('/api/pedido', { json: { code: lucia, items: [item('camiseta', 'M', 2), item('taza', '', 1)], buyer } });
    ok(r.status === 200, 'pedido creado'); const url = JSON.parse(r.text).url; ok(url.startsWith('/demo-pago/'), 'redirección a pago de demostración');
    r = await anon(url); ok(r.text.includes('38,00'), 'total correcto (2×14 + 10 = 38 €)');
    r = await anon(url, { method: 'POST', form: {} }); ok(r.loc.startsWith('/gracias/'), 'pago simulado confirmado');
    r = await get(anon, r.loc); ok(r.text.includes('Pedido confirmado') && r.text.includes('Lucía'), 'página de gracias');
    r = await get(anon, '/c/' + lucia); ok(!/recaudad|11,00|progressbar/.test(r.text), 'el comprador NO ve lo recaudado');
    ok(!r.text.includes('Disfruta de tu viaje'), 'los mensajes de otros compradores no se muestran públicamente');
    ok(r.text.includes('name="message"') && r.text.includes('name="sign"'), 'el comprador puede dejar mensaje y firma');
    r = await web('/panel/vendedores'); const sid = /href="\/panel\/vendedores\/(\d+)">Abrir[\s\S]*?/.exec(r.text) && null;
    r = await get(web, '/panel/vendedores'); const lid = new RegExp(lucia + '[\\s\\S]*?/panel/vendedores/(\\d+)').exec(r.text)[1];
    r = await get(web, '/panel/vendedores/' + lid); ok(r.text.includes('Tu tío Manuel') && r.text.includes('Disfruta de tu viaje'), 'el administrador ve el mensaje recibido');
    const tok = /\/mi\/([a-f0-9]{24})/.exec(r.text)[1];
    r = await get(anon, '/mi/' + tok); ok(r.text.includes('11,00') && r.text.includes('Tu tío Manuel') && r.text.includes('Disfruta de tu viaje'), 'enlace privado: la familia ve lo recaudado y el mensaje');
    ok(/noindex/.test(r.text), 'página privada no indexable');
    r = await anon('/mi/' + 'a'.repeat(24)); ok(r.status === 404, 'enlace privado falso rechazado');

    console.log('Panel de la entidad: cuentas y retirada');
    r = await get(web, '/panel'); ok(r.text.includes('11,00') && r.text.includes('Lucía Martín'), 'resumen con cuentas de todos');
    r = await anon('/panel'); ok(r.text.includes('Acceso para entidades'), 'sin sesión no se ve el panel');
    r = await anon('/panel/dinero'); ok(r.status === 302, 'dinero exige sesión de administrador');
    r = await web('/panel/dinero', { form: { amount: '20', iban: 'ES00 0000 0000 0000 0000 0000' } }); ok(r.loc.includes('err=') && decodeURIComponent(r.loc).includes('IBAN'), 'IBAN inválido rechazado');
    r = await web('/panel/dinero', { form: { amount: '20', iban: 'ES91 2100 0418 4502 0005 1332' } }); ok(decodeURIComponent(r.loc).includes('supera'), 'no se puede retirar más de lo disponible');
    r = await web('/panel/dinero', { form: { amount: '11', iban: 'ES91 2100 0418 4502 0005 1332' } }); ok(r.loc.includes('ok='), 'retirada solicitada');
    r = await web('/panel/dinero', { form: { amount: '5', iban: 'ES91 2100 0418 4502 0005 1332' } }); ok(decodeURIComponent(r.loc).includes('supera'), 'no se puede retirar dos veces lo mismo');
    r = await web('/panel/tarjetas.pdf'); ok(r.buf.slice(0, 4).toString() === '%PDF', 'PDF de tarjetas QR');
    r = await web('/panel/vendedores.csv'); ok(r.text.includes('Lucía Martín') && r.text.includes('11,00'), 'CSV de vendedores');
    // aislamiento entre entidades
    const web2 = client(base);
    await web2('/alta', { form: { type: 'club', name: 'Club Las Dunas', legal_name: 'CD Las Dunas', tax_id: 'g1', address: 'x', city: 'y', goal_title: 'Torneo', goal: '100', contact_name: 'Pepe', email: 'pepe@club.es', password: 'otra-clave-larga-1', terms: '1', consents: '1' } });
    r = await get(web2, '/panel'); ok(!r.text.includes('Lucía'), 'otra entidad no ve a mis vendedores');
    r = await web2('/panel/vendedores/1'); ok(r.status === 302, 'otra entidad no abre mi vendedor');

    console.log('Panel del propietario');
    r = await anon('/propietario'); ok(r.status === 302, 'propietario exige acceso');
    r = await web('/propietario'); ok(r.status === 302, 'un administrador de entidad no entra como propietario');
    r = await owner('/propietario/entrar', { form: { email: 'dueno@test.es', password: 'mala' } }); ok(r.status === 401, 'clave de propietario incorrecta');
    r = await owner('/propietario/entrar', { form: { email: 'dueno@test.es', password: 'clave-del-dueno-123' } }); ok(r.status === 302, 'login de propietario');
    r = await get(owner, '/propietario?r=all'); ok(r.text.includes('38,00') && r.text.includes('Beneficio'), 'panel de negocio con ventas');
    // beneficio esperado: 38 - 11 - (2*7.5+5=20) - tarjeta(1.5%*38=0.57+0.25=0.82) = 6.18
    ok(r.text.includes('6,18'), 'beneficio = 38 − 11 − 20 − 0,82 = 6,18 €');
    ok(r.text.includes('Modo prueba'), 'avisa de pedidos no enviados al proveedor (sin credenciales)');
    r = await get(owner, '/propietario/tiendas?r=all'); ok(r.text.includes('CEIP Gloria Fuertes') && r.text.includes('6,18'), 'tabla por tienda');
    r = await get(owner, '/propietario/vendedores?r=all'); ok(r.text.includes('Lucía Martín'), 'tabla por vendedor');
    r = await get(owner, '/propietario/retiradas'); ok(r.text.includes('11,00') && r.text.includes('Solicitada'), 'retirada pendiente visible');
    r = await owner('/propietario/retiradas/1', { form: { to: 'paid', note: 'Transf. 03/10' } }); ok(r.status === 302, 'retirada marcada como pagada');
    r = await get(owner, '/propietario/catalogo'); ok(r.text.includes('margen'), 'catálogo editable');
    r = await owner('/propietario/pedidos.csv?r=all'); ok(r.text.includes('RS-'), 'CSV de pedidos');

    console.log('Seguridad y confidencialidad');
    r = await anon('/panel/tienda', { method: 'POST', form: { name: 'hack' }, headers: { origin: 'https://evil.example' } }); ok(r.status === 403, 'POST desde otro origen bloqueado');
    r = await web('/panel/vendedores', { form: { name: '<img src=x onerror=alert(1)>', consent: '1' } });
    r = await get(web, '/panel/vendedores'); ok(!r.text.includes('<img src=x onerror'), 'HTML escapado en nombres');
    const bad = allHtml.filter(([u, h]) => /printful/i.test(h)); ok(bad.length === 0, `la palabra del proveedor no aparece en ${allHtml.length} páginas HTML`);
    const pub = await Promise.all(['/', '/como-funciona', '/privacidad', '/t/ceip-gloria-fuertes', '/c/' + lucia].map(u => anon(u)));
    ok(pub.every(x => !/coste|cost_cents|supplier|beneficio/i.test(x.text.replace(/costes del cobro/gi, ''))), 'páginas públicas sin costes ni beneficios');
    const st = await anon('/store.js'); ok(!/supplier|printful/i.test(st.text), 'JS público sin referencias al proveedor');
  } finally { A.p.kill(); }

  console.log('Webhook de Stripe');
  const B = await start(3202, { STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_test123', PAYOUT_HOLD_DAYS: '0' });
  try {
    const base2 = 'http://localhost:3202', c = client(base2);
    await c('/alta', { form: { type: 'colegio', name: 'Cole B', legal_name: 'Cole B', tax_id: 'x', address: 'x', city: 'y', goal_title: 'Viaje', goal: '100', contact_name: 'Z', email: 'b@b.es', password: 'una-clave-larga-1', terms: '1', consents: '1' } });
    await c('/panel/tienda', { form: { name: 'Cole B', type: 'colegio', goal_title: 'Viaje', goal: '100', color: '#112233', color2: '#ffcc00', prod: ['camiseta'] } });
    await c('/panel/vendedores', { form: { name: 'Nico', consent: '1' } });
    const code = /<code>([A-Z]{3}-\d{4})<\/code>/.exec((await c('/panel/vendedores')).text)[1];
    // Sin Stripe real no podemos crear la sesión de pago; insertamos el pedido pendiente como lo haría el servidor
    const r0 = await fetch(base2 + '/api/pedido', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, items: [{ id: 'camiseta', size: 'M', qty: 1 }], buyer: { name: 'N', email: 'n@n.es', address: 'a', city: 'c', zip: '41001', terms: '1' } }) });
    ok(r0.status === 500, 'sin conexión real a Stripe el pedido falla de forma controlada (' + r0.status + ')');
    const Stripe = require('stripe'); const s = Stripe('sk_test_dummy');
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_x', payment_status: 'paid', amount_total: 1400, payment_intent: null, metadata: { public_id: 'RS-NOEXISTE' } } } });
    const sig = s.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test123' });
    let w = await fetch(base2 + '/webhook/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body: payload });
    ok(w.status === 200, 'webhook con firma válida aceptado');
    w = await fetch(base2 + '/webhook/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=abc' }, body: payload });
    ok(w.status === 400, 'webhook con firma falsa rechazado');
  } finally { B.p.kill(); }

  console.log('Envío automático del pedido al proveedor (simulado)');
  const got = [];
  const mock = require('http').createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { got.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(b || '{}') }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ result: { id: 98765, costs: { total: '9.40' } } })); }); }).listen(3299);
  const C = await start(3203, { OWNER_EMAIL: 'o@o.es', OWNER_PASSWORD: 'clave-del-dueno-123', SUPPLIER_API_TOKEN: 'tok_abc', SUPPLIER_API_URL: 'http://localhost:3299' });
  try {
    const base3 = 'http://localhost:3203', c = client(base3), ow = client(base3);
    await c('/alta', { form: { type: 'colegio', name: 'Cole C', legal_name: 'Cole C', tax_id: 'x', address: 'x', city: 'y', goal_title: 'Viaje', goal: '100', contact_name: 'Z', email: 'c@c.es', password: 'una-clave-larga-1', terms: '1', consents: '1' } });
    await c('/panel/tienda', { form: { name: 'Cole C', type: 'colegio', goal_title: 'Viaje', goal: '100', color: '#112233', color2: '#ffcc00', logo: PNG, prod: ['camiseta', 'taza'] } });
    await c('/panel/vendedores', { form: { name: 'Nico', consent: '1' } });
    const code = /<code>([A-Z]{3}-\d{4})<\/code>/.exec((await c('/panel/vendedores')).text)[1];
    await ow('/propietario/entrar', { form: { email: 'o@o.es', password: 'clave-del-dueno-123' } });
    await ow('/propietario/catalogo/camiseta', { form: { price: '14', com: '4', cost: '7,5', ref: '{"S":101,"M":102}', active: '1' } });
    await ow('/propietario/catalogo/taza', { form: { price: '10', com: '3', cost: '5', ref: '555', active: '1' } });
    const mk = async (items) => { const r = await c('/api/pedido', { json: { code, items, buyer: { name: 'Paz', email: 'p@p.es', phone: '600', address: 'C/ Luna 3', city: 'Sevilla', zip: '41002', terms: '1' } } }); const u = JSON.parse(r.text).url; const p = await c(u, { method: 'POST', form: {} }); return p.loc; };
    await mk([{ id: 'camiseta', size: 'M', qty: 2 }, { id: 'taza', size: '', qty: 1 }]);
    await new Promise(r => setTimeout(r, 800));
    ok(got.length === 1, 'se envía 1 pedido al proveedor al confirmarse el pago');
    const g = got[0]; ok(g.auth === 'Bearer tok_abc' && g.url === '/orders', 'con la credencial privada, sin confirmar (borrador)');
    ok(g.body.recipient.zip === '41002' && g.body.recipient.country_code === 'ES' && g.body.recipient.name === 'Paz', 'dirección de entrega del comprador');
    ok(g.body.items.length === 2 && g.body.items[0].variant_id === 102 && g.body.items[0].quantity === 2 && g.body.items[1].variant_id === 555, 'artículos, tallas y cantidades correctos');
    ok(g.body.items[0].files[0].url.endsWith('/media/entity/1/logo'), 'con el logo de la entidad como diseño');
    const o = await ow('/propietario?r=all'); ok(!o.text.includes('Pedidos sin enviar'), 'sin incidencias pendientes');
    const csv = await ow('/propietario/pedidos.csv?r=all'); ok(csv.text.includes(';sent'), 'estado «sent» registrado');
    ok(csv.text.includes('9,40'), 'coste real del proveedor sustituye al estimado');
  } finally { C.p.kill(); mock.close(); }
  console.log(`\n${pass} comprobaciones correctas`);
})().catch(e => { console.error('\nFALLO:', e.message); process.exit(1); });
