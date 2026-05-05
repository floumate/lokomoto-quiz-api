// ============================================
// EVENTS ROUTES
// /api/events — granularno logovanje za drop-off tracking
// ============================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');


// ============================================
// POST /api/events
// Loguje event tokom kviza (step_viewed, step_completed, itd.)
// ============================================
router.post('/', async (req, res) => {
  try {
    const {
      session_id,
      event_type,
      step_number,
      step_name,
      time_on_step,
      metadata,
    } = req.body;

    // Validacije
    if (!session_id) {
      return res.status(400).json({ error: 'session_id je obavezan' });
    }

    const validEventTypes = [
      'quiz_started',
      'step_viewed',
      'step_completed',
      'quiz_completed',
      'quiz_abandoned',
      'lead_submitted',
    ];

    if (!event_type || !validEventTypes.includes(event_type)) {
      return res.status(400).json({
        error: 'Nevalidan event_type',
        allowed: validEventTypes,
      });
    }

    const { error } = await supabase.from('quiz_events').insert({
      session_id,
      event_type,
      step_number: step_number || null,
      step_name: step_name || null,
      time_on_step: time_on_step || null,
      metadata: metadata || {},
    });

    if (error) throw error;

    res.status(201).json({ logged: true });
  } catch (err) {
    console.error('POST /events error:', err);
    res.status(500).json({ error: 'Greška pri logovanju event-a' });
  }
});


module.exports = router;