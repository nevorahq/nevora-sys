import { PlusIcon } from "lucide-react";
import type { LandingContent } from "../constants/landing-content";

/**
 * FAQ — честные ответы про закрытую бету, данные, ИИ и языки. Нативный
 * `<details>/<summary>` вместо JS-аккордеона: работает без клиентского кода,
 * доступен с клавиатуры и остаётся Server Component.
 */
export function FaqSection({ content }: { content: LandingContent["faq"] }) {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      <div className="mt-12 flex flex-col gap-3">
        {content.items.map((item) => (
          <details
            key={item.id}
            className="group soft-card overflow-hidden [&_svg]:open:rotate-45"
          >
            <summary className="soft-focus flex cursor-pointer items-center justify-between gap-4 p-5 font-medium text-text-primary marker:content-none [&::-webkit-details-marker]:hidden">
              {item.q}
              <PlusIcon
                size={18}
                strokeWidth={2}
                aria-hidden="true"
                className="shrink-0 text-text-tertiary transition-transform duration-200"
              />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-text-secondary">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
