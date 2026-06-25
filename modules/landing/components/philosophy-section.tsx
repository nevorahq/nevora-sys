import type { LandingContent } from "../constants/landing-content";

/** Product philosophy — что система НЕ есть + ключевые вопросы. */
export function PhilosophySection({
  content,
}: {
  content: LandingContent["philosophy"];
}) {
  return (
    <section className="bg-surface-sunken/40 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {content.title}
          </h2>
          <div className="mt-6 space-y-4 text-text-secondary">
            {content.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>

        <div className="nv-fade-up soft-card mt-10 p-8">
          <p className="text-sm font-medium text-text-secondary">
            {content.questionsIntro}
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {content.questions.map((q) => (
              <li key={q} className="flex items-start gap-3 text-text-primary">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green"
                />
                <span className="text-sm">{q}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm font-semibold text-text-primary">
            {content.closing}
          </p>
        </div>
      </div>
    </section>
  );
}
