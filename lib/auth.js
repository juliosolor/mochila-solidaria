const db = require('./db');
const cfg = require('./config');
const crypto = require('crypto');
const { token, parseCookies, safeEq, checkPassword, hashPassword } = require('./util');

const COOKIE = 'rs_session';
async function createSession(res, role, entityId) {
  const t = token();
  await db.query('INSERT INTO sessions(token, role, entity_id, expires_at) VALUES($1,$2,$3, NOW() + INTERVAL \'12 hours\')', [t, role, entityId || null]);
  res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${cfg.prod ? '; Secure' : ''}`);
}
async function destroySession(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) await db.query('DELETE FROM sessions WHERE token=$1', [t]);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
}
async function load(req) {
  if (req._sess !== undefined) return req._sess;
  const t = parseCookies(req)[COOKIE];
  let s = null;
  if (t) s = await db.one('SELECT * FROM sessions WHERE token=$1 AND expires_at > NOW()', [t]);
  req._sess = s; return s;
}
// middlewares
const needEntity = async (req, res, next) => {
  const s = await load(req);
  if (!s || s.role !== 'entity') return res.redirect('/panel/entrar');
  const e = await db.one('SELECT * FROM entities WHERE id=$1', [s.entity_id]);
  if (!e) return res.redirect('/panel/entrar');
  req.entity = e; next();
};
const needOwner = async (req, res, next) => {
  const s = await load(req);
  if (!s || s.role !== 'owner') return res.redirect('/propietario/entrar');
  next();
};
function ownerLogin(email, pw) {
  if (!cfg.ownerEmail || !cfg.ownerPassword) return false;
  return safeEq(String(email).toLowerCase(), cfg.ownerEmail) && safeEq(pw, cfg.ownerPassword);
}
// Protección CSRF básica: las peticiones que cambian datos deben venir del mismo origen
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.path === '/webhook/stripe') return next();
  const o = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (o && new URL(o).host !== host) return res.status(403).send('Origen no permitido');
  next();
}
// Recuperación de contraseña: enlace de un solo uso que genera el propietario (no hay envío de correos)
const RESET_HOURS = 48;
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
async function createReset(entityId) {
  const t = token();
  await db.query('DELETE FROM password_resets WHERE entity_id=$1', [entityId]);
  await db.query(`INSERT INTO password_resets(token_hash, entity_id, expires_at) VALUES($1,$2, NOW() + INTERVAL '${RESET_HOURS} hours')`, [sha(t), entityId]);
  return t;
}
async function findReset(t) {
  if (!/^[a-f0-9]{64}$/.test(String(t))) return null;
  return db.one('SELECT r.entity_id, e.name, e.email FROM password_resets r JOIN entities e ON e.id=r.entity_id WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at > NOW()', [sha(t)]);
}
async function useReset(t, newPassword) {
  const r = await findReset(t);
  if (!r) return null;
  const done = await db.query('UPDATE password_resets SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL', [sha(t)]);
  if (!done.affectedRows && !done.rowCount) return null;
  await db.query('UPDATE entities SET password_hash=$2 WHERE id=$1', [r.entity_id, hashPassword(newPassword)]);
  // cierra las sesiones abiertas con la contraseña antigua
  await db.query("DELETE FROM sessions WHERE role='entity' AND entity_id=$1", [r.entity_id]);
  return r;
}
module.exports = { RESET_HOURS, createReset, findReset, useReset, createSession, destroySession, load, needEntity, needOwner, ownerLogin, sameOrigin, checkPassword };
