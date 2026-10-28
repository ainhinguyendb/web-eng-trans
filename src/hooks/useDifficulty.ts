"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isDifficulty, type Difficulty } from "@/data/sentences";

const STORAGE_KEY = "practice.difficulty";
const listeners = new Set<() => void>();
/** In-memory value so the choice still applies when localStorage is unavailable. */
let memoryValue: Difficulty | null = null;

export function readStoredDifficulty(): Difficulty {
  if (memoryValue) return memoryValue;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isDifficulty(raw) ? raw : "all";
  } catch {
    return "all";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Difficulty preference kept in localStorage; "all" on the server and when storage is unavailable. */
export function useDifficulty(): [Difficulty, (next: Difficulty) => void] {
  const difficulty = useSyncExternalStore(subscribe, readStoredDifficulty, () => "all" as const);

  const setDifficulty = useCallback((next: Difficulty) => {
    memoryValue = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode or blocked storage: the choice simply won't persist */
    }
    listeners.forEach((l) => l());
  }, []);

  return [difficulty, setDifficulty];
}
