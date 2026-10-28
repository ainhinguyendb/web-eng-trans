"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useState } from "react";

export type SpeechLang = "vi-VN" | "en-US";

interface Options {
  lang: SpeechLang;
  onResult: (transcript: string, isFinal: boolean) => void;
}

function getCtor(): SpeechRecognitionCtor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

const noopSubscribe = () => () => {};

/**
 * Thin wrapper around the browser Web Speech API.
 * `supported` is false on browsers without it (Firefox, some Android WebViews);
 * the UI keeps keyboard input as the primary path in that case.
 */
export function useSpeechRecognition({ lang, onResult }: Options) {
  // Read browser support without a setState-in-effect; server snapshot is "unsupported".
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(getCtor()),
    () => false
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    recognitionRef.current?.abort();

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setError(null);
      setListening(true);
    };
    rec.onresult = (event) => {
      let transcript = "";
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0].transcript;
        if (result.isFinal) isFinal = true;
      }
      onResultRef.current(transcript, isFinal);
    };
    rec.onerror = (event) => {
      setError(event.error === "not-allowed" ? "Microphone permission was denied." : event.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
  }, [lang]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
