import type { LandingContent } from "../constants/landing-content";

/** Short value block — что продукт помогает делать + чипы модулей. */
export function ValueSection({ content }: { content: LandingContent["value"] }) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="soft-card-lg p-8 sm:p-12">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 max-w-2xl text-text-secondary">{content.text}</p>

        <ul className="mt-8 flex flex-wrap gap-2.5">
          {content.items.map((item, i) => (
            <li
              key={item}
              className="nv-fade-up rounded-(--neu-radius-pill) border border-border-soft bg-surface-elevated px-4 py-2 text-sm font-medium text-text-primary shadow-neu-sm"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-2xl text-sm text-text-muted">
          {content.supporting}
        </p>
      </div>
    </section>
  );
}
