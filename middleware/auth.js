// ============================================
// AUTH MIDDLEWARE
// Proverava JWT token na zaštićenim rutama
// ============================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET nije postavljen u .env fajlu');
}


// Middleware: proverava da li je korisnik ulogovan
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Nije ulogovan' });
    }

    const token = authHeader.substring(7); // Skida "Bearer "

    const decoded = jwt.verify(token, JWT_SECRET);

    // Token je validan, dodaj user info na request
    req.user = {
      id: decoded.user_id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token istekao, prijavi se ponovo' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Nevalidan token' });
    }
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Greška pri autentifikaciji' });
  }
}


// Middleware: zahteva admin rolu
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Nije ulogovan' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Pristup dozvoljen samo administratorima' });
  }
  next();
}


module.exports = {
  requireAuth,
  requireAdmin,
};