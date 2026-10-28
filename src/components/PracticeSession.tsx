"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { DIFFICULTIES, isDifficulty, pickRandom, type Difficulty, type SentencePair } from "@/data/sentences";
import { readStoredDifficulty, useDifficulty } from "@/hooks/useDifficulty";
import { useExerciseQueue } from "@/hooks/useExerciseQueue";
import type { Direction, GradeResult } from "@/lib/grading";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

type Status = "idle" | "grading" | "graded" | "error";

// First sentence is chosen once on the client; the server shell renders a placeholder.
let clientInitial: SentencePair | null = null;
const noopSubscribe = () => () => {};
const getClientInitial = () => (clientInitial ??= pickRandom({ difficulty: readStoredDifficulty() }));
const getServerInitial = () => null;

const LABELS: Record<Direction, { from: string; to: string; speechLang: "vi-VN" | "en-US" }> = {
  "vi-en": { from: "Tiếng Việt", to: "English", speechLang: "en-US" },
  "en-vi": { from: "English", to: "Tiếng Việt", speechLang: "vi-VN" },
};

export function PracticeSession() {
  const [direction, setDirection] = useState<Direction>("vi-en");
  const [difficulty, setDifficulty] = useDifficulty();
  const queue = useExerciseQueue(difficulty);
  const initial = useSyncExternalStore(noopSubscribe, getClientInitial, getServerInitial);
  const [picked, setSentence] = useState<SentencePair | null>(null);
  const sentence = picked ?? initial;
  const [attempt, setAttempt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stats, setStats] = useState({ done: 0, correct: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const interimBase = useRef("");

  const speech = useSpeechRecognition({
    lang: LABELS[direction].speechLang,
    onResult: (transcript, isFinal) => {
      const base = interimBase.current;
      const joined = base ? `${base} ${transcript}` : transcript;
      setAttempt(joined);
      if (isFinal) interimBase.current = joined;
    },
  });

  const source = sentence ? (direction === "vi-en" ? sentence.vi : sentence.en) : "";
  const reference = sentence ? (direction === "vi-en" ? sentence.en : sentence.vi) : "";

  const reset = useCallback(
    (next?: SentencePair) => {
      speech.stop();
      setSentence(next ?? queue.take(sentence?.id));
      setAttempt("");
      interimBase.current = "";
      setResult(null);
      setErrorMsg(null);
      setStatus("idle");
      textareaRef.current?.focus();
    },
    [sentence?.id, queue, speech]
  );

  function changeDifficulty(next: Difficulty) {
    if (next === difficulty) return;
    setDifficulty(next);
    queue.reset(next);
    reset(pickRandom({ difficulty: next, exclude: sentence?.id }));
  }

  function switchDirection(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    reset(sentence ?? undefined);
  }

  async function submit() {
    if (!sentence || !attempt.trim() || status === "grading") return;
    speech.stop();
    setStatus("grading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, source, attempt, reference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setResult(data as GradeResult);
      setStatus("graded");
      setStats((s) => ({
        done: s.done + 1,
        correct: s.correct + ((data as GradeResult).verdict === "correct" ? 1 : 0),
      }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  function toggleMic() {
    if (speech.listening) {
      speech.stop();
    } else {
      interimBase.current = attempt.trim();
      speech.start();
    }
  }

  const labels = LABELS[direction];

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
      {/* Direction toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white p-1 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          {(["vi-en", "en-vi"] as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => switchDirection(d)}
              aria-pressed={direction === d}
              className={`rounded-full px-4 py-1.5 font-medium transition ${
                direction === d
                  ? "bg-emerald-600 text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
              }`}
            >
              {LABELS[d].from} → {LABELS[d].to}
            </button>
          ))}
        </div>
        <p className="text-sm tabular-nums text-neutral-500" aria-live="polite">
          {stats.correct}/{stats.done} correct
        </p>
      </div>

      {/* Difficulty */}
      <div className="flex items-center gap-3">
        <label htmlFor="difficulty" className="text-xs uppercase tracking-wide text-neutral-500">
          Difficulty
        </label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={(e) => {
            if (isDifficulty(e.target.value)) changeDifficulty(e.target.value);
          }}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:ring-emerald-900"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label} ({d.hint})
            </option>
          ))}
        </select>
      </div>

      {/* Source sentence */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-neutral-500">
          <span>Translate from {labels.from}</span>
          {sentence && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {sentence.level} · {sentence.topic}
              {sentence.generated ? " · AI" : ""}
            </span>
          )}
        </div>
        <p className="min-h-14 text-xl leading-relaxed sm:text-2xl" lang={direction === "vi-en" ? "vi" : "en"}>
          {source || <span className="text-neutral-400">Loading…</span>}
        </p>
        <p className="mt-2 text-xs text-neutral-400" aria-live="polite">
          {queue.error
            ? <>Could not generate new sentences, using the built-in set. <button type="button" onClick={() => void queue.retry()} className="underline">Retry</button></>
            : queue.buffered > 0
              ? `${queue.buffered} generated sentence${queue.buffered === 1 ? "" : "s"} ready`
              : "Generating new sentences…"}
        </p>
      </div>

      {/* Attempt */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="attempt" className="text-xs uppercase tracking-wide text-neutral-500">
          Your translation in {labels.to}
        </label>
        <div className="relative">
          <textarea
            id="attempt"
            ref={textareaRef}
            value={attempt}
            onChange={(e) => {
              setAttempt(e.target.value);
              interimBase.current = e.target.value;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            lang={direction === "vi-en" ? "en" : "vi"}
            placeholder={speech.listening ? "Listening…" : "Type here, or tap the microphone"}
            disabled={status === "grading" || status === "graded"}
            className="w-full resize-none rounded-2xl border border-neutral-300 bg-white p-4 pr-14 text-lg leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:ring-emerald-900"
          />
          {speech.supported && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={status === "grading" || status === "graded"}
              aria-label={speech.listening ? "Stop listening" : `Dictate in ${labels.to}`}
              className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full transition ${
                speech.listening
                  ? "animate-pulse bg-red-500 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              }`}
            >
              <MicIcon />
            </button>
          )}
        </div>
        {speech.error && <p className="text-sm text-red-600">{speech.error}</p>}
        {!speech.supported && (
          <p className="text-xs text-neutral-500">
            Voice input is not available in this browser. Chrome, Edge, and Safari support it.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {status !== "graded" ? (
            <button
              type="submit"
              disabled={!attempt.trim() || status === "grading"}
              className="rounded-full bg-emerald-600 px-6 py-2.5 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "grading" ? "Grading…" : "Check"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => reset()}
              autoFocus
              className="rounded-full bg-emerald-600 px-6 py-2.5 font-medium text-white transition hover:bg-emerald-700"
            >
              Next sentence
            </button>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full border border-neutral-300 px-5 py-2.5 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Skip
          </button>
        </div>
      </form>

      {status === "error" && errorMsg && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {result && <ResultCard result={result} targetLang={direction === "vi-en" ? "en" : "vi"} />}
    </section>
  );
}

function ResultCard({ result, targetLang }: { result: GradeResult; targetLang: "en" | "vi" }) {
  const tone =
    result.verdict === "correct"
      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
      : result.verdict === "minor_issues"
        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
        : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950";
  const verdictLabel = { correct: "Correct", minor_issues: "Almost there", incorrect: "Needs work" }[result.verdict];

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border p-5 ${tone}`} aria-live="polite">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{verdictLabel}</h2>
        <span className="text-2xl font-bold tabular-nums">{result.overall}/10</span>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center text-sm">
        {(["accuracy", "grammar", "naturalness"] as const).map((k) => (
          <div key={k} className="rounded-xl bg-white/70 p-2 dark:bg-black/30">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{k}</dt>
            <dd className="text-lg font-semibold tabular-nums">{result[k]}</dd>
          </div>
        ))}
      </dl>

      {result.corrections.length > 0 && (
        <ul className="flex flex-col gap-2">
          {result.corrections.map((c, i) => (
            <li key={i} className="rounded-xl bg-white/70 p-3 text-sm dark:bg-black/30">
              <p>
                <span className="line-through decoration-red-500/70">{c.original}</span>{" "}
                <span className="font-medium text-emerald-700 dark:text-emerald-300">{c.suggestion}</span>
                <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {c.type.replace("_", " ")}
                </span>
              </p>
              <p className="mt-1 text-neutral-600 dark:text-neutral-300">{c.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="text-sm">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Reference</p>
        <p className="mt-1 text-base" lang={targetLang}>
          {result.reference}
        </p>
      </div>

      <p className="text-sm text-neutral-700 dark:text-neutral-200">{result.feedback}</p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4M8 21h8" />
    </svg>
  );
}
