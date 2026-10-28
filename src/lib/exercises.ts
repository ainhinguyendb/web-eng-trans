import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getAzureOpenAI, getDeploymentName } from "./azure-openai";
import { normalizeText } from "./grading";
import type { Level, SentencePair } from "@/data/sentences";

export const LevelSchema = z.enum(["A1", "A2", "B1", "B2"]);

export const GenerateRequest = z.object({
  level: z.union([LevelSchema, z.literal("all")]).default("all"),
  count: z.number().int().min(1).max(10).default(8),
  /** Source sentences already shown; the model is told to avoid them. */
  avoid: z.array(z.string().max(300)).max(30).default([]),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

const GeneratedPair = z.object({
  level: LevelSchema,
  topic: z.string().describe("One or two lowercase words, e.g. 'travel', 'daily life'"),
  vi: z.string().describe("Natural Vietnamese with full diacritics"),
  en: z.string().describe("Natural English translation, not word-for-word"),
});

const GeneratedBatch = z.object({
  pairs: z.array(GeneratedPair),
});

const TOPIC_POOL = [
  "daily life", "family", "food and cooking", "travel", "work and office", "shopping",
  "health", "education", "weather", "hobbies", "money", "housing", "technology",
  "society", "environment", "transport", "friendship", "holidays and festivals",
  "sport", "emotions", "the countryside", "city life", "music and film", "customer service",
];

const LEVEL_GUIDE: Record<Level, string> = {
  A1: "very short (4-8 words), present or simple past tense, everyday vocabulary, concrete situations",
  A2: "short (7-12 words), common connectors (because, but, so), simple questions and requests, frequent daily topics",
  B1: "medium (10-16 words), one subordinate clause, present perfect, conditionals, opinions and plans",
  B2: "longer (14-22 words), concession or contrast, reported speech, abstract or societal topics, precise vocabulary",
};

const SYSTEM_PROMPT = `You write practice sentences for a Vietnamese-English translation app.
Each pair must be a natural sentence that a native speaker would actually say or write, in both languages.
Rules:
- Vietnamese must use correct, complete diacritics and standard modern usage (northern-neutral register).
- The English must be a natural translation of the Vietnamese, not a word-for-word gloss.
- Vary sentence openings, subjects, tenses and topics inside the batch. Never reuse a structure twice in a row.
- Do not produce sentences that are near-duplicates of the "avoid" list.
- Keep names Vietnamese (Lan, Minh, Hương, Tuấn) when a name is needed.
- Avoid anything political, violent or adult.`;

function pickTopics(n: number): string[] {
  const pool = [...TOPIC_POOL];
  const out: string[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

export async function generateExercises(input: GenerateRequest): Promise<SentencePair[]> {
  const client = getAzureOpenAI();
  const levels: Level[] = input.level === "all" ? ["A1", "A2", "B1", "B2"] : [input.level];
  const topics = pickTopics(Math.min(4, input.count));

  const prompt = [
    `Produce exactly ${input.count} sentence pairs.`,
    levels.length === 1
      ? `Level: ${levels[0]} - ${LEVEL_GUIDE[levels[0]]}.`
      : `Mix levels A1, A2, B1 and B2 roughly evenly. Guide: ${levels.map((l) => `${l}: ${LEVEL_GUIDE[l]}`).join("; ")}.`,
    `Spread the pairs across these topics: ${topics.join(", ")}.`,
    input.avoid.length ? `Avoid anything close to these sentences:\n- ${input.avoid.join("\n- ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.responses.parse({
    model: getDeploymentName(),
    instructions: SYSTEM_PROMPT,
    input: prompt,
    reasoning: { effort: "low" },
    text: { format: zodTextFormat(GeneratedBatch, "exercise_batch") },
  });

  const batch = response.output_parsed;
  if (!batch) throw new Error("The model returned no exercises.");

  const avoidSet = new Set(input.avoid.map((s) => normalizeText(s).toLowerCase()));
  const seen = new Set<string>();
  const stamp = Date.now().toString(36);
  const pairs: SentencePair[] = [];

  for (const p of batch.pairs) {
    const vi = normalizeText(p.vi);
    const en = normalizeText(p.en);
    const key = vi.toLowerCase();
    if (!vi || !en || seen.has(key) || avoidSet.has(key)) continue;
    if (!/[^\x00-\x7F]/.test(vi)) continue; // no diacritics at all: reject
    seen.add(key);
    pairs.push({
      id: `gen-${stamp}-${pairs.length}`,
      level: p.level,
      topic: p.topic.trim().toLowerCase() || "general",
      vi,
      en,
      generated: true,
    });
  }
  return pairs;
}
