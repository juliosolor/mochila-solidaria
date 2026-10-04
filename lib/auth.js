const db = require('./db');
const cfg = require('./config');
const { token, parseCookies, safeEq, checkPassword } = require('./util');

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
module.exports = { createSession, destroySession, load, needEntity, needOwner, ownerLogin, sameOrigin, checkPassword };
