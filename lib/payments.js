const db = require('./db');
const cfg = require('./config');
const supplier = require('./supplier');

let stripe;
const getStripe = () => (stripe ||= cfg.stripeKey ? require('stripe')(cfg.stripeKey) : null);

async function createCheckout({ order, entity, seller, lines }) {
  const s = getStripe();
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    customer_email: order.buyer_email,
    line_items: lines.map(l => ({
      quantity: l.qty,
      price_data: { currency: 'eur', unit_amount: l.price_cents,
        product_data: { name: l.name + (l.size ? ` (talla ${l.size})` : ''), description: `Para ${seller.name} · ${entity.name}` } },
    })),
    metadata: { order_id: String(order.id), public_id: order.public_id },
    payment_intent_data: { metadata: { public_id: order.public_id }, description: `Pedido ${order.public_id}` },
    success_url: `${cfg.baseUrl}/gracias/${order.public_id}`,
    cancel_url: `${cfg.baseUrl}/c/${seller.code}`,
    locale: 'es',
  });
  await db.query('UPDATE orders SET stripe_session=$2 WHERE id=$1', [order.id, session.id]);
  return session.url;
}

// Idempotente: solo el primer aviso de pago cambia el estado y lanza el pedido al proveedor
async function markPaid(orderId, { paymentIntent } = {}) {
  const r = await db.query("UPDATE orders SET status='paid', paid_at=NOW(), stripe_payment_intent=COALESCE($2,stripe_payment_intent) WHERE id=$1 AND status='pending' RETURNING id", [orderId, paymentIntent || null]);
  if (!r.rows.length) return false;
  const s = getStripe();
  if (s && paymentIntent) {
    try {
      const pi = await s.paymentIntents.retrieve(paymentIntent, { expand: ['latest_charge.balance_transaction'] });
      const fee = pi.latest_charge && pi.latest_charge.balance_transaction && pi.latest_charge.balance_transaction.fee;
      if (fee != null) await db.query('UPDATE orders SET stripe_fee_cents=$2 WHERE id=$1', [orderId, fee]);
    } catch (e) { console.warn('No se pudo leer la comisión de Stripe:', e.message); }
  }
  supplier.sendOrder(orderId).catch(e => console.error('sendOrder', e));
  return true;
}

module.exports = { getStripe, createCheckout, markPaid };
