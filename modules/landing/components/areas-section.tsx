import {
  CheckSquareIcon,
  WalletIcon,
  FileTextIcon,
  RepeatIcon,
  InboxIcon,
  BarChart3Icon,
} from "lucide-react";
import type { LandingContent } from "../constants/landing-content";

const AREA_ICONS = [
  CheckSquareIcon,
  WalletIcon,
  FileTextIcon,
  RepeatIcon,
  InboxIcon,
  BarChart3Icon,
] as const;

/**
 * Области бизнеса, которые объединяет система. Один общий контейнер с внутренними
 * разделителями — вместо набора одинаковых тяжёлых neu-карточек.
 */
export function AreasSection({ content }: { content: LandingContent["areas"] }) {
  return (
    <section id="areas" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      {/* gap-px поверх фона-разделителя даёт ровные 1px-линии на любом числе
          колонок — без хрупких nth-child border-правил на каждом брейкпоинте. */}
      <ul className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-(--neu-radius-lg) border border-border-soft bg-border-soft shadow-neu-sm sm:grid-cols-2 lg:grid-cols-3">
        {content.items.map((item, i) => {
          const Icon = AREA_ICONS[i] ?? CheckSquareIcon;
          return (
            <li key={item.title} className="flex flex-col bg-surface p-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-primary shadow-neu-inset">
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
