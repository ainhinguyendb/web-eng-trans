import { z } from "zod";
import { GenerateRequest, generateExercises } from "@/lib/exercises";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** 12 batches per visitor per 10 minutes: roughly 100 sentences, plenty for a session. */
const LIMIT = { limit: 12, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  const gate = rateLimit(`exercises:${clientKey(request)}`, LIMIT);
  if (!gate.ok) return tooManyRequests(gate, "exercise");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = GenerateRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request.", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const pairs = await generateExercises(parsed.data);
    return Response.json({ pairs });
  } catch (err) {
    console.error("[api/exercises]", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
