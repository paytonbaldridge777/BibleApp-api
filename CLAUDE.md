# Shepherd's Compass

## Stack
- Frontend: Next.js on Cloudflare Pages
- API: Cloudflare Worker (`BibleApp-API` repo)
- Auth/DB: Supabase
- Payments: Stripe (incomplete)

## Rules
- Never use em-dashes in generated text
- Always read the live file before editing
- `redirect()` must never be inside a try/catch block
- Commits go to `main` unless the change is risky
- Don’t assume. Don’t hide confusion. Surface tradeoffs.
- Minimum code that solves the problem. Nothing speculative.
- Touch only what you must. Clean up only your own mess.
- Define success criteria. Loop until verified.

## Key files
- `src/index.ts` -- Cloudflare Worker entry (preserve em-dash rule in Claude prompt)
- `middleware.ts` -- deleted intentionally, do not recreate
