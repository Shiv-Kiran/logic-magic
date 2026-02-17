const demoLog = [
  "> Initializing Planner...",
  "> Strategy Selected: CONTRADICTION_MINIMALITY",
  "> Invariant Detected: \"Settled nodes are optimal\"",
  "> Drafting Proof (Attempt 1)...",
  "> [Critic] Warn: Missing base case for |S| = 1.",
  "> Refining Proof (Attempt 2)...",
  "> [Critic] Passed.",
];

export default function Home() {
  return (
    <div className="app-grid min-h-screen">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-10 sm:px-8 lg:py-14">
        <header className="space-y-3">
          <p className="section-title">MagicLogic</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Logic IDE for truth
          </h1>
          <p className="max-w-2xl text-sm text-zinc-400 sm:text-base">
            Turn natural-language math proofs into a precise strategy, a structured draft, and a strict logical audit.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="surface p-5 sm:p-6">
            <h2 className="section-title mb-4">Input</h2>
            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">Problem statement</span>
                <textarea placeholder="Show that Dijkstra works using contradiction." />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">Messy attempt (optional)</span>
                <textarea placeholder="I think we assume a first wrong vertex and derive a contradiction..." />
              </label>
              <div className="flex flex-wrap items-center gap-5 border-y border-border py-3 text-sm text-zinc-300">
                <span>User intent:</span>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="intent" defaultChecked />
                  <span>Learning</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="intent" />
                  <span>Verification</span>
                </label>
              </div>
              <button className="primary">Generate Structured Proof</button>
            </div>
          </article>

          <article className="surface p-5 sm:p-6">
            <h2 className="section-title mb-4">Streaming Thinking</h2>
            <pre className="terminal">{demoLog.join("\n")}</pre>
          </article>
        </section>

        <section className="grid gap-6">
          <article className="surface space-y-3 p-5 sm:p-6">
            <h2 className="section-title">The Plan</h2>
            <p className="text-zinc-300">Strategy and assumptions will appear here.</p>
          </article>

          <article className="surface space-y-3 p-5 sm:p-6">
            <h2 className="section-title">The Proof</h2>
            <p className="text-zinc-300">Structured markdown + math output will appear here.</p>
          </article>

          <article className="surface space-y-3 p-5 sm:p-6">
            <h2 className="section-title">The Audit</h2>
            <p className="text-zinc-300">Critic feedback and verdict will appear here.</p>
          </article>

          <article className="surface space-y-3 p-5 sm:p-6">
            <h2 className="section-title">Mental Model</h2>
            <h3 className="font-mono text-lg text-white">Minimal Counterexample</h3>
            <p className="text-sm text-zinc-300">Assume the algorithm fails and choose the first failure.</p>
            <p className="text-sm text-zinc-300">
              If the first failure implies an even earlier failure, contradiction follows.
            </p>
            <p className="text-sm text-zinc-300">Invariant: all earlier steps remain correct.</p>
          </article>
        </section>
      </main>
    </div>
  );
}
