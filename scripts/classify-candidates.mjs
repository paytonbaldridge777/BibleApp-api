
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const INPUT_PATH = path.join(rootDir, "data", "generated", "passage-candidates.json");
const OUTPUT_PATH = path.join(rootDir, "data", "generated", "classified-candidates.json");

const THEMES = [
  "peace",
  "anxiety",
  "hope",
  "fear",
  "grief",
  "loneliness",
  "wisdom",
  "purpose",
  "forgiveness",
  "trust",
  "prayer",
  "endurance",
  "temptation",
  "spiritual_growth",
  "addiction_strongholds"
];

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function classifyCandidate(candidate) {
  const prompt = `
You are classifying Bible passages for a Christian devotional app.

Allowed themes:
${THEMES.join(", ")}

Return valid JSON only in this exact shape:
{
  "themes": [
    { "slug": string, "confidence": number }
  ],
  "devotional_summary": string,
  "caution_notes": string | null,
  "standalone_suitability": number,
  "beginner_friendliness": number,
  "tone": "comforting" | "challenging" | "balanced" | "reflective"
}

Rules:
- Only use themes from the allowed list.
- Confidence must be between 0 and 1.
- standalone_suitability must be between 0 and 1.
- beginner_friendliness must be between 0 and 1.
- devotional_summary must be brief and practical.
- Return up to 3 themes max.
- If no themes fit well, return an empty themes array.

Reference: ${candidate.reference}
Text: ${candidate.text}
  `.trim();

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error(`No model output for ${candidate.reference}`);
  }

  return JSON.parse(text);
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, "utf8");
  const candidates = JSON.parse(raw);

  const limited = candidates.slice(0, 50);
  const results = [];

  console.log(`Classifying ${limited.length} candidates...`);

  for (let i = 0; i < limited.length; i++) {
    const candidate = limited[i];

    try {
      const classification = await classifyCandidate(candidate);

      results.push({
        ...candidate,
        ...classification,
      });

      console.log(`Done ${i + 1}/${limited.length}: ${candidate.reference}`);
    } catch (err) {
      console.error(`Failed ${candidate.reference}:`, err.message);
    }

    await sleep(300);
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));

  console.log(`Wrote ${results.length} classified candidates to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
