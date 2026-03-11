import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_API_KEY?: string;
  CORS_ALLOWED_ORIGINS?: string; // comma-separated origins, e.g. https://xyz.pages.dev
};

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function parseAllowedOrigins(env: Env): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null, allowedOrigins: string[]) {
  const headers = new Headers();
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return headers;
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function supabaseForUser(env: Env, userJwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false },
  });
}

function openaiClient(env: Env): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/{2,}/g, '/');

    const origin = request.headers.get('Origin');
    const allowedOrigins = parseAllowedOrigins(env);
    const cors = corsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const token = getBearerToken(request);
    if (!token) {
      return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }

    const supabase = supabaseForUser(env, token);

  if (request.method === 'POST' && path === '/onboarding') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
    }
  
    // Identify the user from the JWT (important: don’t trust client-provided user_id)
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }
  
    const answers = {
      user_id: user.id,
      struggles: body.struggles ?? [],
      seeking: body.seeking ?? [],
      familiarity: body.familiarity ?? null,
      content_types: body.content_types ?? [],
      tone: body.tone ?? null,
      devotional_length: body.devotional_length ?? null,
      free_text: body.free_text ?? null,
      updated_at: new Date().toISOString(),
    };
  
    // 1) Save onboarding answers
    const { error: answersErr } = await supabase
      .from('onboarding_answers')
      .upsert(answers, { onConflict: 'user_id' });
  
    if (answersErr) {
      return json({ error: answersErr.message }, { status: 400, headers: cors });
    }
  
    // 2) Create/update spiritual profile (simple deterministic mapping)
    const profileSummary =
      `Seeking: ${(answers.seeking as string[]).join(', ') || 'N/A'}. ` +
      `Struggles: ${(answers.struggles as string[]).join(', ') || 'N/A'}.`;
  
    const spiritualProfile = {
      user_id: user.id,
      bible_experience_level: answers.familiarity,
      main_struggles: answers.struggles,
      current_needs: answers.seeking,
      preferred_content_types: answers.content_types,
      tone_preference: answers.tone,
      devotional_length: answers.devotional_length,
      profile_summary: profileSummary,
      caution_flags: [],
      updated_at: new Date().toISOString(),
    };
  
    const { error: spErr } = await supabase
      .from('spiritual_profiles')
      .upsert(spiritualProfile, { onConflict: 'user_id' });
  
    if (spErr) {
      return json({ error: spErr.message }, { status: 400, headers: cors });
    }
  
    // 3) Optional: mark onboarding completed
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
      .eq('id', user.id);
  
    return json({ ok: true }, { headers: cors });
  }

    if (request.method === 'GET' && path === '/guidance') {
      return json({ guidance: null, note: 'guidance GET not yet implemented' }, { headers: cors });
    }

    if (request.method === 'POST' && path === '/guidance') {
      const _openai = openaiClient(env);
      return json({ guidance: null, note: 'guidance POST not yet implemented' }, { headers: cors });
    }

    if (request.method === 'POST' && path === '/feedback') {
      return json({ ok: true, note: 'feedback not yet implemented' }, { headers: cors });
    }

    return json({ error: 'Not found', path }, { status: 404, headers: cors });
  },
};
