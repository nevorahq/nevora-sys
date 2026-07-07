import type { Locale } from "@/shared/i18n/constants";

/**
 * Контент лендинга Nevora Business OS — локализованный (en / ru).
 *
 * Почему не в общих словарях shared/i18n: их тип `DeepString<typeof en>`
 * сводит листья к `string` и не поддерживает массивы — а лендинг состоит
 * из списков (features, limits, questions, items). Здесь мы держим
 * собственный строго типизированный контент: `LandingContent = typeof en`,
 * а `ru` структурно проверяется на соответствие `en`.
 *
 * Язык выбирается по той же locale-cookie, что и всё приложение
 * (см. getLandingContent ниже). Контакты — PLACEHOLDER: замени значения
 * в channels на реальные, когда появятся (они одинаковы для всех локалей).
 *
 * Тон: честный founder-led копирайт. Без хайпа, фейковых цифр,
 * фейковых отзывов, фейковых скидок и логотипов.
 */

export const BRAND = "Nevora Business OS";

/**
 * Один тариф.
 *
 * Формула стоимости (на лендинге не показывается явно, чтобы не перегружать):
 *   monthly = base_price + max(0, members - included) × extra_member_price
 */
export interface PricingPlan {
  id: string;
  name: string;
  /** Базовая цена, напр. "€9". Для триала "€0". */
  price: string;
  /** Период: "/ month" / "/ месяц" или "/ 14 days" / "/ 14 дней". */
  period: string;
  description: string;
  /** Включённые участники (готовая локализованная строка): "1 member included". */
  members: string;
  /** Максимум участников: "Up to 3 members". null — для триала (фиксировано). */
  maxMembers: string | null;
  /** Доплата за участника: "Extra member: €5 / month". null — нет доплаты. */
  extraMember: string | null;
  /** Хранилище: "500 MB", "1 GB". */
  storage: string;
  /** Числовые лимиты (workspace, задачи и активные рабочие сущности). */
  limits: string[];
  /** Ключевые возможности (capabilities). */
  features: string[];
  /** Бейдж-хайлайт (только у Pro). null — без бейджа. */
  highlight: string | null;
  bestFor: string;
  cta: string;
  /** Доп. микрокопирайт под CTA (есть только у триала). null — нет. */
  microcopy: string | null;
}

// TODO(pricing): when checkout is live, replace ROUTES.register with the
// approved plan-selection route. Until then, landing CTAs stay private-beta
// oriented and pricing copy only advertises active modules.
const enPlans: PricingPlan[] = [
  {
    id: "trial",
    name: "Free Trial",
    price: "€0",
    period: "/ 14 days",
    description: "Private beta access for validating the workspace on real work.",
    members: "2 members",
    maxMembers: null,
    extraMember: null,
    storage: "500 MB",
    limits: [
      "1 workspace",
      "Up to 100 tasks",
      "Up to 25 documents",
      "Up to 10 subscriptions",
      "Up to 100 money transactions",
      "20 AI requests / month",
    ],
    features: [
      "Tasks and projects",
      "Money tracking",
      "Documents and subscriptions",
      "Action Center preview",
      "Capture Inbox preview",
      "AI suggestions with review",
    ],
    highlight: null,
    bestFor: "Evaluating the product with one focused workflow.",
    cta: "Request early access",
    microcopy: "Private beta. Use it, test it, decide calmly.",
  },
  {
    id: "start",
    name: "Start",
    price: "€9",
    period: "/ month",
    description:
      "For solo operators who want tasks, documents, subscriptions and money in one place.",
    members: "1 member included",
    maxMembers: "Up to 3 members",
    extraMember: "Extra member: €5 / month",
    storage: "1 GB",
    limits: [
      "1 workspace",
      "Up to 500 tasks",
      "Up to 100 documents",
      "Up to 25 subscriptions",
      "Up to 500 money transactions",
      "50 AI requests / month",
    ],
    features: [
      "Tasks",
      "Projects",
      "Money tracking",
      "Documents",
      "Subscriptions",
      "Action Center",
      "Basic analytics",
      "AI suggestions with review",
    ],
    highlight: null,
    bestFor: "Freelancers, solo founders and focused business operators.",
    cta: "Join private beta",
    microcopy: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: "€29",
    period: "/ month",
    description:
      "For professionals and small teams that need structure and visibility.",
    members: "3 members included",
    maxMembers: "Up to 10 members",
    extraMember: "Extra member pricing: included in plan setup",
    storage: "10 GB",
    limits: [
      "3 workspaces",
      "Up to 5,000 tasks",
      "Up to 1,000 documents",
      "Up to 250 subscriptions",
      "Up to 5,000 money transactions",
      "500 AI requests / month",
      "Developer access",
    ],
    features: [
      "Everything in Start",
      "Cross-module relations",
      "Document extraction review",
      "Subscription payment workflow",
      "Financial context tasks",
      "Capture Inbox",
      "Standard analytics",
      "AI summaries with approval",
      "Developer API keys",
      "Basic roles",
      "Activity history",
    ],
    highlight: "Most practical for small teams",
    bestFor: "Consultants, small teams, agencies and growing operations teams.",
    cta: "Join private beta",
    microcopy: null,
  },
  {
    id: "business",
    name: "Business",
    price: "€69",
    period: "/ month",
    description:
      "For teams that need one shared business workspace with more control.",
    members: "8 members included",
    maxMembers: "Up to 30 members",
    extraMember: "Extra member: €10 / month",
    storage: "50 GB",
    limits: [
      "10 workspaces",
      "Unlimited tasks",
      "Unlimited documents",
      "Unlimited subscriptions",
      "Unlimited money transactions",
      "Unlimited AI requests",
      "Developer workflows",
    ],
    features: [
      "Everything in Pro",
      "Team workspaces",
      "Shared operating layer",
      "Business analytics",
      "Advanced AI suggestions with approval",
      "Roles and permissions",
      "Audit history",
      "Plans, usage limits and trial guard",
      "Public API and webhooks",
      "Team-ready workflows",
      "Priority support",
    ],
    highlight: null,
    bestFor: "Small businesses, agencies, service teams and operations teams.",
    cta: "Join private beta",
    microcopy: null,
  },
];

const ruPlans: PricingPlan[] = [
  {
    id: "trial",
    name: "Пробный период",
    price: "€0",
    period: "/ 14 дней",
    description:
      "Доступ к private beta, чтобы проверить workspace на реальной работе.",
    members: "2 участника",
    maxMembers: null,
    extraMember: null,
    storage: "500 МБ",
    limits: [
      "1 workspace",
      "До 100 задач",
      "До 25 документов",
      "До 10 подписок",
      "До 100 финансовых операций",
      "20 AI-запросов / месяц",
    ],
    features: [
      "Задачи и проекты",
      "Учёт денег",
      "Документы и подписки",
      "Превью Action Center",
      "Превью Capture Inbox",
      "AI-рекомендации с проверкой",
    ],
    highlight: null,
    bestFor: "Оценка продукта на одном сфокусированном рабочем процессе.",
    cta: "Запросить ранний доступ",
    microcopy: "Private beta. Используйте, тестируйте и решайте спокойно.",
  },
  {
    id: "start",
    name: "Start",
    price: "€9",
    period: "/ месяц",
    description:
      "Для solo-пользователей, которые хотят организовать работу без сложности.",
    members: "1 участник включён",
    maxMembers: "До 3 участников",
    extraMember: "Дополнительный участник: €5 / месяц",
    storage: "1 ГБ",
    limits: [
      "1 workspace",
      "До 500 задач",
      "До 100 документов",
      "До 25 подписок",
      "До 500 финансовых операций",
      "50 AI-запросов / месяц",
    ],
    features: [
      "Задачи",
      "Проекты",
      "Учёт денег",
      "Документы",
      "Подписки",
      "Action Center",
      "Базовая аналитика",
      "AI-рекомендации с проверкой",
    ],
    highlight: null,
    bestFor: "Фрилансеры, solo founders и сфокусированные бизнес-операторы.",
    cta: "Вступить в private beta",
    microcopy: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: "€29",
    period: "/ месяц",
    description:
      "Для профессионалов и небольших команд, которым нужна структура и видимость.",
    members: "3 участника включены",
    maxMembers: "До 10 участников",
    extraMember: "Стоимость дополнительных участников: в настройке тарифа",
    storage: "10 ГБ",
    limits: [
      "3 workspace",
      "До 5 000 задач",
      "До 1 000 документов",
      "До 250 подписок",
      "До 5 000 финансовых операций",
      "500 AI-запросов / месяц",
      "Developer Access",
    ],
    features: [
      "Всё из Start",
      "Связи между модулями",
      "Проверка извлечений из документов",
      "Workflow оплаты подписок",
      "Финансовый контекст задач",
      "Capture Inbox",
      "Стандартная аналитика",
      "AI-сводки с подтверждением",
      "Developer API keys",
      "Базовые роли",
      "История активности",
    ],
    highlight: "Самый практичный для малых команд",
    bestFor: "Консультанты, малые команды, агентства и растущие операционные команды.",
    cta: "Вступить в private beta",
    microcopy: null,
  },
  {
    id: "business",
    name: "Business",
    price: "€69",
    period: "/ месяц",
    description:
      "Для команд, которым нужен общий бизнес-workspace с большим контролем.",
    members: "8 участников включены",
    maxMembers: "До 30 участников",
    extraMember: "Дополнительный участник: €10 / месяц",
    storage: "50 ГБ",
    limits: [
      "10 workspace",
      "Безлимитные задачи",
      "Безлимитные документы",
      "Безлимитные подписки",
      "Безлимитные финансовые операции",
      "Безлимитные AI-запросы",
      "Developer workflows",
    ],
    features: [
      "Всё из Pro",
      "Командные workspace",
      "Общий операционный слой",
      "Бизнес-аналитика",
      "Расширенные AI-рекомендации с подтверждением",
      "Роли и права доступа",
      "История аудита",
      "Тарифы, лимиты и trial guard",
      "Public API и webhooks",
      "Командные workflows",
      "Приоритетная поддержка",
    ],
    highlight: null,
    bestFor: "Малый бизнес, агентства, сервисные команды и операционные команды.",
    cta: "Вступить в private beta",
    microcopy: null,
  },
];

const en = {
  nav: [
    { label: "Home", href: "#home" },
    { label: "About", href: "#about" },
    { label: "Plan", href: "#plan" },
    { label: "Contact", href: "#contact" },
  ],
  header: {
    login: "Log in",
    startFree: "Request access",
  },
  hero: {
    title: "Connected Business Operations.",
    subtitle:
      "Nevora Business OS connects tasks, projects, money, documents, subscriptions, Action Center and AI-assisted workflows in one clear operating layer.",
    supporting: [
      "AI-assisted, not AI-controlled.",
      "Financial control without automatic mistakes.",
    ],
    goal: "Capture first. Decide after. Important obligations stay visible until resolved.",
    primaryCta: "Request early access",
    secondaryCta: "See plans",
    microcopy: "Private beta. 14-day trial, 500 MB storage, review-first workflows.",
  },
  value: {
    title: "What Nevora Business OS helps you do",
    text: "The system brings the active parts of your operations into one place, so you understand faster what is happening and what needs attention.",
    items: [
      "Tasks",
      "Projects",
      "Action Center",
      "Relations",
      "Documents",
      "Subscriptions",
      "Money tracking",
      "Capture Inbox",
      "Business analytics",
      "AI suggestions",
      "Developer Access",
    ],
    supporting:
      "Open your workspace, see obligations, review suggestions, confirm financial actions and move forward with a recorded workflow.",
  },
  about: {
    title: "About the project",
    paragraphs: [
      "Nevora Business OS is being built because many business tools become too heavy too early.",
      "First you need a connected place for tasks, projects, money, documents, subscriptions and recurring obligations. Then software often turns into complex menus, extra dashboards, limits and features nobody uses.",
      "I want to build the product in a different direction.",
    ],
    principles: [
      {
        title: "Simple by default",
        text: "You should understand your workspace without training.",
      },
      {
        title: "Useful before complex",
        text: "Every module must solve a real work problem, not exist just for show.",
      },
      {
        title: "Honest value",
        text: "The product should earn trust through usefulness, transparency and convenience.",
      },
    ],
    closing:
      "This is not a tool made to sell complexity back to the user. It is a working system for people who need order in their business.",
  },
  philosophy: {
    title: "Less noise. More control.",
    paragraphs: [
      "Business does not need another ten tabs. It needs a clear place where work, documents, subscriptions, money and decisions connect.",
      "Nevora Business OS is being built as a practical operating system for small and growing businesses.",
    ],
    questionsIntro: "A useful system should help you answer simple questions:",
    questions: [
      "What needs to be done?",
      "Who is responsible?",
      "Which obligation needs attention now?",
      "Which financial action is ready to confirm?",
      "What needs attention today?",
    ],
    closing: "Important obligations do not disappear just because a notification was read.",
  },
  plans: {
    title: "Plans",
    subtitle:
      "Start simple. Move up only when the product truly gives you value.",
    explanation:
      "Every plan is predictable: included members, active-module limits and transparent pricing context.",
    storageLabel: "Storage",
    bestForLabel: "Best for:",
    items: enPlans,
    trialNote: {
      lead: "You can try Nevora Business OS for 14 days with up to 500 MB of storage.",
      body: "The trial exists so you can test the product in real work while the product remains in private beta.",
      points: [
        "Review-first AI.",
        "Confirm-first finance.",
        "Use it, test it, decide if it helps.",
      ],
    },
  },
  trialDetails: {
    title: "What's included in the trial?",
    intro: [
      "The trial gives you 14 days of private beta access to Nevora Business OS. You can add up to 2 members, use 500 MB of storage and test tasks, projects, money tracking, documents, subscriptions, Action Center, basic analytics and AI suggestions.",
      "This is not a demo for the sake of a demo. The trial exists so you can check the system on a real workflow: capture work, connect documents, review subscription obligations and confirm financial actions only when they are ready.",
      "After 14 days you can calmly decide whether Start, Pro or Business fits you. No pressure, no forced upgrade and no marketing traps.",
    ],
    items: [
      {
        title: "2 members",
        text: "Check how the system works on your own or together with one teammate.",
      },
      {
        title: "500 MB storage",
        text: "Enough to test documents, files and working materials.",
      },
      {
        title: "Tasks and projects",
        text: "Create work, assign owners and keep execution connected to context.",
      },
      {
        title: "Money tracking",
        text: "Track income, expenses and cashflow without treating suggestions as accounting facts.",
      },
      {
        title: "Documents and relations",
        text: "Store working materials and connect them to tasks, money and subscriptions.",
      },
      {
        title: "Subscriptions",
        text: "Track recurring obligations and use Mark as paid when a payment has really happened.",
      },
      {
        title: "Action Center",
        text: "Keep obligations visible until they are resolved, not merely read.",
      },
      {
        title: "Capture Inbox",
        text: "Capture first, review intent and decide what should become an action.",
      },
      {
        title: "AI suggestions",
        text: "Try summaries and recommendations that require review before anything executes.",
      },
      {
        title: "Basic analytics",
        text: "Get a simple overview of tasks, expenses, subscriptions and upcoming actions.",
      },
      {
        title: "No pressure to upgrade",
        text: "Use the 14 days, check the value and move to a paid plan only if the product really helps.",
      },
    ],
  },
  contact: {
    title: "Contact",
    text: "Have a question, idea or use case?",
    text2:
      "I'm open to feedback from people who actually manage tasks, documents, money, subscriptions and daily business processes.",
    cta: "Get in touch",
    ctaHref: "mailto:hello@nevora.com",
    // PLACEHOLDER: замени на реальные контакты проекта (одинаковы для всех локалей).
    channels: [
      { label: "Email", value: "hello@nevora.com", href: "mailto:hello@nevora.com" },
      { label: "Telegram", value: "@nevora", href: "https://t.me/nevora" },
      { label: "Instagram", value: "@nevora", href: "https://instagram.com/nevora" },
      { label: "Facebook", value: "Nevora", href: "https://facebook.com/nevora" },
    ],
  },
  footer: {
    text: "A simple operating system for focused business work.",
    note: "Built for clarity, productivity and real daily use.",
  },
};

/** Форма контента лендинга. Источник истины — английский объект `en`. */
export type LandingContent = typeof en;

const ru: LandingContent = {
  nav: [
    { label: "Главная", href: "#home" },
    { label: "О проекте", href: "#about" },
    { label: "Тарифы", href: "#plan" },
    { label: "Контакты", href: "#contact" },
  ],
  header: {
    login: "Войти",
    startFree: "Запросить доступ",
  },
  hero: {
    title: "Connected Business Operations.",
    subtitle:
      "Nevora Business OS связывает задачи, проекты, деньги, документы, подписки, Action Center и AI-assisted workflows в одном понятном операционном слое.",
    supporting: [
      "AI-assisted, not AI-controlled.",
      "Финансовый контроль без автоматических ошибок.",
    ],
    goal: "Сначала capture. Потом решение. Важные обязательства остаются видимыми до завершения.",
    primaryCta: "Запросить ранний доступ",
    secondaryCta: "Посмотреть тарифы",
    microcopy: "Private beta. 14-дневный trial, 500 МБ хранилища, workflows с проверкой.",
  },
  value: {
    title: "Что помогает делать Nevora Business OS",
    text: "Система собирает активные части операций в одном месте, чтобы вы быстрее понимали, что происходит и что требует внимания.",
    items: [
      "Задачи",
      "Проекты",
      "Action Center",
      "Связи",
      "Документы",
      "Подписки",
      "Учёт денег",
      "Capture Inbox",
      "Бизнес-аналитика",
      "AI-рекомендации",
      "Developer Access",
    ],
    supporting:
      "Откройте workspace, увидьте обязательства, проверьте рекомендации, подтвердите финансовые действия и двигайтесь дальше с записанным workflow.",
  },
  about: {
    title: "О проекте",
    paragraphs: [
      "Nevora Business OS создаётся потому, что многие бизнес-инструменты становятся слишком тяжёлыми слишком рано.",
      "Сначала нужно связанное место для задач, проектов, денег, документов, подписок и регулярных обязательств. Потом software часто превращается в сложные меню, лишние dashboards, ограничения и функции, которыми никто не пользуется.",
      "Я хочу построить продукт в другом направлении.",
    ],
    principles: [
      {
        title: "Простота по умолчанию",
        text: "Пользователь должен понимать workspace без обучения.",
      },
      {
        title: "Польза до сложности",
        text: "Каждый модуль должен решать реальную рабочую проблему, а не существовать ради галочки.",
      },
      {
        title: "Честная ценность",
        text: "Продукт должен зарабатывать доверие пользой, прозрачностью и удобством.",
      },
    ],
    closing:
      "Это не инструмент, созданный для того, чтобы продавать пользователю сложность. Это рабочая система для людей, которым нужен порядок в бизнесе.",
  },
  philosophy: {
    title: "Меньше шума. Больше контроля.",
    paragraphs: [
      "Бизнесу не нужны ещё десять вкладок. Ему нужно понятное место, где работа, документы, подписки, деньги и решения связаны между собой.",
      "Nevora Business OS создаётся как практичная операционная система для малого и растущего бизнеса.",
    ],
    questionsIntro: "Полезная система должна помогать отвечать на простые вопросы:",
    questions: [
      "Что нужно сделать?",
      "Кто отвечает?",
      "Какое обязательство требует внимания?",
      "Какое финансовое действие готово к подтверждению?",
      "Что требует внимания сегодня?",
    ],
    closing: "Важные обязательства не исчезают только потому, что уведомление было прочитано.",
  },
  plans: {
    title: "Тарифы",
    subtitle:
      "Начните просто. Переходите выше только тогда, когда продукт действительно даёт вам пользу.",
    explanation:
      "Каждый тариф сделан предсказуемым: включённые участники, лимиты активных модулей и прозрачный ценовой контекст.",
    storageLabel: "Хранилище",
    bestForLabel: "Подходит:",
    items: ruPlans,
    trialNote: {
      lead: "Вы можете попробовать Nevora Business OS 14 дней с хранилищем до 500 МБ.",
      body: "Пробный период нужен, чтобы протестировать продукт в реальной работе, пока продукт остаётся в private beta.",
      points: [
        "AI с проверкой.",
        "Финансы только после подтверждения.",
        "Используйте, тестируйте, решайте, помогает ли это.",
      ],
    },
  },
  trialDetails: {
    title: "Что входит в пробный период?",
    intro: [
      "Пробный период даёт 14 дней private beta доступа к Nevora Business OS. Вы можете добавить до 2 участников, использовать 500 МБ хранилища и протестировать задачи, проекты, учёт денег, документы, подписки, Action Center, базовую аналитику и AI-рекомендации.",
      "Это не демо ради демо. Пробный период создан, чтобы проверить систему на реальном workflow: фиксировать работу, связывать документы, проверять обязательства по подпискам и подтверждать финансовые действия только когда они готовы.",
      "Через 14 дней вы сможете спокойно решить, подходит ли вам Start, Pro или Business. Без давления, без принудительного апгрейда и без маркетинговых ловушек.",
    ],
    items: [
      {
        title: "2 участника",
        text: "Проверьте работу системы самостоятельно или вместе с одним членом команды.",
      },
      {
        title: "500 МБ хранилища",
        text: "Достаточно, чтобы протестировать документы, файлы и рабочие материалы.",
      },
      {
        title: "Задачи и проекты",
        text: "Создавайте работу, назначайте ответственных и держите исполнение связанным с контекстом.",
      },
      {
        title: "Учёт денег",
        text: "Отслеживайте доходы, расходы и cashflow, не превращая рекомендации в бухгалтерские факты.",
      },
      {
        title: "Документы и связи",
        text: "Храните рабочие материалы и связывайте их с задачами, деньгами и подписками.",
      },
      {
        title: "Подписки",
        text: "Отслеживайте регулярные обязательства и используйте Mark as paid только когда платёж действительно прошёл.",
      },
      {
        title: "Action Center",
        text: "Держите обязательства видимыми до завершения, а не только до прочтения уведомления.",
      },
      {
        title: "Capture Inbox",
        text: "Сначала зафиксируйте входящий сигнал, затем проверьте intent и решите, что должно стать действием.",
      },
      {
        title: "AI-рекомендации",
        text: "Пробуйте сводки и рекомендации, которые требуют проверки перед выполнением.",
      },
      {
        title: "Базовая аналитика",
        text: "Получите простой обзор задач, расходов, подписок и ближайших действий.",
      },
      {
        title: "Без давления на апгрейд",
        text: "Используйте 14 дней, проверьте пользу и переходите на платный тариф только если продукт действительно помогает.",
      },
    ],
  },
  contact: {
    title: "Контакт",
    text: "Есть вопрос, идея или рабочий сценарий?",
    text2:
      "Я открыт к обратной связи от людей, которые реально управляют задачами, документами, деньгами, подписками и ежедневными бизнес-процессами.",
    cta: "Связаться",
    ctaHref: "mailto:hello@nevora.com",
    channels: [
      { label: "Email", value: "hello@nevora.com", href: "mailto:hello@nevora.com" },
      { label: "Telegram", value: "@nevora", href: "https://t.me/nevora" },
      { label: "Instagram", value: "@nevora", href: "https://instagram.com/nevora" },
      { label: "Facebook", value: "Nevora", href: "https://facebook.com/nevora" },
    ],
  },
  footer: {
    text: "Простая операционная система для сфокусированной бизнес-работы.",
    note: "Создано для ясности, продуктивности и реального ежедневного использования.",
  },
};

const CONTENT: Record<Locale, LandingContent> = { en, ru };

/** Возвращает контент лендинга для текущей локали (по locale-cookie). */
export function getLandingContent(locale: Locale): LandingContent {
  return CONTENT[locale];
}
