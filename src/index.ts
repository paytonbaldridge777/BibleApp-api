          import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

type SpiritualProfile = {
  user_id: string;
  bible_experience_level?: string | null;
  main_struggles?: string[] | null;
  current_needs?: string[] | null;
  preferred_content_types?: string[] | null;
  tone_preference?: string | null;
  devotional_length?: string | null;
  profile_summary?: string | null;
  caution_flags?: string[] | null;
};

type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
};

type PassageRow = {
  id: string;
  reference: string;
  text: string;
  devotional_summary?: string | null;
  caution_notes?: string | null;
  translation?: string | null;
  testament?: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function mapProfileValueToThemeSlug(value: string): string | null {
  const slug = normalizeSlug(value);

  const aliasMap: Record<string, string> = {
    peace: 'peace',
    calm: 'peace',
    stress: 'peace',

    anxiety: 'anxiety',
    worry: 'anxiety',
    overwhelmed: 'anxiety',

    hope: 'hope',
    discouragement: 'hope',
    encouragement: 'hope',

    fear: 'fear',
    afraid: 'fear',
    courage: 'fear',

    grief: 'grief',
    loss: 'grief',
    sorrow: 'grief',

    loneliness: 'loneliness',
    alone: 'loneliness',

    forgiveness: 'forgiveness',
    guilt: 'forgiveness',
    shame: 'forgiveness',

    wisdom: 'wisdom',
    discernment: 'wisdom',
    decisions: 'wisdom',
    decision_making: 'wisdom',

    purpose: 'purpose',
    calling: 'purpose',
    meaning: 'purpose',

    temptation: 'temptation',
    temptation_struggle: 'temptation',

    spiritual_growth: 'spiritual_growth',
    growth: 'spiritual_growth',
    maturity: 'spiritual_growth',

    addiction: 'addiction_strongholds',
    strongholds: 'addiction_strongholds',
    addiction_strongholds: 'addiction_strongholds',

    prayer: 'prayer',

    trust: 'trust',
    uncertainty: 'trust',

    endurance: 'endurance',
    perseverance: 'endurance',
    waiting: 'endurance',
  };

  return aliasMap[slug] ?? slug ?? null;
}

function inferThemeSlugs(profile: SpiritualProfile): string[] {
  const rawValues = [
    ...(profile.main_struggles ?? []),
    ...(profile.current_needs ?? []),
  ];

  const mapped = rawValues
    .map(mapProfileValueToThemeSlug)
    .filter((v): v is string => Boolean(v));

  const defaults = ['peace', 'hope', 'trust', 'prayer'];

  return uniq([...mapped, ...defaults]);
}

function buildFallbackGuidance(args: {
  theme: ThemeRow;
  passage: PassageRow;
  profile: SpiritualProfile;
}) {
  const { theme, passage, profile } = args;

  const tone = profile.tone_preference || 'gentle';
  const summary =
    passage.devotional_summary ||
    `This passage speaks into seasons where ${theme.name.toLowerCase()} is especially needed.`;

  const title = `${theme.name}: ${passage.reference}`;

  const devotionalText =
    `${summary}\n\n` +
    `Today’s focus is ${theme.name.toLowerCase()}. ` +
    `As you reflect on ${passage.reference}, notice what this verse reveals about God’s character and care. ` +
    `Rather than trying to carry everything alone, let this truth slow you down and re-center your heart in God’s presence.\n\n` +
    `Scripture: "${passage.text}"`;

  const prayerText =
    tone === 'direct'
      ? `God, thank You for Your Word. Help me live the truth of ${passage.reference} today. Strengthen me where I am weak, guide my thoughts, and teach me to trust You more. Amen.`
      : `Lord, thank You for meeting me in this moment. Through ${passage.reference}, remind me that I am not alone. Calm my heart, guide my thoughts, and help me walk closely with You today. Amen.`;

  const reflectionQuestion =
    `What would it look like to live out ${passage.reference} in one specific way today?`;

  return {
    title,
    devotional_text: devotionalText,
    prayer_text: prayerText,
    reflection_question: reflectionQuestion,
  };
}

async function generateWithOpenAI(args: {
  env: Env;
  theme: ThemeRow;
  passage: PassageRow;
  profile: SpiritualProfile;
}) {
  if (!args.env.OPENAI_API_KEY) return null;

  const openai = new OpenAI({ apiKey: args.env.OPENAI_API_KEY });

  const prompt = `
You are writing a short Christian devotional for a Bible guidance app.

Return valid JSON only with this exact shape:
{
  "title": string,
  "devotional_text": string,
  "prayer_text": string,
  "reflection_question": string
}

Rules:
- Be biblically grounded and pastoral.
- Be encouraging, calm, and clear.
- Do not be preachy, manipulative, or overly dramatic.
- Keep devotional_text to about 120-180 words.
- Keep prayer_text to 40-80 words.
- Keep reflection_question to one sentence.
- Use the scripture passage naturally.
- Do not mention denominations.
- Do not include markdown.

User profile:
${JSON.stringify(args.profile, null, 2)}

Theme:
${JSON.stringify(args.theme, null, 2)}

Passage:
${JSON.stringify(args.passage, null, 2)}
`.trim();

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
  });

  const text = response.output_text?.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
          try {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader) {
          return json({ error: 'Missing authorization header' }, { status: 401, headers: cors });
          }
          
          const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
            global: {
              headers: {
                Authorization: authHeader,
              },
            },
          });
          
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();
          
          if (userError || !user) {
            return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
          }
          
          const { data: guidance, error: guidanceError } = await supabase
            .from('daily_guidance')
            .select('*')
            .eq('user_id', user.id)
            .order('guidance_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (guidanceError) {
            return json({ error: guidanceError.message }, { status: 500, headers: cors });
          }
          
          if (!guidance) {
            return json(
              {
                guidance: null,
                passage: null,
                matched_theme: null,
              },
              { headers: cors }
            );
          }
          
          let passage = null;
          if (guidance.passage_id) {
            const { data: passageData, error: passageError } = await supabase
              .from('scripture_passages')
              .select('id, reference, text, translation')
              .eq('id', guidance.passage_id)
              .maybeSingle();
          
            if (passageError) {
              return json({ error: passageError.message }, { status: 500, headers: cors });
            }
          
            passage = passageData;
          }
          
          let matchedTheme = null;
          if (guidance.theme_id) {
            const { data: themeData, error: themeError } = await supabase
              .from('scripture_themes')
              .select('id, slug, name')
              .eq('id', guidance.theme_id)
              .maybeSingle();
          
            if (themeError) {
              return json({ error: themeError.message }, { status: 500, headers: cors });
            }
          
            matchedTheme = themeData;
          }
          
          return json(
            {
              guidance,
              passage,
              matched_theme: matchedTheme,
            },
            { headers: cors }
          );
          
          } catch (err) {
          return json(
          {
          error: err instanceof Error ? err.message : 'Failed to fetch guidance',
          },
          { status: 500, headers: cors }
          );
          }
    }
    
    if (request.method === 'POST' && path === '/guidance') {
      try {
        const token = getBearerToken(request);
        if (!token) {
          return json({ error: 'Missing bearer token' }, { status: 401, headers: cors });
        }
    
        const supabase = supabaseForUser(env, token);
    
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
    
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
        }
    
        let body: { mode?: 'generate' | 'regenerate'; action?: 'generate' | 'regenerate' } = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
    
        const requestedMode = body.mode || body.action;
        const mode = requestedMode === 'regenerate' ? 'regenerate' : 'generate';
        const guidanceDate = todayIsoDate();
    
        if (mode === 'generate') {
        const { data: existing } = await supabase
        .from('daily_guidance')
        .select('*')
        .eq('user_id', user.id)
        .eq('guidance_date', guidanceDate)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
        if (existing) {
        let matchedTheme = null;
        let passage = null;
        
        if (existing.theme_id) {
          const { data: themeData } = await supabase
            .from('scripture_themes')
            .select('id, slug, name')
            .eq('id', existing.theme_id)
            .maybeSingle();
        
          if (themeData) {
            matchedTheme = themeData;
          }
        }
        
        if (existing.passage_id) {
          const { data: passageData } = await supabase
            .from('scripture_passages')
            .select('id, reference, text, translation')
            .eq('id', existing.passage_id)
            .maybeSingle();
        
          if (passageData) {
            passage = passageData;
          }
        }
        
        return json(
          {
            guidance: existing,
            matched_theme: matchedTheme,
            passage,
          },
          { headers: cors }
        );
        
        }
        }
    
        const { data: profile, error: profileError } = await supabase
          .from('spiritual_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
    
        if (profileError) {
          return json({ error: 'Failed to load spiritual profile' }, { status: 500, headers: cors });
        }
    
        if (!profile) {
          return json(
            { error: 'No spiritual profile found. Please complete onboarding first.' },
            { status: 400, headers: cors }
          );
        }
    
        const themeSlugs = inferThemeSlugs(profile as SpiritualProfile);
    
        const { data: themes, error: themesError } = await supabase
          .from('scripture_themes')
          .select('id, slug, name, description')
          .in('slug', themeSlugs);
    
        if (themesError || !themes || themes.length === 0) {
          return json({ error: 'No matching scripture themes found' }, { status: 500, headers: cors });
        }
    
        const themesBySlug = new Map((themes as ThemeRow[]).map((t) => [t.slug, t]));
        const orderedThemes = themeSlugs
          .map((slug) => themesBySlug.get(slug))
          .filter((t): t is ThemeRow => Boolean(t));
    
        let selectedTheme: ThemeRow | null = null;
        let selectedPassage: PassageRow | null = null;
    
        for (const theme of orderedThemes) {
          const { data: mappings, error: mappingError } = await supabase
            .from('scripture_theme_map')
            .select(`
              passage_id,
              scripture_passages (
                id,
                reference,
                text,
                devotional_summary,
                caution_notes,
                translation,
                testament
              )
            `)
            .eq('theme_id', theme.id)
            .limit(10);
    
          if (mappingError || !mappings || mappings.length === 0) {
            continue;
          }
    
          const passages = mappings
            .map((m: any) => m.scripture_passages)
            .filter(Boolean) as PassageRow[];
    
          if (passages.length === 0) continue;
    
          const randomIndex = Math.floor(Math.random() * passages.length);
          selectedTheme = theme;
          selectedPassage = passages[randomIndex];
          break;
        }
    
        if (!selectedTheme || !selectedPassage) {
          return json(
            { error: 'No scripture passage found for the matched themes yet' },
            { status: 500, headers: cors }
          );
        }
    
        let generated = await generateWithOpenAI({
          env,
          theme: selectedTheme,
          passage: selectedPassage,
          profile: profile as SpiritualProfile,
        });
    
        if (
          !generated ||
          !generated.title ||
          !generated.devotional_text ||
          !generated.prayer_text ||
          !generated.reflection_question
        ) {
          generated = buildFallbackGuidance({
            theme: selectedTheme,
            passage: selectedPassage,
            profile: profile as SpiritualProfile,
          });
        }
    
        const insertPayload = {
          user_id: user.id,
          theme_id: selectedTheme.id,
          passage_id: selectedPassage.id,
          guidance_date: guidanceDate,
          title: generated.title,
          devotional_text: generated.devotional_text,
          prayer_text: generated.prayer_text,
          reflection_question: generated.reflection_question,
        };
        
        let savedGuidance = null;
          let saveError = null;
          
          if (mode === 'regenerate') {
          const { data, error } = await supabase
          .from('daily_guidance')
          .upsert(insertPayload, {
          onConflict: 'user_id,guidance_date',
          ignoreDuplicates: false,
          })
          .select('*')
          .single();
          
          savedGuidance = data;
          saveError = error;
          } else {
          const { data, error } = await supabase
          .from('daily_guidance')
          .insert(insertPayload)
          .select('*')
          .single();
          
          savedGuidance = data;
          saveError = error;
          }
          
          if (saveError) {
          return json(
          { error: 'Failed to save generated guidance', details: saveError.message },
          { status: 500, headers: cors }
          );
}
    
        return json(
          {
            guidance: savedGuidance,
            matched_theme: {
              id: selectedTheme.id,
              slug: selectedTheme.slug,
              name: selectedTheme.name,
            },
            passage: {
              id: selectedPassage.id,
              reference: selectedPassage.reference,
              text: selectedPassage.text,
              translation: selectedPassage.translation,
            },
          },
          { headers: cors }
        );
      } catch (error: any) {
        return json(
          { error: 'Unexpected error generating guidance', details: error?.message ?? String(error) },
          { status: 500, headers: cors }
        );
      }
    }

    if (request.method === 'POST' && path === '/feedback') {
      return json({ ok: true, note: 'feedback not yet implemented' }, { headers: cors });
    }

    return json({ error: 'Not found', path }, { status: 404, headers: cors });
  },
};
