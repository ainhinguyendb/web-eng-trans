# web-eng-trans

Practise translation between Vietnamese and English in the browser, on desktop or mobile.
Type or dictate a translation, get a graded result with specific corrections and a reference translation.
Pick a difficulty from Beginner (A1) to Upper-intermediate (B2), or Mixed; the choice is remembered in the browser.

The app is public and has no sign-in. Progress lives in the browser only.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind 4), deployable to Vercel as a PWA
- Grading and exercise generation: Azure OpenAI `gpt-5.4-mini` on a Microsoft Foundry resource, called with strict JSON schemas
- Exercises are generated live in batches per difficulty and prefetched in the background; a small curated bank gives the instant first sentence and covers outages
- Per-visitor rate limits on both API routes (in-memory; move to a shared store before a large launch)
- Voice input: browser Web Speech API (`vi-VN`, `en-US`), keyboard always available
- Planned: Azure Speech fallback and text-to-speech, Azure Translator references, topic filter, spaced repetition (browser storage, no accounts for now)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the Azure values. The Foundry resource key and endpoint are under
   Resource Management > Keys and Endpoint in the Azure portal.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Project layout

- `src/app/page.tsx` practice page
- `src/components/PracticeSession.tsx` exercise flow, keyboard and microphone input, result card
- `src/app/api/grade/route.ts` POST endpoint that grades an attempt (60 per visitor per 10 min)
- `src/app/api/exercises/route.ts` POST endpoint that generates a batch of sentence pairs (12 batches per visitor per 10 min)
- `src/lib/exercises.ts` generation prompt, schema, and duplicate filtering
- `src/lib/rate-limit.ts` sliding-window limiter keyed by client address
- `src/lib/grading.ts` grading schema, prompt, and model call
- `src/lib/azure-openai.ts` Azure OpenAI client
- `src/data/sentences.ts` curated fallback bank, 5 sentences per level
- `src/hooks/useSpeechRecognition.ts` Web Speech API wrapper
- `src/hooks/useDifficulty.ts` difficulty preference persisted in localStorage
- `src/hooks/useExerciseQueue.ts` background prefetch buffer of generated exercises

## Exercises API

```bash
curl -X POST http://localhost:3000/api/exercises -H 'Content-Type: application/json' \
  -d '{"level":"B1","count":5,"avoid":["Tôi đã đi chợ sáng nay."]}'
```

`level` is `A1`, `A2`, `B1`, `B2` or `all`; `count` is 1-10; `avoid` lists source sentences already shown.
Returns `{ pairs: [{ id, level, topic, vi, en, generated: true }] }`.

## Grade API

```bash
curl -X POST http://localhost:3000/api/grade -H 'Content-Type: application/json' \
  -d '{"direction":"vi-en","source":"Tôi đã đi chợ sáng nay.","attempt":"I go to market this morning."}'
```

Returns accuracy, grammar, naturalness and overall scores (0-10), a verdict, a list of corrections,
a reference translation, and short feedback.
