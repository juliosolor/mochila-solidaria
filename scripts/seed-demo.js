// Datos de ejemplo para ver los paneles llenos en local. NO usar en producción.
// Uso: node scripts/seed-demo.js   (crea la base local .localdb)
if (process.env.DATABASE_URL && !process.argv.includes('--force')) { console.error('Hay DATABASE_URL: esto es para pruebas locales. Cancelado.'); process.exit(1); }
const db = require('../lib/db'); const catalog = require('../lib/catalog'); const { hashPassword, codeFor } = require('../lib/util');
(async () => {
  await db.init();
  for (const p of catalog) await db.query(`INSERT INTO products(id,name,shape,sizes,price_cents,commission_cents,cost_cents,supplier_ref,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`, [p.id, p.name, p.shape, p.sizes, p.price * 100, Math.round(p.com * 100), Math.round(p.cost * 100), p.ref, p.sort]);
  let seed = 20261003; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const ents = [
    ['ceip-gloria-fuertes', 'colegio', 'CEIP Gloria Fuertes', 'Viaje de fin de curso a Doñana', 15000, '#2748E8', '#FFC53D', ['Lucía Martín', 'Mateo Ruiz', 'Sara Pérez', 'Hugo Torres', 'Alba Díaz', 'Leo Gil']],
    ['cd-las-dunas', 'club', 'Club Deportivo Las Dunas', 'Torneo de fin de temporada en Lisboa', 20000, '#0B7A5A', '#F2994A', ['Pablo Sanz', 'Irene Vega', 'Marcos Ortiz', 'Nora Cano']],
    ['amigos-del-faro', 'asociacion', 'Asociación Amigos del Faro', 'Restauración del faro', 25000, '#8E2DE2', '#F6D365', ['Rosa Mena', 'Julián Prieto', 'Carmen Rey']],
  ];
  const prods = await db.all('SELECT * FROM products');
  for (const [slug, type, name, goal, cents, c1, c2, people] of ents) {
    if (await db.one('SELECT 1 FROM entities WHERE slug=$1', [slug])) continue;
    const e = await db.one(`INSERT INTO entities(slug,type,name,legal_name,tax_id,address,city,contact_name,email,password_hash,goal_title,goal_cents,color,color2,product_ids,accepted_terms_at)
      VALUES($1,$2,$3,$3,'Q0000000A','Calle Ejemplo 1','Sevilla 41001','Admin Ejemplo',$4,$5,$6,$7,$8,$9,'camiseta,sudadera,bolsa,taza',NOW()) RETURNING id`, [slug, type, name, `admin@${slug}.es`, hashPassword('demo-demo-demo'), goal, cents, c1, c2]);
    for (const n of people) {
      const code = codeFor(n);
      const s = await db.one(`INSERT INTO sellers(entity_id,name,code,group_name,minor,tutor_name,tutor_email,consent,thanks,private_token) VALUES($1,$2,$3,'6ºA',$4,'Tutor Ejemplo','t@x.es',TRUE,'¡Gracias por ayudarme a conseguirlo!',$5) RETURNING id`, [e.id, n, code, type === 'colegio', require('../lib/util').token().slice(0, 24)]);
      const cnt = Math.floor(rnd() * 8) + 2;
      for (let i = 0; i < cnt; i++) {
        const p = prods.filter(x => ['camiseta', 'sudadera', 'bolsa', 'taza'].includes(x.id))[Math.floor(rnd() * 4)], q = rnd() < .3 ? 2 : 1;
        const days = Math.floor(rnd() * 70);
        await db.query(`INSERT INTO orders(public_id,entity_id,seller_id,buyer_name,buyer_email,ship_address,ship_city,ship_zip,items,total_cents,seller_cents,cost_cents,status,paid_at,created_at,supplier_status)
          VALUES($1,$2,$3,'Comprador','c@c.es','Calle 1','Sevilla','41001',$4,$5,$6,$7,'paid',NOW() - ($8::text || ' days')::interval,NOW() - ($8::text || ' days')::interval,'sent')`,
          ['RS-' + Math.random().toString(36).slice(2, 10).toUpperCase(), e.id, s.id, JSON.stringify([{ id: p.id, name: p.name, size: p.sizes ? 'M' : '', qty: q, price_cents: p.price_cents, commission_cents: p.commission_cents, cost_cents: p.cost_cents }]),
            p.price_cents * q, p.commission_cents * q, p.cost_cents * q, String(days)]);
      }
    }
  }
  console.log('Datos de ejemplo creados. Acceso entidad: admin@ceip-gloria-fuertes.es / demo-demo-demo');
  process.exit(0);
})();
