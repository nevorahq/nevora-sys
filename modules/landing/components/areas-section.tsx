import {
  HomeIcon,
  CheckSquareIcon,
  WalletIcon,
  FileTextIcon,
  InboxIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { AreaId, LandingContent } from "../constants/landing-content";

/**
 * Иконки по стабильному `id`, а не по порядку в массиве: перевод не может
 * случайно сдвинуть иконку. `Record<AreaId, …>` заставляет tsc падать, если
 * область добавили в контент, но забыли здесь.
 */
const AREA_ICONS: Record<AreaId, LucideIcon> = {
  actions: HomeIcon,
  work: CheckSquareIcon,
  money: WalletIcon,
  documents: FileTextIcon,
  inbox: InboxIcon,
  team: UsersIcon,
};

/**
 * Разделы продукта — те же шесть, что в основной навигации приложения. Один общий
 * контейнер с внутренними разделителями вместо набора тяжёлых neu-карточек.
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
        {content.items.map((item) => {
          const Icon = AREA_ICONS[item.id as AreaId] ?? CheckSquareIcon;
          return (
            <li key={item.id} className="flex flex-col bg-surface p-6">
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
