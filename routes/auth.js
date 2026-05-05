// ============================================
// AUTH ROUTES
// /api/auth/* — login, register, me
// ============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '7d'; // Token važi 7 dana


// Rate limiter za login (sprečava brute-force napade)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuta
  max: 5, // max 5 pokušaja sa istog IP-a u 15 min
  message: { error: 'Previše pokušaja prijave, sačekaj 15 minuta.' },
  standardHeaders: true,
  legacyHeaders: false,
});


// ============================================
// POST /api/auth/login
// Prijava korisnika - vraća JWT token
// ============================================
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email i password su obavezni' });
    }

    // Pronađi korisnika
    const { data: user, error } = await supabase
      .from('dashboard_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    if (error || !user) {
      // Generička poruka da napadač ne zna da li email postoji
      return res.status(401).json({ error: 'Pogrešan email ili password' });
    }

    // Proveri password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Pogrešan email ili password' });
    }

    // Generiši JWT token
    const token = jwt.sign(
      {
        user_id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Update last_login_at
    await supabase
      .from('dashboard_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('POST /auth/login error:', err);
    res.status(500).json({ error: 'Greška pri prijavi' });
  }
});


// ============================================
// GET /api/auth/me
// Vraća podatke o trenutno ulogovanom korisniku
// ============================================
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('dashboard_users')
      .select('id, email, name, role, last_login_at, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Korisnik nije pronađen' });
    }

    res.json({ user });
  } catch (err) {
    console.error('GET /auth/me error:', err);
    res.status(500).json({ error: 'Greška pri dobavljanju podataka' });
  }
});


// ============================================
// POST /api/auth/register
// Kreira novog korisnika - SAMO admin može
// ============================================
router.post('/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email i password su obavezni' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password mora biti najmanje 8 karaktera' });
    }

    const validRoles = ['admin', 'client'];
    const userRole = validRoles.includes(role) ? role : 'client';

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const { data: newUser, error } = await supabase
      .from('dashboard_users')
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name: name || null,
        role: userRole,
      })
      .select('id, email, name, role, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Email već postoji' });
      }
      throw error;
    }

    res.status(201).json({ user: newUser });
  } catch (err) {
    console.error('POST /auth/register error:', err);
    res.status(500).json({ error: 'Greška pri kreiranju korisnika' });
  }
});


module.exports = router;