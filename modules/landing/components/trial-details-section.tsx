import type { LandingContent } from "../constants/landing-content";

/**
 * Trial Details — подробное объяснение пробного периода.
 * Выносит детали из pricing-карточки, чтобы карточка оставалась короткой.
 * Статичные compact-карточки (без аккордеона/JS), читаются на mobile.
 */
export function TrialDetailsSection({
  content,
}: {
  content: LandingContent["trialDetails"];
}) {
  return (
    <section className="bg-surface-sunken/40 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {content.title}
          </h2>
          <div className="mt-6 space-y-4 text-text-secondary">
            {content.intro.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item, i) => (
            <li
              key={item.title}
              className="nv-fade-up soft-card flex flex-col p-5"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <h3 className="text-sm font-semibold text-text-primary">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
