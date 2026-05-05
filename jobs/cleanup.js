// ============================================
// CLEANUP JOBS
// Cron job-ovi za održavanje baze
// ============================================

const cron = require('node-cron');
const supabase = require('../lib/supabase');

const ABANDONED_AFTER_MINUTES = 30;


// Označava sesije kao napuštene ako su neaktivne duže od 30 minuta
async function markAbandonedSessions() {
  try {
    const cutoff = new Date(Date.now() - ABANDONED_AFTER_MINUTES * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('quiz_sessions')
      .update({ is_abandoned: true })
      .eq('is_completed', false)
      .eq('is_abandoned', false)
      .lt('last_activity_at', cutoff)
      .select('id');

    if (error) {
      console.error('Cleanup error:', error.message);
      return;
    }

    if (data && data.length > 0) {
      console.log(`[Cleanup] Označeno ${data.length} sesija kao napuštene`);

      // Loguj 'quiz_abandoned' event za svaku
      const events = data.map(session => ({
        session_id: session.id,
        event_type: 'quiz_abandoned',
      }));

      await supabase.from('quiz_events').insert(events);
    }
  } catch (err) {
    console.error('Cleanup exception:', err);
  }
}


// Pokreće cron job-ove
function startCronJobs() {
  // Svakih 15 minuta
  cron.schedule('*/15 * * * *', () => {
    console.log('[Cron] Pokretanje cleanup-a abandoned sesija...');
    markAbandonedSessions();
  });

  console.log('⏰ Cron jobs aktivni: cleanup svakih 15 min');

  // Pokreni jednom odmah pri startu (opciono)
  markAbandonedSessions();
}


module.exports = { startCronJobs, markAbandonedSessions };