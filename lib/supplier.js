// Conexión con el proveedor de impresión y envío. SOLO se usa en el servidor.
// El nombre del proveedor no se muestra nunca a compradores ni entidades.
const cfg = require('./config');
const db = require('./db');

const API = process.env.SUPPLIER_API_URL || 'https://api.printful.com';

function variantFor(product, size) {
  // supplier_ref: número (artículo sin tallas) o JSON {"S":123,"M":124,...}
  const ref = (product.supplier_ref || '').trim();
  if (!ref) return null;
  if (/^\d+$/.test(ref)) return Number(ref);
  try { const m = JSON.parse(ref); return m[size] ?? null; } catch { return null; }
}

async function sendOrder(orderId) {
  const o = await db.one('SELECT * FROM orders WHERE id=$1', [orderId]);
  if (!o || o.status !== 'paid' || ['sent', 'dry'].includes(o.supplier_status)) return;
  const e = await db.one('SELECT id, logo FROM entities WHERE id=$1', [o.entity_id]);
  const prods = await db.all('SELECT * FROM products');
  const byId = Object.fromEntries(prods.map(p => [p.id, p]));

  const items = [];
  const missing = [];
  for (const it of o.items) {
    const v = variantFor(byId[it.id] || {}, it.size);
    if (!v) { missing.push(`${it.id}${it.size ? ' ' + it.size : ''}`); continue; }
    items.push({
      variant_id: v, quantity: it.qty,
      files: e.logo ? [{ type: 'default', url: `${cfg.baseUrl}/media/entity/${e.id}/logo` }] : [],
    });
  }

  if (!cfg.supplierToken) {
    await db.query("UPDATE orders SET supplier_status='dry', supplier_error=$2 WHERE id=$1",
      [orderId, 'Modo prueba: sin SUPPLIER_API_TOKEN, no se ha enviado al proveedor.']);
    console.log(`[proveedor] (prueba) pedido ${o.public_id} no enviado: falta SUPPLIER_API_TOKEN`);
    return;
  }
  if (missing.length) {
    await db.query("UPDATE orders SET supplier_status='error', supplier_error=$2 WHERE id=$1",
      [orderId, 'Faltan referencias de proveedor para: ' + missing.join(', ')]);
    return;
  }
  try {
    const confirm = process.env.SUPPLIER_AUTO_CONFIRM === '1' ? '?confirm=true' : '';
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.supplierToken}` };
    if (cfg.supplierStoreId) headers['X-PF-Store-Id'] = cfg.supplierStoreId;
    const r = await fetch(`${API}/orders${confirm}`, {
      method: 'POST', headers,
      body: JSON.stringify({
        external_id: o.public_id,
        recipient: { name: o.buyer_name, address1: o.ship_address, city: o.ship_city, zip: o.ship_zip,
          country_code: o.ship_country, phone: o.buyer_phone || undefined, email: o.buyer_email },
        items,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
    const costs = j.result && j.result.costs;
    const costCents = costs && costs.total ? Math.round(parseFloat(costs.total) * 100) : null;
    await db.query("UPDATE orders SET supplier_status='sent', supplier_order_id=$2, supplier_cost_cents=$3, supplier_error=NULL WHERE id=$1",
      [orderId, String(j.result && j.result.id || ''), costCents]);
  } catch (err) {
    console.error('[proveedor] error', o.public_id, err.message);
    await db.query("UPDATE orders SET supplier_status='error', supplier_error=$2 WHERE id=$1", [orderId, String(err.message).slice(0, 500)]);
  }
}
module.exports = { sendOrder };
