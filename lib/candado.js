// Candado de acceso a todo el sitio (autenticación básica HTTP).
// Solo se activa si existe la variable ACCESO_CLAVE. Sin ella, la web queda abierta como siempre.
// Nota: sin HTTPS la clave viaja sin cifrar; sirve para disuadir curiosos, no como seguridad definitiva.
const crypto = require('crypto');

const usuario = process.env.ACCESO_USUARIO || 'Julio';
const clave = process.env.ACCESO_CLAVE || '';

function igual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function candado(req, res, next) {
  if (!clave) return next();
  // Stripe no puede escribir una clave: su webhook se valida con su propia firma.
  if (req.path === '/webhook/stripe') return next();
  const cab = req.headers.authorization || '';
  if (cab.startsWith('Basic ')) {
    const texto = Buffer.from(cab.slice(6), 'base64').toString('utf8');
    const i = texto.indexOf(':');
    if (i >= 0 && igual(texto.slice(0, i), usuario) && igual(texto.slice(i + 1), clave)) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Acceso restringido", charset="UTF-8"');
  res.status(401).send('Acceso restringido');
}

module.exports = { candado, activo: Boolean(clave) };
