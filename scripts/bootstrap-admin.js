// ============================================
// BOOTSTRAP ADMIN
// Kreira prvog admin korisnika
// Pokrenuti SAMO JEDNOM: node scripts/bootstrap-admin.js
// ============================================

require('dotenv').config();

const bcrypt = require('bcryptjs');
const readline = require('readline');
const supabase = require('../lib/supabase');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('\n🔐 Bootstrap Admin User\n');

  const email = (await ask('Email: ')).trim().toLowerCase();
  const name = (await ask('Ime: ')).trim();
  const password = await ask('Password (min 8 karaktera): ');

  rl.close();

  if (!email || !password) {
    console.error('❌ Email i password su obavezni.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Password mora biti najmanje 8 karaktera.');
    process.exit(1);
  }

  // Proveri da li email već postoji
  const { data: existing } = await supabase
    .from('dashboard_users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) {
    console.error(`❌ Korisnik sa email-om "${email}" već postoji.`);
    process.exit(1);
  }

  console.log('\n⏳ Hash-ujem password...');
  const passwordHash = await bcrypt.hash(password, 10);

  console.log('⏳ Kreiram admin korisnika...');
  const { data: newUser, error } = await supabase
    .from('dashboard_users')
    .insert({
      email,
      password_hash: passwordHash,
      name: name || null,
      role: 'admin',
    })
    .select('id, email, name, role, created_at')
    .single();

  if (error) {
    console.error('❌ Greška:', error.message);
    process.exit(1);
  }

  console.log('\n✅ Admin korisnik uspešno kreiran:\n');
  console.log(`   ID:    ${newUser.id}`);
  console.log(`   Email: ${newUser.email}`);
  console.log(`   Ime:   ${newUser.name}`);
  console.log(`   Role:  ${newUser.role}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Greška:', err);
  process.exit(1);
});