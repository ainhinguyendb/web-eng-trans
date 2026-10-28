"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickRandom, type Difficulty, type SentencePair } from "@/data/sentences";

const BATCH_SIZE = 8;
const LOW_WATER = 3;
const AVOID_LIMIT = 20;

/**
 * Keeps a small buffer of model-generated exercises for the current difficulty,
 * refilling in the background before it runs dry. `take()` always returns a
 * sentence immediately: from the buffer when possible, otherwise from the
 * curated fallback bank, so the learner never waits on the network.
 *
 * The buffer lives in a ref (synchronous reads in event handlers); `buffered`
 * mirrors its length in state so the UI re-renders.
 */
export function useExerciseQueue(difficulty: Difficulty) {
  const items = useRef<SentencePair[]>([]);
  const [buffered, setBuffered] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const generation = useRef(0); // bumps on difficulty change so stale responses are dropped
  const recentSources = useRef<string[]>([]);
  const seenKeys = useRef<Set<string>>(new Set());
  const difficultyRef = useRef(difficulty);

  const refill = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    const myGen = generation.current;
    const level = difficultyRef.current;

    const p: Promise<void> = fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, count: BATCH_SIZE, avoid: recentSources.current.slice(-AVOID_LIMIT) }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        if (myGen !== generation.current) return;
        for (const pair of data.pairs as SentencePair[]) {
          const key = pair.vi.toLowerCase();
          if (seenKeys.current.has(key)) continue;
          seenKeys.current.add(key);
          items.current.push(pair);
        }
        setBuffered(items.current.length);
        setError(null);
      })
      .catch((err: unknown) => {
        if (myGen !== generation.current) return;
        setError(err instanceof Error ? err.message : "Could not generate exercises.");
      })
      .finally(() => {
        if (inflight.current === p) inflight.current = null;
      });

    inflight.current = p;
    return p;
  }, []);

  /** Switch difficulty: drop buffered items and start a new batch. */
  const reset = useCallback(
    (next: Difficulty) => {
      difficultyRef.current = next;
      generation.current += 1;
      inflight.current = null;
      items.current = [];
      setBuffered(0);
      setError(null);
      void refill();
    },
    [refill]
  );

  /** Pop the next exercise, falling back to the curated bank when the buffer is empty. */
  const take = useCallback((excludeId?: string): SentencePair => {
    const next = items.current.shift();
    if (next) setBuffered(items.current.length);
    const chosen =
      next ?? pickRandom({ difficulty: difficultyRef.current, exclude: excludeId ? [excludeId] : [] });
    recentSources.current = [...recentSources.current, chosen.vi].slice(-AVOID_LIMIT);
    return chosen;
  }, []);

  // Top up whenever the buffer gets low. State changes only happen inside fetch callbacks.
  useEffect(() => {
    if (buffered < LOW_WATER && !error) void refill();
  }, [buffered, error, refill]);

  const retry = useCallback(() => {
    setError(null);
    return refill();
  }, [refill]);

  return { take, reset, retry, buffered, error };
}
