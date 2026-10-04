const db = require('./db');
const cfg = require('./config');

const estFee = (total) => Math.round(total * cfg.feePct / 100) + cfg.feeFixCents;
// Beneficio de la plataforma en un pedido pagado (cents)
const orderProfit = (o) => {
  const cost = o.supplier_cost_cents ?? o.cost_cents;
  const fee = o.stripe_fee_cents ?? estFee(o.total_cents);
  return o.total_cents - o.seller_cents - cost - fee;
};

// Recaudado por vendedor de una entidad
async function sellerTotals(entityId) {
  return db.all(`SELECT s.*, COALESCE(SUM(o.seller_cents) FILTER (WHERE o.status='paid'),0)::int AS raised_cents,
      COUNT(o.id) FILTER (WHERE o.status='paid')::int AS orders
    FROM sellers s LEFT JOIN orders o ON o.seller_id=s.id
    WHERE s.entity_id=$1 GROUP BY s.id ORDER BY s.name`, [entityId]);
}
// Saldo de la entidad: total, disponible (pasado el plazo de retención), ya solicitado/pagado
async function entityBalance(entityId) {
  const r = await db.one(`SELECT
      COALESCE(SUM(seller_cents) FILTER (WHERE status='paid'),0)::int AS total,
      COALESCE(SUM(seller_cents) FILTER (WHERE status='paid' AND paid_at <= NOW() - ($2::text || ' days')::interval),0)::int AS released
    FROM orders WHERE entity_id=$1`, [entityId, String(cfg.holdDays)]);
  const p = await db.one(`SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('requested','paid')),0)::int AS taken,
      COALESCE(SUM(amount_cents) FILTER (WHERE status='paid'),0)::int AS paid
    FROM payouts WHERE entity_id=$1`, [entityId]);
  return { total: r.total, released: r.released, taken: p.taken, paid: p.paid,
    available: Math.max(0, r.released - p.taken), pending: Math.max(0, r.total - r.released) };
}
module.exports = { estFee, orderProfit, sellerTotals, entityBalance };
