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
    const origin = request.headers.get('Origin');
    const allowedOrigins = parseAllowedOrigins(env);
    const cors = corsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Require Supabase user JWT
    const token = getBearerToken(request);
    if (!token) {
      return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }

    const supabase = supabaseForUser(env, token);

    // Basic routing
    if (request.method === 'POST' && url.pathname === '/onboarding') {
      // TODO: implement to match your former Next route logic
      return json({ ok: true, note: 'onboarding not yet implemented' }, { headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/guidance') {
      // TODO: implement fetch today guidance
      return json({ guidance: null, note: 'guidance GET not yet implemented' }, { headers: cors });
    }

    if (request.method === 'POST' && url.pathname === '/guidance') {
      // TODO: implement generate/regenerate, using OpenAI optionally
      const _openai = openaiClient(env);
      return json({ guidance: null, note: 'guidance POST not yet implemented' }, { headers: cors });
    }

    if (request.method === 'POST' && url.pathname === '/feedback') {
      // TODO: implement feedback write
      return json({ ok: true, note: 'feedback not yet implemented' }, { headers: cors });
    }

    return json({ error: 'Not found' }, { status: 404, headers: cors });
  },
};