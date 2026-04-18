import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

type ThemeMapRow = {
  passage_id: string;
  weight: number | null;
};

type ScripturePassageRow = {
  id: string;
  reference: string;
  book_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
};

function randomFromArray<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function weightedRandomPick<T extends { weight?: number | null }>(items: T[]): T | null {
  if (!items.length) return null;
  const normalized = items.map((item) => ({
    item,
    weight:
      Number.isFinite(Number(item.weight)) && Number(item.weight) > 0
        ? Number(item.weight)
        : 1,
  }));
  const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    return randomFromArray(items);
  }
  let roll = Math.random() * total;
  for (const entry of normalized) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.item;
    }
  }
  return normalized[normalized.length - 1]?.item ?? null;
}

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
  book_name: string;
  chapter: number;
  verse_start: number;
  verse_end?: number | null;
  devotional_summary?: string | null;
  caution_notes?: string | null;
  translation?: string | null;
  testament?: string | null;
  text?: string | null;
};

type GeneratedGuidance = {
  title: string;
  context_text: string;
  devotional_text: string;
  prayer_text: string;
  reflection_question: string;
};

type InterpretationResult = {
  context_text: string;
  application: string;
};

type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY?: string;
  CORS_ALLOWED_ORIGINS?: string;
  ASSETS: Fetcher;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type HolidayContext = {
  name: string;
  prompt: string;
};

function getHolidayContext(): HolidayContext | null {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const day = now.getDate();

  // Helper: days until a target date (negative if past)
  function daysUntil(targetMonth: number, targetDay: number): number {
    const target = new Date(now.getFullYear(), targetMonth - 1, targetDay);
    const today = new Date(now.getFullYear(), month - 1, day);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  // New Year: Dec 31 and Jan 1
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) {
    return {
      name: 'New Year',
      prompt:
        'Note: This devotional falls at the turn of the new year. Where the passage allows, let themes of renewal, God\'s faithfulness across seasons, and new beginnings naturally inform the devotional\'s framing. Do not force it if the passage does not support it.',
    };
  }

  // Advent / Christmas: Dec 1-25
  if (month === 12 && day >= 1 && day <= 25) {
    const isChristmasDay = day === 25;
    return {
      name: isChristmasDay ? 'Christmas' : 'Advent',
      prompt: isChristmasDay
        ? 'Note: Today is Christmas Day. Where the passage allows, let the reality of the Incarnation, God entering human experience in the person of Jesus, shape the devotional\'s framing. Do not force it if the passage does not support it.'
        : `Note: This devotional falls during Advent, the ${26 - day} days leading up to Christmas. Where the passage allows, let themes of waiting, anticipation, hope, and the coming of Christ naturally inform the devotional\'s framing. Do not force it if the passage does not support it.`,
    };
  }

  // Thanksgiving: the 4th Thursday of November (US)
  if (month === 11) {
    let thursdays = 0;
    let thanksgivingDay = 0;
    for (let d = 1; d <= 30; d++) {
      if (new Date(now.getFullYear(), 10, d).getDay() === 4) {
        thursdays++;
        if (thursdays === 4) { thanksgivingDay = d; break; }
      }
    }
    if (thanksgivingDay > 0 && day >= thanksgivingDay - 6 && day <= thanksgivingDay) {
      const isThanksgivingDay = day === thanksgivingDay;
      return {
        name: 'Thanksgiving',
        prompt: isThanksgivingDay
          ? 'Note: Today is Thanksgiving. Where the passage allows, let themes of gratitude, God\'s provision, and giving thanks in all circumstances naturally shape the devotional\'s framing. Do not force it if the passage does not support it.'
          : 'Note: This devotional falls in the week leading up to Thanksgiving. Where the passage allows, let themes of gratitude and recognizing God\'s faithfulness and provision naturally inform the devotional\'s framing. Do not force it if the passage does not support it.',
      };
    }
  }

  // Easter: calculated via anonymous Gregorian algorithm
  // Easter falls between March 22 and April 25
  const year = now.getFullYear();
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d2 = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, easterMonth - 1, easterDay);

  const daysToEaster = daysUntil(easterMonth, easterDay);
  // Good Friday is 2 days before Easter
  const goodFridayDate = new Date(easter);
  goodFridayDate.setDate(easter.getDate() - 2);
  const isGoodFriday = month === goodFridayDate.getMonth() + 1 && day === goodFridayDate.getDate();
  // Palm Sunday is 7 days before Easter
  // Window: Palm Sunday through Easter Sunday (Holy Week, ~10 days before)
  if (daysToEaster >= 0 && daysToEaster <= 10) {
    if (daysToEaster === 0) {
      return {
        name: 'Easter',
        prompt:
          'Note: Today is Easter Sunday. Where the passage allows, let the reality of the Resurrection, Christ risen and victorious over death, shape the devotional\'s framing. Do not force it if the passage does not support it.',
      };
    }
    if (isGoodFriday) {
      return {
        name: 'Good Friday',
        prompt:
          'Note: Today is Good Friday. Where the passage allows, let themes of sacrifice, suffering, and the cost of redemption naturally inform the devotional\'s framing. Do not force it if the passage does not support it.',
      };
    }
    return {
      name: 'Holy Week',
      prompt:
        `Note: This devotional falls during Holy Week, ${daysToEaster} day${daysToEaster === 1 ? '' : 's'} before Easter. Where the passage allows, let themes of Christ\'s final days, sacrifice, and the hope of resurrection naturally inform the devotional\'s framing. Do not force it if the passage does not support it.`,
    };
  }

  return null;
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

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function inferThemeSlugs(profile: SpiritualProfile): string[] {
  const rawValues = [...(profile.main_struggles ?? []), ...(profile.current_needs ?? [])];
  const profileSlugs = uniq(
    rawValues
      .map(mapProfileValueToThemeSlug)
      .filter((v): v is string => Boolean(v))
  );

  // Defaults are fallback only - excluded if already in profile slugs
  const defaults = ['peace', 'hope', 'trust', 'prayer'];
  const fallbackSlugs = defaults.filter((d) => !profileSlugs.includes(d));

  // Profile-matched themes always tried first (shuffled within group for variety)
  // Fallbacks only reached if no profile theme has passages
  return [...shuffleArray(profileSlugs), ...shuffleArray(fallbackSlugs)];
}

async function resolveConceptSlug(
  apiKey: string,
  contextFreeText: string,
  availableSlugs: string[]
): Promise<string | null> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `A user of a Bible devotional app has shared the following on their heart today:
"${contextFreeText}"

From the list of available scripture themes below, return ONLY the single slug that would produce the most spiritually relevant and directly helpful passage for this person's specific situation. Think carefully about the core biblical concept that would genuinely address what they described — not just keyword matching.

Available slugs:
${availableSlugs.join('\n')}

Respond with only the slug, nothing else. If none are a meaningful fit, respond with null.`,
        },
      ],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;
    if (!raw || raw === 'null') return null;
    const slug = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return availableSlugs.includes(slug) ? slug : null;
  } catch {
    return null;
  }
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

function isGeneratedGuidance(value: unknown): value is GeneratedGuidance {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.title === 'string' &&
    obj.title.trim().length > 0 &&
    typeof obj.context_text === 'string' &&
    obj.context_text.trim().length > 0 &&
    typeof obj.devotional_text === 'string' &&
    obj.devotional_text.trim().length > 0 &&
    typeof obj.prayer_text === 'string' &&
    obj.prayer_text.trim().length > 0 &&
    typeof obj.reflection_question === 'string' &&
    obj.reflection_question.trim().length > 0
  );
}

function isInterpretationResult(value: unknown): value is InterpretationResult {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.context_text === 'string' &&
    obj.context_text.trim().length > 0 &&
    typeof obj.application === 'string' &&
    obj.application.trim().length > 0
  );
}

function buildFallbackGuidance(args: {
  theme: ThemeRow;
  passage: PassageRow;
  profile: SpiritualProfile;
}): GeneratedGuidance {
  const { theme, passage, profile } = args;
  const tone = profile.tone_preference || 'gentle';
  const summary =
    passage.devotional_summary ||
    `This passage speaks into seasons where ${theme.name.toLowerCase()} is especially needed.`;

  const title = `${theme.name}: ${passage.reference}`;

  const contextText =
    `This passage comes from ${passage.book_name} ${passage.chapter} and should be read within the flow of the surrounding section, not as an isolated quote.\n\n` +
    `In Scripture, themes like ${theme.name.toLowerCase()} are often presented not merely as private comfort, but as part of God's covenant relationship with His people and His instruction for faithful living. ` +
    `Where the historical setting is not fully clear from the text alone, the safest reading is to pay close attention to the passage's literary flow, imagery, and purpose in context. ` +
    `Reading the verses around ${passage.reference} helps show how this verse functions within the larger argument, prayer, or act of worship.`;

  const devotionalText =
    `${summary}\n\n` +
    `Today's focus is ${theme.name.toLowerCase()}. ` +
    `As you reflect on ${passage.reference}, notice what this verse reveals about God's character and care. ` +
    `Rather than trying to carry everything alone, let this truth slow you down and re-center your heart in God's presence.\n\n` +
    `Scripture: "${passage.text ?? ''}"`;

  const prayerText =
    tone === 'direct'
      ? `God, thank You for Your Word. Help me live the truth of ${passage.reference} today. Strengthen me where I am weak, guide my thoughts, and teach me to trust You more. Amen.`
      : `Lord, thank You for meeting me in this moment. Through ${passage.reference}, remind me that I am not alone. Calm my heart, guide my thoughts, and help me walk closely with You today. Amen.`;

  const reflectionQuestion = `What would it look like to live out ${passage.reference} in one specific way today?`;

  return {
    title,
    context_text: contextText,
    devotional_text: devotionalText,
    prayer_text: prayerText,
    reflection_question: reflectionQuestion,
  };
}

function buildFallbackInterpretation(reference: string): InterpretationResult {
  return {
    context_text:
      `${reference} is part of the larger flow of Scripture and should be read within its surrounding context rather than in isolation. ` +
      `Understanding who is speaking, who is being addressed, and what is happening in the surrounding passage helps clarify its meaning. ` +
      `Consider reading several verses before and after this passage to understand how it fits within the author's argument or narrative. ` +
      `If the language feels unfamiliar, it may reflect ancient cultural assumptions, poetic conventions, or covenantal imagery that modern readers can miss without some background. ` +
      `Consulting a study Bible or commentary can add helpful depth to your reading of this passage.`,
    application: `This passage speaks to the universal human experience of seeking meaning, direction, and connection with God in the midst of real life. Scripture consistently meets people in the full range of human circumstance — doubt, grief, gratitude, hope, and everything in between — and passages like this one remind readers that faith is lived in concrete moments, not in the abstract. Whatever this text calls for — trust, perseverance, honest lament, or quiet worship — it extends an invitation to bring your whole self to God. Reading slowly, and returning to a passage more than once, often reveals layers that a first reading misses.`,
    
  };
}

async function generateWithClaude(args: {
  env: Env;
  theme: ThemeRow;
  passage: PassageRow;
  profile: SpiritualProfile;
  contextFreeText?: string;
  holidayContext?: HolidayContext | null;
}): Promise<GeneratedGuidance | null> {
  if (!args.env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: args.env.ANTHROPIC_API_KEY });

  const situationalContext = args.contextFreeText
    ? `
IMPORTANT - The user has shared something specific on their heart today. Prioritize this in your devotional, prayer, and reflection above all else:
"${args.contextFreeText}"
`
    : '';

  const holidayNote = !args.contextFreeText && args.holidayContext
    ? `\n${args.holidayContext.prompt}\n`
    : '';

  const prompt = `You are writing a short Christian devotional for a Bible guidance app.${situationalContext}${holidayNote}

Return valid JSON only with this exact shape:
{
  "title": string,
  "context_text": string,
  "devotional_text": string,
  "prayer_text": string,
  "reflection_question": string
}

General rules:
- Be biblically grounded and pastoral in the devotional, prayer, and reflection.
- Do not include markdown.
- Keep context_text to about 110-170 words.
- Keep devotional_text to about 120-180 words.
- Keep prayer_text to 40-80 words.
- Keep reflection_question to one sentence.
- Do not use em dashes (—) anywhere in your response. Use commas, semicolons, or rewrite the sentence instead.

context_text rules:
- context_text must be informational, not devotional.
- Do NOT encourage, comfort, exhort, or apply the verse personally in context_text.
- Do NOT repeat the devotional in different words.
- Do more than summarize the nearby verses.
- Focus on biblical, literary, covenantal, and cultural context when reasonably supported by the passage.
- Prioritize what the original audience, worshiping community, or first hearers would likely have understood.
- When relevant, explain meaningful imagery, symbolism, worship language, covenant themes, or ancient assumptions that modern readers may miss.
- Include at least one concrete insight that adds depth beyond paraphrase.
- Prefer this order when possible: 1. who is speaking or writing 2. who is being addressed 3. what is happening in the surrounding passage 4. important cultural, covenantal, literary, or historical background that is reasonably well-established 5. how this verse functions in the flow of the passage
- If something is uncertain or debated, say so briefly and plainly.
- Do not invent details.
- Do not overstate scholarly interpretations as fact.
- Avoid generic phrases like "this reminds us," "this encourages believers," or "we can trust" in context_text.
- Write with depth and clarity, like a strong biblical study note for an intelligent modern reader, not a shallow summary.

devotional_text rules:
- devotional_text should be the personal, pastoral application section.
- It may encourage, comfort, and apply the truth of the passage to the reader.
- When the user has shared something specific on their heart, identify and name a concrete biblical concept, 
  word, or principle from the passage that speaks directly to their situation. Name it explicitly early in 
  the devotional (e.g. "The Hebrew word selah...", "The biblical concept of kairos...", "What Scripture 
  calls 'stedfast love'..."). Then build the application from that named anchor rather than from the 
  passage narrative alone.

User profile:
${JSON.stringify(args.profile, null, 2)}

Theme:
${JSON.stringify(args.theme, null, 2)}

Passage:
${JSON.stringify(args.passage, null, 2)}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text =
    response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;
  if (!text) {
    console.log('[Claude] No text content received');
    return null;
  }

  try {
    const parsed = JSON.parse(stripCodeFences(text));
    return isGeneratedGuidance(parsed) ? parsed : null;
  } catch (e) {
    console.log('[Claude] JSON parse failed:', e);
    return null;
  }
}

async function generateInterpretationWithClaude(args: {
  env: Env;
  reference: string;
  text: string;
}): Promise<InterpretationResult | null> {
  if (!args.env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: args.env.ANTHROPIC_API_KEY });

  const prompt = `You are a biblical scholar writing a study note for a Bible app. A user has requested help understanding a specific passage.

Passage: ${args.reference}
Text: "${args.text}"

Return valid JSON only with this exact shape:
{
  "context_text": string,
  "application": string
}

Rules:
- Do not include markdown.
- Do not use em dashes (—) anywhere in your response. Use commas, semicolons, or rewrite the sentence instead.
- Keep context_text to 150-220 words.
- Keep reflection_question to one sentence.

context_text rules:
- Be informational and scholarly, not devotional. Do not encourage, comfort, or exhort the reader.
- Explain who is speaking or writing, who is being addressed, and what is happening in the surrounding passage.
- Include relevant cultural, covenantal, literary, or historical background that a modern reader would likely miss.
- Explain any imagery, symbolism, or language that may be unclear.
- If something is uncertain or debated among scholars, say so briefly and plainly.
- Do not invent details or overstate interpretations as fact.
- Avoid generic phrases like "this reminds us" or "we can trust."
- Write like a strong biblical study note for an intelligent modern reader.

application rules:
- Write a generalized, non-personalized paragraph of 80–120 words.
- This is not a question. It is a brief, pastoral reflection on how this passage speaks to human experience in general.
- Do not tailor it to any specific user's struggles or profile.
- It should feel like a thoughtful study Bible note — honest, grounded, and accessible to any reader.
- Do not use phrases like "you should" or "you need to." Prefer "this passage invites," "readers are reminded," or similar.
- Do not repeat the context_text. Application should go beyond historical background into meaning and significance.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const text =
    response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;
  if (!text) return null;

  try {
    const parsed = JSON.parse(stripCodeFences(text));
    return isInterpretationResult(parsed) ? parsed : null;
  } catch (e) {
    console.log('[Claude Interpret] JSON parse failed:', e);
    return null;
  }
}

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
  headers.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return headers;
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function supabaseForUser(env: Env, userJwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false },
  });
}

async function loadGuidanceRelatedData(
  env: Env,
  supabase: ReturnType<typeof createClient>,
  guidance: any
) {
  let passage = null;
  let matchedTheme = null;

  if (guidance?.passage_id) {
    const { data: passageData } = await supabase
      .from('scripture_passages')
      .select(
        'id, reference, book_name, chapter, verse_start, verse_end, translation, testament'
      )
      .eq('id', guidance.passage_id)
      .maybeSingle();

    if (passageData) {
      let text: string;
      try {
        text = await resolvePassageText(env, passageData);
      } catch {
        text = (guidance as any).verse_text ?? '';
      }
      passage = {
        ...passageData,
        text,
      };
    }
  }

  if (guidance?.theme_id) {
    const { data: themeData } = await supabase
      .from('scripture_themes')
      .select('id, slug, name')
      .eq('id', guidance.theme_id)
      .maybeSingle();
    matchedTheme = themeData ?? null;
  }

  return { passage, matched_theme: matchedTheme };
}

let bibleLookupPromise: Promise<Record<string, string>> | null = null;

const BOOK_KEY_ALIASES: Record<string, string> = {
  psalms: 'psalm',
};

function normalizeBookKey(value: string): string {
  const key = value.toLowerCase().trim().replace(/\s+/g, '_');
  return BOOK_KEY_ALIASES[key] ?? key;
}

async function loadBibleLookup(env: Env): Promise<Record<string, string>> {
  if (!bibleLookupPromise) {
    bibleLookupPromise = (async () => {
      const response = await env.ASSETS.fetch('https://assets.local/data/web-lookup.json');
      if (!response.ok) {
        throw new Error(`Failed to load Bible lookup asset: ${response.status}`);
      }
      return (await response.json()) as Record<string, string>;
    })();
  }
  return bibleLookupPromise;
}

async function resolvePassageText(
  env: Env,
  passage: {
    book_name: string;
    chapter: number;
    verse_start: number;
    verse_end?: number | null;
  }
): Promise<string> {
  const lookup = await loadBibleLookup(env);
  const book = normalizeBookKey(passage.book_name);
  const start = passage.verse_start;
  const end = passage.verse_end ?? passage.verse_start;
  const verses: string[] = [];

  for (let verse = start; verse <= end; verse++) {
    const key = `${book}|${passage.chapter}|${verse}`;
    const text = lookup[key];
    if (!text) {
      throw new Error(`Verse not found in Bible lookup: ${key}`);
    }
    verses.push(text.trim());
  }

  return verses.join(' ');
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

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
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

      const { error: answersErr } = await supabase
        .from('onboarding_answers')
        .upsert(answers, { onConflict: 'user_id' });
      if (answersErr) {
        return json({ error: answersErr.message }, { status: 400, headers: cors });
      }

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

      await supabase
        .from('profiles')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      return json({ ok: true }, { headers: cors });
    }

    if (request.method === 'GET' && path === '/guidance') {
      try {
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
          .eq('guidance_date', todayIsoDate())
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

        const related = await loadGuidanceRelatedData(env, supabase, guidance);
        return json(
          {
            guidance,
            passage: related.passage,
            matched_theme: related.matched_theme,
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
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
        }

        let body: {
          mode?: 'generate' | 'regenerate';
          action?: 'generate' | 'regenerate';
          theme_slug?: string;
          free_text?: string;
        } = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const requestedMode = body.mode || body.action;
        const mode = requestedMode === 'regenerate' ? 'regenerate' : 'generate';
        const guidanceDate = todayIsoDate();

        const contextThemeSlug =
          typeof body.theme_slug === 'string' && body.theme_slug.trim()
            ? body.theme_slug.trim()
            : null;

        const contextFreeText =
          typeof body.free_text === 'string' && body.free_text.trim()
            ? body.free_text.trim().slice(0, 500)
            : null;

        if (mode === 'generate') {
          const { data: existing, error: existingError } = await supabase
            .from('daily_guidance')
            .select('*')
            .eq('user_id', user.id)
            .eq('guidance_date', guidanceDate)
            .maybeSingle();

          if (existingError) {
            return json(
              { error: 'Failed to check existing guidance', details: existingError.message },
              { status: 500, headers: cors }
            );
          }

          if (existing) {
            const related = await loadGuidanceRelatedData(env, supabase, existing);
            return json(
              {
                guidance: existing,
                passage: related.passage,
                matched_theme: related.matched_theme,
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
            {
              error: 'No spiritual profile found. Please complete onboarding first.',
            },
            { status: 400, headers: cors }
          );
        }

        // If user provided a situational context theme chip, put it first
        // If only free text provided, use Claude to identify the most relevant theme slug
        const profileSlugs = inferThemeSlugs(profile as SpiritualProfile);
        let themeSlugs = profileSlugs;

        if (contextThemeSlug) {
          themeSlugs = [contextThemeSlug, ...profileSlugs.filter((s) => s !== contextThemeSlug)];
        } else if (contextFreeText) {
          const { data: allThemes } = await supabase
            .from('scripture_themes')
            .select('id, slug, name');

          const availableSlugs = (allThemes ?? []).map((t: any) => t.slug);

          const conceptSlug = env.ANTHROPIC_API_KEY
            ? await resolveConceptSlug(env.ANTHROPIC_API_KEY, contextFreeText, availableSlugs)
            : null;

          if (conceptSlug) {
            themeSlugs = [conceptSlug, ...profileSlugs.filter((s) => s !== conceptSlug)];
          }
        }

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
              weight,
              passage_id,
              scripture_passages (
                id, reference, book_name, chapter, verse_start, verse_end,
                devotional_summary, caution_notes, translation, testament
              )
            `)
            .eq('theme_id', theme.id)
            .order('weight', { ascending: false })
            .limit(25);

          if (mappingError || !mappings || mappings.length === 0) {
            continue;
          }

          const weightedPassages = mappings
            .map((m: any) => {
              const passage = m.scripture_passages;
              if (!passage) return null;
              return {
                ...passage,
                weight: Number(m.weight ?? 1),
              };
            })
            .filter(Boolean) as Array<PassageRow & { weight: number }>;

          if (weightedPassages.length === 0) continue;

          const picked = weightedRandomPick(weightedPassages);
          if (!picked) continue;

          selectedTheme = theme;
          selectedPassage = picked;
          break;
        }

        if (!selectedTheme || !selectedPassage) {
          return json(
            { error: 'No scripture passage found for the matched themes yet' },
            { status: 500, headers: cors }
          );
        }

        const selectedPassageText = await resolvePassageText(env, selectedPassage);
        const selectedPassageWithText: PassageRow = {
          ...selectedPassage,
          text: selectedPassageText,
        };

        const holidayContext = getHolidayContext();

        let generated = await generateWithClaude({
          env,
          theme: selectedTheme,
          passage: selectedPassageWithText,
          profile: profile as SpiritualProfile,
          contextFreeText: contextFreeText ?? undefined,
          holidayContext,
        });

        let generationSource: 'ai' | 'template' = 'ai';
        if (!generated) {
          generated = buildFallbackGuidance({
            theme: selectedTheme,
            passage: selectedPassageWithText,
            profile: profile as SpiritualProfile,
          });
          generationSource = 'template';
        }

        const insertPayload = {
          user_id: user.id,
          theme_id: selectedTheme.id,
          passage_id: selectedPassage.id,
          guidance_date: guidanceDate,
          title: generated.title,
          context_text: generated.context_text,
          devotional_text: generated.devotional_text,
          prayer_text: generated.prayer_text,
          reflection_question: generated.reflection_question,
          generation_source: generationSource,
          verse_text: selectedPassageText,
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
              text: selectedPassageText,
              translation: selectedPassage.translation,
            },
          },
          { headers: cors }
        );
      } catch (error: any) {
        return json(
          {
            error: 'Unexpected error generating guidance',
            details: error?.message ?? String(error),
          },
          { status: 500, headers: cors }
        );
      }
    }

    if (request.method === 'POST' && path === '/interpret') {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
        }

        let body: { book?: string; chapter?: number; verse_start?: number; verse_end?: number } = {};
        try {
          body = await request.json();
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
        }

        const { book, chapter, verse_start, verse_end } = body;

        if (!book || !chapter || !verse_start) {
          return json(
            { error: 'book, chapter, and verse_start are required' },
            { status: 400, headers: cors }
          );
        }

        const end = verse_end ?? verse_start;
        const verseCount = end - verse_start + 1;

        if (verseCount > 12) {
          return json(
            { error: 'Please select 12 verses or fewer' },
            { status: 400, headers: cors }
          );
        }

        if (end < verse_start) {
          return json(
            { error: 'verse_end must be greater than or equal to verse_start' },
            { status: 400, headers: cors }
          );
        }

        const passageText = await resolvePassageText(env, {
          book_name: book,
          chapter,
          verse_start,
          verse_end: end !== verse_start ? end : null,
        });

        const reference =
          end !== verse_start
            ? `${book} ${chapter}:${verse_start}-${end}`
            : `${book} ${chapter}:${verse_start}`;

        let result = await generateInterpretationWithClaude({
          env,
          reference,
          text: passageText,
        });

        if (!result) {
          result = buildFallbackInterpretation(reference);
        }

        return json(
          {
            reference,
            text: passageText,
            context_text: result.context_text,
            application: result.application,
          },
          { headers: cors }
        );
      } catch (err) {
        return json(
          {
            error: err instanceof Error ? err.message : 'Failed to interpret passage',
          },
          { status: 500, headers: cors }
        );
      }
    }

    if (request.method === 'POST' && path === '/feedback') {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
        }

        const body = await request.json();
        const guidanceId = body.guidance_id;
        const helpful = body.helpful;
        const note = typeof body.note === 'string' ? body.note.trim() : null;

        if (!guidanceId) {
          return json({ error: 'guidance_id is required' }, { status: 400, headers: cors });
        }
        if (typeof helpful !== 'boolean') {
          return json({ error: 'helpful must be true or false' }, { status: 400, headers: cors });
        }

        const { data, error } = await supabase
          .from('guidance_feedback')
          .insert({
            user_id: user.id,
            guidance_id: guidanceId,
            helpful,
            note,
          })
          .select('*')
          .single();

        if (error) {
          return json(
            { error: 'Failed to save feedback', details: error.message },
            { status: 500, headers: cors }
          );
        }

        return json({ feedback: data }, { headers: cors });
      } catch (err) {
        return json(
          {
            error: err instanceof Error ? err.message : 'Failed to save feedback',
          },
          { status: 500, headers: cors }
        );
      }
    }

    if (request.method === 'POST' && path === '/favorites') {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
        }

        const body = await request.json();
        const guidanceId = body.guidance_id;

        if (!guidanceId) {
          return json({ error: 'guidance_id is required' }, { status: 400, headers: cors });
        }

        const { data, error } = await supabase
          .from('guidance_favorites')
          .upsert(
            {
              user_id: user.id,
              guidance_id: guidanceId,
            },
            { onConflict: 'user_id,guidance_id', ignoreDuplicates: true }
          )
          .select('*')
          .maybeSingle();

        if (error) {
          return json(
            { error: 'Failed to save favorite', details: error.message },
            { status: 500, headers: cors }
          );
        }

        return json(
          { favorite: data ?? { user_id: user.id, guidance_id: guidanceId } },
          { headers: cors }
        );
      } catch (err) {
        return json(
          {
            error: err instanceof Error ? err.message : 'Failed to save favorite',
          },
          { status: 500, headers: cors }
        );
      }
    }

    if (request.method === 'GET' && path === '/favorites') {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
        }

        const { data: favorites, error } = await supabase
          .from('guidance_favorites')
          .select(`
            id,
            created_at,
            guidance_id,
            daily_guidance (
              id, user_id, theme_id, passage_id, guidance_date,
              title, context_text, devotional_text, prayer_text,
              reflection_question, generation_source, created_at
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          return json(
            { error: 'Failed to load favorites', details: error.message },
            { status: 500, headers: cors }
          );
        }

        const guidanceRows = (favorites ?? []).map((f: any) => f.daily_guidance).filter(Boolean);
        const passageIds = [...new Set(guidanceRows.map((g: any) => g.passage_id).filter(Boolean))];
        const themeIds = [...new Set(guidanceRows.map((g: any) => g.theme_id).filter(Boolean))];

        let passagesById: Record<string, any> = {};
        let themesById: Record<string, any> = {};

        if (passageIds.length) {
          const { data: passages } = await supabase
            .from('scripture_passages')
            .select('id, reference, book_name, chapter, verse_start, verse_end, translation, testament')
            .in('id', passageIds);

          const enrichedPassages = await Promise.all(
            (passages ?? []).map(async (p: any) => {
              const text = await resolvePassageText(env, p);
              return [p.id, { ...p, text }];
            })
          );
          passagesById = Object.fromEntries(enrichedPassages);
        }

        if (themeIds.length) {
          const { data: themes } = await supabase
            .from('scripture_themes')
            .select('id, slug, name')
            .in('id', themeIds);
          themesById = Object.fromEntries((themes ?? []).map((t: any) => [t.id, t]));
        }

        const results = (favorites ?? []).map((f: any) => {
          const guidance = f.daily_guidance;
          const passage = guidance?.passage_id ? passagesById[guidance.passage_id] ?? null : null;
          const matchedTheme = guidance?.theme_id ? themesById[guidance.theme_id] ?? null : null;
          return {
            id: f.id,
            created_at: f.created_at,
            guidance,
            passage,
            matched_theme: matchedTheme,
          };
        });

        return json({ favorites: results }, { headers: cors });
      } catch (err) {
        return json(
          {
            error: err instanceof Error ? err.message : 'Failed to load favorites',
          },
          { status: 500, headers: cors }
        );
      }
    }

    if (request.method === 'DELETE' && path === '/favorites') {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          return json({ error: 'Unauthorized' }, { status: 401, headers: cors });
        }

        const body = await request.json();
        const guidanceId = body.guidance_id;

        if (!guidanceId) {
          return json({ error: 'guidance_id is required' }, { status: 400, headers: cors });
        }

        const { error } = await supabase
          .from('guidance_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('guidance_id', guidanceId);

        if (error) {
          return json(
            { error: 'Failed to remove favorite', details: error.message },
            { status: 500, headers: cors }
          );
        }

        return json({ success: true }, { headers: cors });
      } catch (err) {
        return json(
          {
            error: err instanceof Error ? err.message : 'Failed to remove favorite',
          },
          { status: 500, headers: cors }
        );
      }
    }

    return json({ error: 'Not found', path }, { status: 404, headers: cors });
  },
};