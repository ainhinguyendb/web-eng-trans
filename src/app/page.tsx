import { PracticeSession } from "@/components/PracticeSession";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">
            Dịch <span className="text-emerald-600">·</span> Translate
          </h1>
          <span className="text-xs text-neutral-500">Vietnamese ⇄ English practice</span>
        </div>
      </header>
      <PracticeSession />
    </main>
  );
}
