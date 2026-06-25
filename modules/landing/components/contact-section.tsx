import type { LandingContent } from "../constants/landing-content";

/** Contact — каналы связи. (Контакты — placeholder, см. landing-content.ts.) */
export function ContactSection({
  content,
}: {
  content: LandingContent["contact"];
}) {
  return (
    <section id="contact" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="soft-card-lg p-8 sm:p-12">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-4 max-w-xl text-text-secondary">{content.text}</p>
        <p className="mt-2 max-w-xl text-text-secondary">{content.text2}</p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {content.channels.map((channel) => (
            <li key={channel.label}>
              <a
                href={channel.href}
                className="nv-hover-lift flex items-center justify-between rounded-(--neu-radius-md) border border-border-soft bg-surface-elevated px-4 py-3 shadow-neu-sm"
              >
                <span className="text-sm text-text-muted">{channel.label}</span>
                <span className="text-sm font-medium text-text-primary">
                  {channel.value}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <a
          href={content.ctaHref}
          className="mt-8 inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-7 py-3 text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:scale-[0.98] active:shadow-neu-inset"
        >
          {content.cta}
        </a>
      </div>
    </section>
  );
}
