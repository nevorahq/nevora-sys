/**
 * Контент лендинга Nevora Business OS — локализованный (en / ru / ro).
 *
 * Почему не в общих словарях shared/i18n: их тип `DeepString<typeof en>`
 * сводит листья к `string` и не поддерживает массивы — а лендинг состоит
 * из списков (steps, areas, points). Здесь мы держим собственный строго
 * типизированный контент: `LandingContent = typeof en`.
 *
 * Публичный лендинг поддерживает RO наравне с en/ru: shared app-словари пока
 * только en/ru, поэтому румынский живёт как публичная локаль (лендинг + legal +
 * metadata), а интерфейс приложения для ro падает в en — см. `toAppLocale`.
 *
 * Тон: честный founder-led копирайт. Единый глоссарий терминов, без хайпа,
 * без смешения языков, без фейковых цифр и отзывов. Финансовые действия — только
 * после подтверждения пользователя; ИИ ничего не выполняет автоматически.
 */

import type { PublicLocale } from "@/shared/i18n/constants";

export const BRAND = "Nevora Business OS";

/** Публичные локали лендинга совпадают с общей осью языка приложения. */
export const LANDING_LOCALES = ["en", "ru", "ro"] as const;

export type LandingLocale = PublicLocale;

const en = {
  meta: {
    title: "Nevora Business OS — Run your business from one connected workspace",
    description:
      "Tasks, projects, finances, documents and subscriptions in one system. Nevora suggests the next step; every important change stays under your control.",
  },
  nav: [
    { label: "Home", href: "#home" },
    { label: "How it works", href: "#how" },
    { label: "Areas", href: "#areas" },
    { label: "Pricing", href: "#pricing" },
    { label: "Contact", href: "#contact" },
  ],
  header: {
    login: "Log in",
    cta: "Start a 14-day trial",
    menu: "Open menu",
    close: "Close menu",
  },
  hero: {
    title: "Run your business from one connected workspace.",
    subtitle:
      "Tasks, projects, finances, documents and subscriptions stay connected in one system. Nevora suggests the next step, while every important change remains under your control.",
    trust: "AI suggests. You review. Financial actions never run automatically.",
    primaryCta: "Start a 14-day trial",
    secondaryCta: "See pricing",
    microcopy: "Private beta · 14-day trial · 500 MB storage · no card required.",
    audience: "Built for small and growing teams that want order without heavy software.",
  },
  how: {
    title: "Add, review, execute",
    subtitle:
      "One simple loop keeps work moving. You stay in control at every step — nothing important happens without you.",
    steps: [
      {
        badge: "1",
        title: "Add",
        text: "Drop a task, a document, a note or a subscription into one place. No forms to learn, no lost context.",
      },
      {
        badge: "2",
        title: "Review",
        text: "Nevora reads what you added and suggests the next step. You check the suggestion before anything is applied.",
      },
      {
        badge: "3",
        title: "Execute",
        text: "You confirm, and the action is recorded and connected. Payments and money changes happen only when you approve them.",
      },
    ],
  },
  areas: {
    title: "One system for the work you already do",
    subtitle:
      "Nevora connects the active parts of your business, so you spend less time switching between tools.",
    items: [
      {
        title: "Tasks and projects",
        text: "Create work, assign owners and keep execution connected to its context.",
      },
      {
        title: "Money and cash flow",
        text: "Track income and expenses and see your cash flow — suggestions never post themselves as facts.",
      },
      {
        title: "Documents",
        text: "Store invoices and receipts and link them to tasks, money and subscriptions.",
      },
      {
        title: "Subscriptions",
        text: "Follow recurring payments and mark them as paid only when a payment has really happened.",
      },
      {
        title: "Inbox",
        text: "Add anything quickly, then review it and decide what should become an action.",
      },
      {
        title: "Analytics",
        text: "Get a simple overview of tasks, expenses, subscriptions and what needs attention next.",
      },
    ],
  },
  control: {
    title: "Control, security and the role of AI",
    subtitle:
      "Nevora is assistive by design. It helps you decide faster, but the decision is always yours.",
    points: [
      {
        title: "AI suggests, you decide",
        text: "Every AI output is a suggestion you review. Nothing is applied until you confirm it.",
      },
      {
        title: "Confirm-first finance",
        text: "Money changes are never automatic. A payment or expense is recorded only after you approve it.",
      },
      {
        title: "Your data stays yours",
        text: "During private beta your workspace is isolated and private. No hidden sharing, no surprises.",
      },
    ],
    closing:
      "Important obligations stay visible until they are resolved — not just until a notification is read.",
  },
  plans: {
    title: "Pricing",
    subtitle: "Start with a free 14-day trial. Move up only when the product truly earns it.",
    note: {
      lead: "Try Nevora Business OS for 14 days with up to 500 MB of storage.",
      points: [
        "AI you review",
        "Finance you confirm",
        "Decide freely after the trial",
      ],
    },
  },
  story: {
    title: "Why Nevora exists",
    paragraphs: [
      "Many business tools become heavy too early — extra menus, unused features and limits that get in the way.",
      "Nevora is being built in the other direction: a connected place for tasks, money, documents and subscriptions that you can understand without training, where the important decisions stay with you.",
    ],
  },
  contact: {
    title: "Get in touch",
    text: "Have a question, an idea or a use case? I read every message.",
    channels: [
      { label: "Email", value: "nevorahq@gmail.com", href: "mailto:nevorahq@gmail.com" },
      { label: "Telegram", value: "@NEVORAHQ", href: "https://t.me/NEVORAHQ" },
      { label: "Instagram", value: "@nevorahq", href: "https://www.instagram.com/nevorahq/" },
    ],
  },
  footer: {
    tagline: "A simple operating system for focused business work.",
    note: "Built for clarity, productivity and real daily use.",
    productHeading: "Product",
    legalHeading: "Legal",
    terms: "Terms",
    privacy: "Privacy",
    refunds: "Refunds",
  },
};

/** Форма контента лендинга. Источник истины — английский объект `en`. */
export type LandingContent = typeof en;

const ru: LandingContent = {
  meta: {
    title: "Nevora Business OS — управляйте бизнесом в едином рабочем пространстве",
    description:
      "Задачи, проекты, финансы, документы и подписки в одной системе. Nevora подсказывает следующий шаг, а важные изменения выполняются только после вашего подтверждения.",
  },
  nav: [
    { label: "Главная", href: "#home" },
    { label: "Как это работает", href: "#how" },
    { label: "Области", href: "#areas" },
    { label: "Тарифы", href: "#pricing" },
    { label: "Контакты", href: "#contact" },
  ],
  header: {
    login: "Войти",
    cta: "Начать 14-дневный пробный период",
    menu: "Открыть меню",
    close: "Закрыть меню",
  },
  hero: {
    title: "Управляйте бизнесом в едином рабочем пространстве.",
    subtitle:
      "Задачи, проекты, финансы, документы и подписки связаны в одной системе. Nevora подсказывает следующий шаг, а важные изменения выполняются только после вашего подтверждения.",
    trust: "ИИ предлагает. Вы проверяете. Финансовые действия не выполняются автоматически.",
    primaryCta: "Начать 14-дневный пробный период",
    secondaryCta: "Смотреть тарифы",
    microcopy: "Закрытая бета · пробный период 14 дней · 500 МБ хранилища · без карты.",
    audience: "Для малых и растущих команд, которым нужен порядок без тяжёлых программ.",
  },
  how: {
    title: "Добавьте, проверьте, выполните",
    subtitle:
      "Один простой цикл держит работу в движении. Вы контролируете каждый шаг — ничего важного не происходит без вас.",
    steps: [
      {
        badge: "1",
        title: "Добавьте",
        text: "Внесите задачу, документ, заметку или подписку в одно место. Не нужно осваивать формы и терять контекст.",
      },
      {
        badge: "2",
        title: "Проверьте",
        text: "Nevora читает добавленное и предлагает следующий шаг. Вы проверяете предложение до того, как что-либо применится.",
      },
      {
        badge: "3",
        title: "Выполните",
        text: "Вы подтверждаете — и действие записывается и связывается. Платежи и изменения денег происходят только после вашего одобрения.",
      },
    ],
  },
  areas: {
    title: "Одна система для работы, которую вы и так ведёте",
    subtitle:
      "Nevora связывает активные части бизнеса, чтобы вы тратили меньше времени на переключение между инструментами.",
    items: [
      {
        title: "Задачи и проекты",
        text: "Создавайте работу, назначайте ответственных и держите исполнение связанным с контекстом.",
      },
      {
        title: "Деньги и денежный поток",
        text: "Отслеживайте доходы и расходы и видьте денежный поток — рекомендации не записываются как факты сами.",
      },
      {
        title: "Документы",
        text: "Храните счета и чеки и связывайте их с задачами, деньгами и подписками.",
      },
      {
        title: "Подписки",
        text: "Следите за регулярными платежами и отмечайте их как оплаченные только когда платёж действительно прошёл.",
      },
      {
        title: "Входящие",
        text: "Быстро добавляйте что угодно, затем проверяйте и решайте, что должно стать действием.",
      },
      {
        title: "Аналитика",
        text: "Простой обзор задач, расходов, подписок и того, что требует внимания дальше.",
      },
    ],
  },
  control: {
    title: "Контроль, безопасность и роль ИИ",
    subtitle:
      "Nevora по умолчанию помогает, а не решает за вас. Она ускоряет решения, но решение всегда за вами.",
    points: [
      {
        title: "ИИ предлагает — вы решаете",
        text: "Любой результат ИИ — это предложение, которое вы проверяете. Ничего не применяется, пока вы не подтвердите.",
      },
      {
        title: "Финансы только после подтверждения",
        text: "Изменения денег никогда не автоматические. Платёж или расход записывается только после вашего одобрения.",
      },
      {
        title: "Ваши данные остаются вашими",
        text: "Во время закрытой беты рабочее пространство изолировано и приватно. Без скрытого доступа и сюрпризов.",
      },
    ],
    closing:
      "Важные обязательства остаются видимыми до завершения — а не только до прочтения уведомления.",
  },
  plans: {
    title: "Тарифы",
    subtitle:
      "Начните с бесплатного пробного периода на 14 дней. Переходите выше только когда продукт этого действительно стоит.",
    note: {
      lead: "Попробуйте Nevora Business OS 14 дней с хранилищем до 500 МБ.",
      points: [
        "ИИ, который вы проверяете",
        "Финансы, которые вы подтверждаете",
        "Свободный выбор после пробного периода",
      ],
    },
  },
  story: {
    title: "Почему существует Nevora",
    paragraphs: [
      "Многие бизнес-инструменты становятся тяжёлыми слишком рано — лишние меню, неиспользуемые функции и ограничения, которые мешают.",
      "Nevora строится в другом направлении: связанное место для задач, денег, документов и подписок, которое понятно без обучения и где важные решения остаются за вами.",
    ],
  },
  contact: {
    title: "Связаться",
    text: "Есть вопрос, идея или сценарий использования? Я читаю каждое сообщение.",
    channels: [
      { label: "Email", value: "nevorahq@gmail.com", href: "mailto:nevorahq@gmail.com" },
      { label: "Telegram", value: "@NEVORAHQ", href: "https://t.me/NEVORAHQ" },
      { label: "Instagram", value: "@nevorahq", href: "https://www.instagram.com/nevorahq/" },
    ],
  },
  footer: {
    tagline: "Простая операционная система для сфокусированной бизнес-работы.",
    note: "Создано для ясности, продуктивности и реального ежедневного использования.",
    productHeading: "Продукт",
    legalHeading: "Правовое",
    terms: "Условия",
    privacy: "Конфиденциальность",
    refunds: "Возвраты",
  },
};

const ro: LandingContent = {
  meta: {
    title: "Nevora Business OS — condu-ți afacerea dintr-un singur spațiu de lucru",
    description:
      "Sarcini, proiecte, finanțe, documente și abonamente într-un singur sistem. Nevora sugerează pasul următor, iar modificările importante rămân sub controlul tău.",
  },
  nav: [
    { label: "Acasă", href: "#home" },
    { label: "Cum funcționează", href: "#how" },
    { label: "Domenii", href: "#areas" },
    { label: "Prețuri", href: "#pricing" },
    { label: "Contact", href: "#contact" },
  ],
  header: {
    login: "Autentificare",
    cta: "Începe perioada de probă de 14 zile",
    menu: "Deschide meniul",
    close: "Închide meniul",
  },
  hero: {
    title: "Condu-ți afacerea dintr-un singur spațiu de lucru conectat.",
    subtitle:
      "Sarcinile, proiectele, finanțele, documentele și abonamentele sunt reunite într-un singur sistem. Nevora sugerează pasul următor, iar modificările importante rămân sub controlul tău.",
    trust: "IA propune. Tu verifici. Acțiunile financiare nu se execută automat.",
    primaryCta: "Începe perioada de probă de 14 zile",
    secondaryCta: "Vezi prețurile",
    microcopy: "Versiune beta privată · probă de 14 zile · 500 MB stocare · fără card.",
    audience: "Pentru echipe mici și în creștere care vor ordine fără programe grele.",
  },
  how: {
    title: "Adaugă, verifică, execută",
    subtitle:
      "Un singur ciclu simplu ține munca în mișcare. Tu controlezi fiecare pas — nimic important nu se întâmplă fără tine.",
    steps: [
      {
        badge: "1",
        title: "Adaugă",
        text: "Pune o sarcină, un document, o notă sau un abonament într-un singur loc. Fără formulare de învățat, fără context pierdut.",
      },
      {
        badge: "2",
        title: "Verifică",
        text: "Nevora citește ce ai adăugat și sugerează pasul următor. Verifici sugestia înainte ca ceva să fie aplicat.",
      },
      {
        badge: "3",
        title: "Execută",
        text: "Confirmi, iar acțiunea este înregistrată și conectată. Plățile și modificările de bani au loc doar când le aprobi.",
      },
    ],
  },
  areas: {
    title: "Un singur sistem pentru munca pe care deja o faci",
    subtitle:
      "Nevora conectează părțile active ale afacerii, ca să pierzi mai puțin timp comutând între instrumente.",
    items: [
      {
        title: "Sarcini și proiecte",
        text: "Creează lucru, atribuie responsabili și păstrează execuția conectată la context.",
      },
      {
        title: "Bani și flux de numerar",
        text: "Urmărește venituri și cheltuieli și vezi fluxul de numerar — sugestiile nu se înregistrează singure ca fapte.",
      },
      {
        title: "Documente",
        text: "Stochează facturi și bonuri și conectează-le cu sarcini, bani și abonamente.",
      },
      {
        title: "Abonamente",
        text: "Urmărește plățile recurente și marchează-le ca plătite doar când plata chiar a avut loc.",
      },
      {
        title: "Mesaje primite",
        text: "Adaugă rapid orice, apoi verifică și decide ce trebuie să devină acțiune.",
      },
      {
        title: "Analitică",
        text: "O privire simplă asupra sarcinilor, cheltuielilor, abonamentelor și a ce urmează.",
      },
    ],
  },
  control: {
    title: "Control, securitate și rolul IA",
    subtitle:
      "Nevora este, prin proiectare, un asistent. Te ajută să decizi mai repede, dar decizia rămâne mereu a ta.",
    points: [
      {
        title: "IA propune — tu decizi",
        text: "Fiecare rezultat al IA este o sugestie pe care o verifici. Nimic nu se aplică până nu confirmi.",
      },
      {
        title: "Finanțe doar după confirmare",
        text: "Modificările de bani nu sunt niciodată automate. O plată sau o cheltuială se înregistrează doar după ce o aprobi.",
      },
      {
        title: "Datele tale rămân ale tale",
        text: "În versiunea beta privată spațiul de lucru este izolat și privat. Fără partajare ascunsă, fără surprize.",
      },
    ],
    closing:
      "Obligațiile importante rămân vizibile până sunt rezolvate — nu doar până este citită o notificare.",
  },
  plans: {
    title: "Prețuri",
    subtitle:
      "Începe cu o perioadă de probă gratuită de 14 zile. Treci mai sus doar când produsul chiar merită.",
    note: {
      lead: "Încearcă Nevora Business OS timp de 14 zile cu până la 500 MB de stocare.",
      points: [
        "IA pe care o verifici",
        "Finanțe pe care le confirmi",
        "Alegere liberă după probă",
      ],
    },
  },
  story: {
    title: "De ce există Nevora",
    paragraphs: [
      "Multe instrumente de business devin grele prea devreme — meniuri în plus, funcții nefolosite și limite care încurcă.",
      "Nevora se construiește în direcția opusă: un loc conectat pentru sarcini, bani, documente și abonamente, pe care îl înțelegi fără training, unde deciziile importante rămân la tine.",
    ],
  },
  contact: {
    title: "Ia legătura",
    text: "Ai o întrebare, o idee sau un scenariu de lucru? Citesc fiecare mesaj.",
    channels: [
      { label: "Email", value: "nevorahq@gmail.com", href: "mailto:nevorahq@gmail.com" },
      { label: "Telegram", value: "@NEVORAHQ", href: "https://t.me/NEVORAHQ" },
      { label: "Instagram", value: "@nevorahq", href: "https://www.instagram.com/nevorahq/" },
    ],
  },
  footer: {
    tagline: "Un sistem operațional simplu pentru lucru de business concentrat.",
    note: "Construit pentru claritate, productivitate și utilizare zilnică reală.",
    productHeading: "Produs",
    legalHeading: "Legal",
    terms: "Termeni",
    privacy: "Confidențialitate",
    refunds: "Rambursări",
  },
};

const CONTENT: Record<LandingLocale, LandingContent> = { en, ru, ro };

/** Возвращает контент лендинга для текущей публичной локали. */
export function getLandingContent(locale: LandingLocale): LandingContent {
  return CONTENT[locale];
}
