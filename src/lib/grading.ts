import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getAzureOpenAI, getDeploymentName } from "./azure-openai";

export const Direction = z.enum(["vi-en", "en-vi"]);
export type Direction = z.infer<typeof Direction>;

export const GradeRequest = z.object({
  direction: Direction,
  source: z.string().trim().min(1).max(600),
  attempt: z.string().trim().min(1).max(1200),
  /** Optional reference translation from the exercise bank. */
  reference: z.string().trim().max(1200).optional(),
});
export type GradeRequest = z.infer<typeof GradeRequest>;

const Score = z.number().int().min(0).max(10);

export const GradeResult = z.object({
  accuracy: Score.describe("Meaning preserved, nothing added or dropped"),
  grammar: Score.describe("Grammatical correctness in the target language"),
  naturalness: Score.describe("Reads like a native speaker wrote it"),
  overall: Score.describe("Holistic score"),
  verdict: z.enum(["correct", "minor_issues", "incorrect"]),
  corrections: z.array(
    z.object({
      original: z.string().describe("Exact fragment from the learner's attempt"),
      suggestion: z.string().describe("Improved fragment"),
      explanation: z.string().describe("One short sentence, beginner friendly"),
      type: z.enum([
        "meaning",
        "grammar",
        "word_choice",
        "spelling",
        "tone_marks",
        "style",
      ]),
    })
  ),
  reference: z.string().describe("A natural reference translation"),
  feedback: z.string().describe("Two sentences of encouraging, specific feedback"),
});
export type GradeResult = z.infer<typeof GradeResult>;

/** Vietnamese input methods (Telex, VNI) can emit decomposed code points. */
export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

const SYSTEM_PROMPT = `You are a patient bilingual Vietnamese-English translation tutor.
Grade the learner's translation of the source sentence.

Rules:
- Judge meaning first. Accept any translation that preserves the meaning, even if the wording differs from the reference.
- Several correct translations usually exist. Do not penalise a valid paraphrase.
- For English targets, flag grammar, articles, tense, and word order.
- For Vietnamese targets, flag missing or wrong tone marks separately as type "tone_marks" and treat them as a gentler error than a wrong word.
- Corrections must quote the learner's exact fragment in "original".
- Keep explanations short and concrete. Write feedback in the same language as the target language.
- Score 0-10. A fully correct, natural translation scores 9 or 10 on every axis with an empty corrections list.`;

export async function gradeTranslation(input: GradeRequest): Promise<GradeResult> {
  const client = getAzureOpenAI();
  const source = normalizeText(input.source);
  const attempt = normalizeText(input.attempt);
  const [from, to] =
    input.direction === "vi-en" ? ["Vietnamese", "English"] : ["English", "Vietnamese"];

  const userPrompt = [
    `Direction: ${from} -> ${to}`,
    `Source (${from}): ${source}`,
    input.reference ? `Reference translation (${to}): ${normalizeText(input.reference)}` : null,
    `Learner's translation (${to}): ${attempt}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.responses.parse({
    model: getDeploymentName(),
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    reasoning: { effort: "low" },
    text: { format: zodTextFormat(GradeResult, "grade_result") },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("The grading model returned no structured result.");
  }
  return parsed;
}
