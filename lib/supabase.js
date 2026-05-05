// ============================================
// SUPABASE CLIENT
// Centralizovan client za komunikaciju sa Supabase
// ============================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Nedostaju Supabase env varijable. Proveri SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY u .env fajlu.'
  );
}

// Service role client - bypass-uje RLS, ima pun pristup bazi
// Koristi se SAMO u backend-u, NIKAD u frontend-u
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = supabase;