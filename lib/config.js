const prod = process.env.NODE_ENV === 'production';
module.exports = {
  prod,
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, ''),
  brand: process.env.BRAND_NAME || 'Mochila Solidaria',
  ownerEmail: (process.env.OWNER_EMAIL || '').toLowerCase(),
  ownerPassword: process.env.OWNER_PASSWORD || '',
  stripeKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  supplierToken: process.env.SUPPLIER_API_TOKEN || '',
  supplierStoreId: process.env.SUPPLIER_STORE_ID || '',
  // modo demostración: pago simulado sin Stripe (nunca en producción salvo que se fuerce)
  demo: !process.env.STRIPE_SECRET_KEY && (!prod || process.env.ALLOW_DEMO === '1'),
  // días que se retiene el dinero antes de poder retirarlo (devoluciones)
  holdDays: Number(process.env.PAYOUT_HOLD_DAYS ?? 14),
  minPayoutCents: Number(process.env.MIN_PAYOUT_EUR ?? 20) * 100,
  feePct: Number(process.env.CARD_FEE_PCT ?? 1.5),
  feeFixCents: Math.round(Number(process.env.CARD_FEE_FIXED_EUR ?? 0.25) * 100),
  contactEmail: process.env.CONTACT_EMAIL || 'contacto@tu-dominio.es',
  legal: {
    name: process.env.LEGAL_NAME || '[Razón social pendiente]',
    taxId: process.env.LEGAL_TAX_ID || '[NIF pendiente]',
    address: process.env.LEGAL_ADDRESS || '[Domicilio pendiente]',
  },
};
