import { z } from "zod";
import { GradeRequest, gradeTranslation } from "@/lib/grading";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** 60 grades per visitor per 10 minutes. */
const LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  const gate = rateLimit(`grade:${clientKey(request)}`, LIMIT);
  if (!gate.ok) return tooManyRequests(gate, "grading");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = GradeRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request.", issues: z.treeifyError(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const result = await gradeTranslation(parsed.data);
    return Response.json(result);
  } catch (err) {
    console.error("[api/grade]", err);
    const message = err instanceof Error ? err.message : "Grading failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
