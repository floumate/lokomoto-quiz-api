// ============================================
// SESSIONS ROUTES
// /api/sessions/* — kreiranje i update kviz sesija
// ============================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');


// ============================================
// POST /api/sessions
// Kreira novu kviz sesiju (kad korisnik klikne "Započni kviz")
// ============================================
router.post('/', async (req, res) => {
  try {
    const {
      user_agent,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      device_type,
    } = req.body;

    // IP iz request-a (uzima u obzir proxy header-e za Railway/Vercel)
    const ip_address =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      null;

    const { data, error } = await supabase
      .from('quiz_sessions')
      .insert({
        user_agent: user_agent || req.headers['user-agent'] || null,
        referrer: referrer || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        utm_content: utm_content || null,
        utm_term: utm_term || null,
        device_type: device_type || null,
        ip_address,
        current_step: 'landing',
        current_step_number: 1,
      })
      .select('id')
      .single();

    if (error) throw error;

    // Loguj 'quiz_started' event
    await supabase.from('quiz_events').insert({
      session_id: data.id,
      event_type: 'quiz_started',
      step_number: 1,
      step_name: 'landing',
    });

    res.status(201).json({
      session_id: data.id,
      message: 'Sesija kreirana',
    });
  } catch (err) {
    console.error('POST /sessions error:', err);
    res.status(500).json({ error: 'Greška pri kreiranju sesije' });
  }
});


// ============================================
// PATCH /api/sessions/:id
// Update odgovora tokom kviza (poziva se posle svakog step-a)
// ============================================
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Whitelist polja koja smemo da update-ujemo
    // (ne dozvoljavamo da klijent menja id, started_at, is_completed itd.)
    const allowedFields = [
      'gender',
      'pain_location',
      'pain_radiates',
      'diagnosis',
      'answers',
      'pain_scale',
      'pain_duration',
      'goals',
      'name',
      'email',
      'current_step',
      'current_step_number',
    ];

    const filteredUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'Nema validnih polja za update' });
    }

    // Update sesije
    const { data, error } = await supabase
      .from('quiz_sessions')
      .update(filteredUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Sesija nije pronađena' });
      }
      throw error;
    }

    res.json({
      session_id: data.id,
      updated_fields: Object.keys(filteredUpdates),
    });
  } catch (err) {
    console.error('PATCH /sessions/:id error:', err);
    res.status(500).json({ error: 'Greška pri update-u sesije' });
  }
});


// ============================================
// POST /api/sessions/:id/complete
// Finalizuje sesiju sa lead podacima (ime + email)
// ============================================
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email je obavezan' });
    }

    // Validacija email formata (osnovna)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email nije validan' });
    }

    const { data, error } = await supabase
      .from('quiz_sessions')
      .update({
        name: name || null,
        email: email.toLowerCase().trim(),
        is_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, diagnosis, name, email')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Sesija nije pronađena' });
      }
      throw error;
    }

    // Loguj 'lead_submitted' i 'quiz_completed' event-e
    await supabase.from('quiz_events').insert([
      {
        session_id: id,
        event_type: 'lead_submitted',
        metadata: { email: data.email },
      },
      {
        session_id: id,
        event_type: 'quiz_completed',
      },
    ]);

    res.json({
      session_id: data.id,
      diagnosis: data.diagnosis,
      message: 'Sesija uspešno kompletirana',
    });
  } catch (err) {
    console.error('POST /sessions/:id/complete error:', err);
    res.status(500).json({ error: 'Greška pri kompletiranju sesije' });
  }
});


module.exports = router;