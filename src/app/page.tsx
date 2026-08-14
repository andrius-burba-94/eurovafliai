// Placeholder shell. The real app shell, nav and design tokens land in Phase 1.4
// (see docs/EUROVAFLIAI_BLUEPRINT.md); this exists so the repo boots, the E2E
// smoke test has something to assert, and nothing here pretends to be design.
export default function Home() {
  return (
    <main
      data-testid="app-shell"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16"
    >
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
          Euroleague 2026&ndash;27
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Eurovafliai</h1>
        <p className="text-lg opacity-70">
          Fantasy draft platform. Phase 0: repository bootstrap.
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-mono text-sm">
        <dt className="opacity-60">Next</dt>
        <dd>127.0.0.1:3007</dd>
        <dt className="opacity-60">PocketBase</dt>
        <dd>127.0.0.1:8095</dd>
        <dt className="opacity-60">Roster</dt>
        <dd>13 players &middot; 5G / 5F / 3C</dd>
      </dl>
    </main>
  );
}
