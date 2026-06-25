import type { LandingContent } from "../constants/landing-content";

/** About — почему продукт существует + три принципа. */
export function AboutSection({ content }: { content: LandingContent["about"] }) {
  return (
    <section id="about" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
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

      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {content.principles.map((principle, i) => (
          <li
            key={principle.title}
            className="nv-fade-up nv-hover-lift soft-card flex flex-col p-6"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="text-sm font-mono text-text-muted">
              0{i + 1}
            </span>
            <h3 className="mt-3 font-semibold text-text-primary">
              {principle.title}
            </h3>
            <p className="mt-2 text-sm text-text-secondary">{principle.text}</p>
          </li>
        ))}
      </ol>

      <p className="mt-10 max-w-2xl text-text-secondary">{content.closing}</p>
    </section>
  );
}
