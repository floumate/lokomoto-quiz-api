// ============================================
// LOKOMOTO QUIZ API
// Backend server - Express + Supabase
// ============================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// Parse JSON request bodies
app.use(express.json({ limit: '10kb' }));

// CORS - dozvoljava komunikaciju sa frontend domain-ima
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: function (origin, callback) {
    // Dozvoli zahteve bez origin-a (npr. Postman, curl, server-to-server)
    if (!origin) return callback(null, true);

    // Wildcard - dozvoli sve origin-e
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Specifične origin liste
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`Origin ${origin} nije dozvoljen od strane CORS politike`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting - zaštita od spam-a
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuta
  max: 100, // max 100 zahteva po IP-u u 15 min
  message: { error: 'Previše zahteva, pokušaj ponovo za nekoliko minuta.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ============================================
// ROUTES
// ============================================

// Health check endpoint - za testiranje da server radi
app.get('/', (req, res) => {
  res.json({
    name: 'Lokomoto Quiz API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/events', require('./routes/events'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));

// ============================================
// ERROR HANDLING
// ============================================

// 404 - ruta ne postoji
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta ne postoji' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);

  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }

  res.status(500).json({
    error: 'Server greška',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Lokomoto Quiz API`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'production'}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   URL:  http://localhost:${PORT}`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ') || 'none'}\n`);

  // Pokreni cron job-ove (samo u produkciji ili ako je eksplicitno uključeno)
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CRON === 'true') {
    const { startCronJobs } = require('./jobs/cleanup');
    startCronJobs();
  } else {
    console.log('⏰ Cron jobs su isključeni u development modu');
    console.log('   (Da ih uključiš lokalno: dodaj ENABLE_CRON=true u .env)\n');
  }
});