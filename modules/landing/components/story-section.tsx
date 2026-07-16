import type { LandingContent } from "../constants/landing-content";

interface StorySectionProps {
  story: LandingContent["story"];
  contact: LandingContent["contact"];
}

/** Короткая история продукта + контакты (секция 7). */
export function StorySection({ story, contact }: StorySectionProps) {
  return (
    <section id="contact" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="grid gap-10 md:grid-cols-2 md:gap-12">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {story.title}
          </h2>
          <div className="mt-5 space-y-4 text-text-secondary">
            {story.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-text-primary">{contact.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">{contact.text}</p>

          <ul className="mt-6 flex flex-col gap-2">
            {contact.channels.map((channel) => (
              <li key={channel.label}>
                <a
                  href={channel.href}
                  className="soft-focus nv-hover-lift flex min-h-11 items-center justify-between rounded-(--neu-radius-md) border border-border-soft bg-surface px-4 py-3 shadow-neu-sm"
                >
                  <span className="text-sm text-text-tertiary">{channel.label}</span>
                  <span className="text-sm font-medium text-text-primary">{channel.value}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
