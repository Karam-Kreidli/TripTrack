"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-[var(--tt-border)] bg-[var(--tt-surface)] p-6 text-sm">
      <h2 className="mb-2 text-base font-semibold">Something went wrong</h2>
      <p className="mb-4 text-[var(--tt-muted)]">
        {error.message ||
          "Unexpected error. If this is a fresh checkout, make sure .env.local is configured (see .env.example)."}
      </p>
      <button
        onClick={reset}
        className="rounded-md border border-[var(--tt-border)] px-3 py-1.5 hover:bg-white/5"
      >
        Try again
      </button>
    </div>
  );
}
