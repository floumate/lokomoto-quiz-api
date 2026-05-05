// ============================================
// DASHBOARD ROUTES
// /api/dashboard/* — analitika za klijenta
// Sve rute zahtevaju autentifikaciju
// ============================================

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

// Sve rute u ovom fajlu zahtevaju login
router.use(requireAuth);


// ============================================
// GET /api/dashboard/stats
// KPI cards: ukupno sesija, kompletiranih, conversion rate, prosečno vreme
// Query params: from, to (ISO datumi, opciono)
// ============================================
router.get('/stats', async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = supabase.from('quiz_sessions').select('*', { count: 'exact' });

    if (from) query = query.gte('started_at', from);
    if (to) query = query.lte('started_at', to);

    const { data: sessions, error, count } = await query;
    if (error) throw error;

    const total = count || 0;
    const completed = sessions.filter(s => s.is_completed).length;
    const abandoned = sessions.filter(s => s.is_abandoned).length;
    const inProgress = total - completed - abandoned;

    const conversionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

    // Prosečno vreme za kompletirane sesije (od started_at do completed_at)
    const completedSessions = sessions.filter(s => s.is_completed && s.completed_at);
    const avgTimeSeconds = completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce((sum, s) => {
            const diff = (new Date(s.completed_at) - new Date(s.started_at)) / 1000;
            return sum + diff;
          }, 0) / completedSessions.length
        )
      : 0;

    // Breakdown po dijagnozi
    const byDiagnosis = {
      muscle: completedSessions.filter(s => s.diagnosis === 'muscle').length,
      hernia: completedSessions.filter(s => s.diagnosis === 'hernia').length,
    };

    // Breakdown po polu
    const byGender = {
      male: completedSessions.filter(s => s.gender === 'male').length,
      female: completedSessions.filter(s => s.gender === 'female').length,
    };

    // Breakdown po lokaciji bola
    const byPainLocation = {
      neck: completedSessions.filter(s => s.pain_location === 'neck').length,
      middle: completedSessions.filter(s => s.pain_location === 'middle').length,
      lower: completedSessions.filter(s => s.pain_location === 'lower').length,
    };

    res.json({
      total,
      completed,
      abandoned,
      in_progress: inProgress,
      conversion_rate: parseFloat(conversionRate),
      avg_time_seconds: avgTimeSeconds,
      breakdown: {
        by_diagnosis: byDiagnosis,
        by_gender: byGender,
        by_pain_location: byPainLocation,
      },
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error('GET /dashboard/stats error:', err);
    res.status(500).json({ error: 'Greška pri dobavljanju statistika' });
  }
});


// ============================================
// GET /api/dashboard/funnel
// Drop-off po koraku - koliko ljudi je videlo svaki step i koliko ih je završilo
// ============================================
router.get('/funnel', async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = supabase.from('quiz_events').select('*');

    if (from) query = query.gte('timestamp', from);
    if (to) query = query.lte('timestamp', to);

    const { data: events, error } = await query;
    if (error) throw error;

    // Grupisanje po step_number
    const stepMap = new Map();

    for (const event of events) {
      if (!event.step_number) continue;

      if (!stepMap.has(event.step_number)) {
        stepMap.set(event.step_number, {
          step_number: event.step_number,
          step_name: event.step_name,
          views: new Set(),
          completions: new Set(),
        });
      }

      const step = stepMap.get(event.step_number);

      if (event.event_type === 'step_viewed') {
        step.views.add(event.session_id);
      }
      if (event.event_type === 'step_completed') {
        step.completions.add(event.session_id);
      }
    }

    // Pretvori u array i izračunaj statistiku
    const steps = Array.from(stepMap.values())
      .sort((a, b) => a.step_number - b.step_number)
      .map(step => {
        const viewCount = step.views.size;
        const completionCount = step.completions.size;
        const dropOff = viewCount - completionCount;
        const completionRate = viewCount > 0
          ? parseFloat(((completionCount / viewCount) * 100).toFixed(1))
          : 0;

        return {
          step_number: step.step_number,
          step_name: step.step_name,
          views: viewCount,
          completions: completionCount,
          drop_off: dropOff,
          completion_rate: completionRate,
        };
      });

    res.json({
      steps,
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error('GET /dashboard/funnel error:', err);
    res.status(500).json({ error: 'Greška pri dobavljanju funnel statistika' });
  }
});


// ============================================
// GET /api/dashboard/sessions
// Lista svih sesija sa filterima i paginacijom
// Query params: page, limit, status, diagnosis, gender, pain_location, from, to
// ============================================
router.get('/sessions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const offset = (page - 1) * limit;

    const { status, diagnosis, gender, pain_location, from, to, search } = req.query;

    let query = supabase
      .from('quiz_sessions')
      .select('*', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filteri
    if (status === 'completed') query = query.eq('is_completed', true);
    if (status === 'abandoned') query = query.eq('is_abandoned', true);
    if (status === 'in_progress') {
      query = query.eq('is_completed', false).eq('is_abandoned', false);
    }
    if (diagnosis) query = query.eq('diagnosis', diagnosis);
    if (gender) query = query.eq('gender', gender);
    if (pain_location) query = query.eq('pain_location', pain_location);
    if (from) query = query.gte('started_at', from);
    if (to) query = query.lte('started_at', to);
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      sessions: data,
      pagination: {
        page,
        limit,
        total: count,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error('GET /dashboard/sessions error:', err);
    res.status(500).json({ error: 'Greška pri dobavljanju sesija' });
  }
});


// ============================================
// GET /api/dashboard/sessions/:id
// Detalji jedne sesije + svi event-i
// ============================================
router.get('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionError) {
      if (sessionError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Sesija nije pronađena' });
      }
      throw sessionError;
    }

    const { data: events, error: eventsError } = await supabase
      .from('quiz_events')
      .select('*')
      .eq('session_id', id)
      .order('timestamp', { ascending: true });

    if (eventsError) throw eventsError;

    res.json({ session, events });
  } catch (err) {
    console.error('GET /dashboard/sessions/:id error:', err);
    res.status(500).json({ error: 'Greška pri dobavljanju sesije' });
  }
});


// ============================================
// GET /api/dashboard/leads
// Samo kompletirane sesije sa email-om (lista leadova)
// ============================================
router.get('/leads', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const offset = (page - 1) * limit;

    const { from, to, diagnosis, search } = req.query;

    let query = supabase
      .from('quiz_sessions')
      .select(
        'id, name, email, gender, pain_location, diagnosis, pain_scale, pain_duration, completed_at, started_at, utm_source, utm_campaign',
        { count: 'exact' }
      )
      .eq('is_completed', true)
      .not('email', 'is', null)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (diagnosis) query = query.eq('diagnosis', diagnosis);
    if (from) query = query.gte('completed_at', from);
    if (to) query = query.lte('completed_at', to);
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      leads: data,
      pagination: {
        page,
        limit,
        total: count,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error('GET /dashboard/leads error:', err);
    res.status(500).json({ error: 'Greška pri dobavljanju leadova' });
  }
});


// ============================================
// GET /api/dashboard/leads/export
// CSV export svih leadova
// ============================================
router.get('/leads/export', async (req, res) => {
  try {
    const { from, to, diagnosis } = req.query;

    let query = supabase
      .from('quiz_sessions')
      .select('*')
      .eq('is_completed', true)
      .not('email', 'is', null)
      .order('completed_at', { ascending: false });

    if (diagnosis) query = query.eq('diagnosis', diagnosis);
    if (from) query = query.gte('completed_at', from);
    if (to) query = query.lte('completed_at', to);

    const { data, error } = await query;
    if (error) throw error;

    // CSV header
    const headers = [
      'ID', 'Ime', 'Email', 'Pol', 'Lokacija bola', 'Dijagnoza',
      'Skala bola', 'Trajanje', 'Datum', 'UTM Source', 'UTM Campaign',
    ];

    // CSV redovi
    const rows = data.map(s => [
      s.id,
      s.name || '',
      s.email || '',
      s.gender || '',
      s.pain_location || '',
      s.diagnosis || '',
      s.pain_scale || '',
      s.pain_duration || '',
      s.completed_at || '',
      s.utm_source || '',
      s.utm_campaign || '',
    ]);

    // Escape vrednosti za CSV (ako sadrže zarez ili navodnik)
    const escape = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(escape).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lokomoto-leads-${new Date().toISOString().split('T')[0]}.csv"`
    );
    res.send('\uFEFF' + csv); // BOM za Excel UTF-8 podršku
  } catch (err) {
    console.error('GET /dashboard/leads/export error:', err);
    res.status(500).json({ error: 'Greška pri export-u' });
  }
});


module.exports = router;