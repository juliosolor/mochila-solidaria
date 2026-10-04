// Capa de base de datos: Postgres real (DATABASE_URL) o PGlite local (solo desarrollo/pruebas).
const fs = require('fs');
const path = require('path');

let impl;
async function init() {
  if (impl) return impl;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false },
      max: 8,
    });
    impl = { query: (s, p) => pool.query(s, p), kind: 'postgres' };
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(__dirname, '..', '.localdb');
    const pg = process.env.PGLITE_MEMORY ? new PGlite() : new PGlite(dir);
    await pg.waitReady;
    impl = { query: (s, p) => pg.query(s, p), kind: 'pglite (local)' };
  }
  await impl.query('SELECT 1');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  for (const stmt of schema.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await impl.query(stmt);
  return impl;
}
async function query(sql, params = []) {
  const d = await init();
  return d.query(sql, params);
}
async function one(sql, params) { return (await query(sql, params)).rows[0] || null; }
async function all(sql, params) { return (await query(sql, params)).rows; }
module.exports = { init, query, one, all, kind: () => impl && impl.kind };
