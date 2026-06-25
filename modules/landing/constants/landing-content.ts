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
  /** Числовые лимиты (workspace, задачи, клиенты и т.д.). Пусто для триала. */
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

// TODO(pricing): когда появится реальный flow выбора тарифа/чекаута —
// заменить ROUTES.register на соответствующий маршрут с ?plan=<id>.
const enPlans: PricingPlan[] = [
  {
    id: "trial",
    name: "Free Trial",
    price: "€0",
    period: "/ 14 days",
    description: "Try Nevora Business OS in real work before choosing a plan.",
    members: "2 members",
    maxMembers: null,
    extraMember: null,
    storage: "500 MB",
    limits: [],
    features: [
      "Tasks preview",
      "CRM preview",
      "Money tracking preview",
      "Documents preview",
      "Subscriptions preview",
      "Basic analytics preview",
      "Limited AI assistance",
      "No pressure to upgrade",
    ],
    highlight: null,
    bestFor: "Testing the product with your real workflow.",
    cta: "Start free trial",
    microcopy: "No forced upgrade. Use it, test it, decide calmly.",
  },
  {
    id: "start",
    name: "Start",
    price: "€9",
    period: "/ month",
    description:
      "For solo users who want to organize work without complexity.",
    members: "1 member included",
    maxMembers: "Up to 3 members",
    extraMember: "Extra member: €5 / month",
    storage: "1 GB",
    limits: [
      "1 workspace",
      "Up to 500 tasks",
      "Up to 100 CRM clients",
      "Up to 50 deals",
      "Up to 100 documents",
      "Up to 25 subscriptions",
      "Up to 500 money transactions",
      "50 AI requests / month",
    ],
    features: [
      "Tasks",
      "Basic CRM",
      "Simple money tracking",
      "Subscription tracking",
      "Basic documents",
      "Basic analytics",
      "Basic AI assistance",
    ],
    highlight: null,
    bestFor: "Freelancers, solo founders and personal business organization.",
    cta: "Coming soon",
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
    maxMembers: "Up to 8 members",
    extraMember: "Extra member: €9 / month",
    storage: "10 GB",
    limits: [
      "3 workspaces",
      "Up to 5,000 tasks",
      "Up to 2,000 CRM clients",
      "Up to 1,000 deals",
      "Up to 2,000 documents",
      "Up to 250 subscriptions",
      "Up to 10,000 money transactions",
      "300 AI requests / month",
    ],
    features: [
      "Everything in Start",
      "Full CRM",
      "Clients and contacts",
      "Deals pipeline",
      "Advanced task organization",
      "Documents",
      "Standard analytics",
      "AI summaries",
      "Basic roles",
      "Activity history",
    ],
    highlight: "Most practical for small teams",
    bestFor: "Consultants, small teams, agencies and growing operations teams.",
    cta: "Coming soon",
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
      "Up to 25,000 tasks",
      "Up to 10,000 CRM clients",
      "Up to 5,000 deals",
      "Up to 10,000 documents",
      "Up to 1,000 subscriptions",
      "Up to 50,000 money transactions",
      "1,500 AI requests / month",
    ],
    features: [
      "Everything in Pro",
      "Team workspaces",
      "Shared CRM",
      "Business analytics",
      "Advanced AI summaries",
      "Roles and permissions",
      "Audit history",
      "Business reports",
      "Team-ready workflows",
      "Priority support",
    ],
    highlight: null,
    bestFor: "Small businesses, agencies, service teams and sales teams.",
    cta: "Coming soon",
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
      "Попробуйте Nevora Business OS в реальной работе, прежде чем выбрать тариф.",
    members: "2 участника",
    maxMembers: null,
    extraMember: null,
    storage: "500 МБ",
    limits: [],
    features: [
      "Превью задач",
      "Превью CRM",
      "Превью учёта денег",
      "Превью документов",
      "Превью подписок",
      "Базовая аналитика — превью",
      "Ограниченный AI-ассистент",
      "Без давления на апгрейд",
    ],
    highlight: null,
    bestFor: "Тест продукта на вашем реальном рабочем процессе.",
    cta: "Начать пробный период",
    microcopy: "Без принудительного апгрейда. Используйте, тестируйте и решайте спокойно.",
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
      "До 100 CRM-клиентов",
      "До 50 сделок",
      "До 100 документов",
      "До 25 подписок",
      "До 500 финансовых операций",
      "50 AI-запросов / месяц",
    ],
    features: [
      "Задачи",
      "Базовая CRM",
      "Простой учёт денег",
      "Учёт подписок",
      "Базовые документы",
      "Базовая аналитика",
      "Базовый AI-ассистент",
    ],
    highlight: null,
    bestFor: "Фрилансеры, solo founders и личная организация бизнеса.",
    cta: "Скоро будет доступен",
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
    maxMembers: "До 8 участников",
    extraMember: "Дополнительный участник: €9 / месяц",
    storage: "10 ГБ",
    limits: [
      "3 workspace",
      "До 5 000 задач",
      "До 2 000 CRM-клиентов",
      "До 1 000 сделок",
      "До 2 000 документов",
      "До 250 подписок",
      "До 10 000 финансовых операций",
      "300 AI-запросов / месяц",
    ],
    features: [
      "Всё из Start",
      "Полная CRM",
      "Клиенты и контакты",
      "Pipeline сделок",
      "Расширенная организация задач",
      "Документы",
      "Стандартная аналитика",
      "AI-сводки",
      "Базовые роли",
      "История активности",
    ],
    highlight: "Самый практичный для малых команд",
    bestFor: "Консультанты, малые команды, агентства и растущие операционные команды.",
    cta: "Скоро будет доступен",
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
      "До 25 000 задач",
      "До 10 000 CRM-клиентов",
      "До 5 000 сделок",
      "До 10 000 документов",
      "До 1 000 подписок",
      "До 50 000 финансовых операций",
      "1 500 AI-запросов / месяц",
    ],
    features: [
      "Всё из Pro",
      "Командные workspace",
      "Общая CRM",
      "Бизнес-аналитика",
      "Расширенные AI-сводки",
      "Роли и права доступа",
      "История аудита",
      "Бизнес-отчёты",
      "Командные workflows",
      "Приоритетная поддержка",
    ],
    highlight: null,
    bestFor: "Малый бизнес, агентства, сервисные команды и sales-команды.",
    cta: "Скоро будет доступен",
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
    startFree: "Start free",
  },
  hero: {
    title: "A simple Business OS for focused work.",
    subtitle:
      "Nevora Business OS helps small businesses keep tasks, clients, money, documents, subscriptions, analytics and AI in one clear system.",
    supporting: [
      "I'm building this product not for complex features and endless upgrades.",
    ],
    goal: "The goal is simpler: less chaos, fewer scattered tools, more control over your working day.",
    primaryCta: "Start free trial",
    secondaryCta: "See plans",
    microcopy: "14 days free. Up to 500 MB storage. No pressure to upgrade.",
  },
  value: {
    title: "What Nevora Business OS helps you do",
    text: "The system brings the key parts of your business into one place, so you understand faster what is happening and what needs attention.",
    items: [
      "Tasks",
      "CRM",
      "Clients",
      "Deals",
      "Documents",
      "Subscriptions",
      "Money tracking",
      "Business analytics",
      "AI assistant",
    ],
    supporting:
      "Open your workspace, see what matters, make a decision and move on.",
  },
  about: {
    title: "About the project",
    paragraphs: [
      "Nevora Business OS is being built because many business tools become too heavy too early.",
      "First you need something simple: tasks, clients, money, documents and recurring processes. Then the software turns into complex menus, extra dashboards, limits and features nobody uses.",
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
      "Business does not need another ten tabs. It needs a clear place where work, clients, money and decisions connect.",
      "Nevora Business OS is being built as a practical operating system for small and growing businesses.",
    ],
    questionsIntro: "A useful system should help you answer simple questions:",
    questions: [
      "What needs to be done?",
      "Who is responsible?",
      "Which clients matter now?",
      "Where does money come from?",
      "What needs attention today?",
    ],
    closing: "That is the core of the product.",
  },
  plans: {
    title: "Plans",
    subtitle:
      "Start simple. Move up only when the product truly gives you value.",
    explanation:
      "Every plan is predictable: included members, clear limits and transparent pricing for extra members.",
    storageLabel: "Storage",
    bestForLabel: "Best for:",
    items: enPlans,
    trialNote: {
      lead: "You can try Nevora Business OS for 14 days with up to 500 MB of storage.",
      body: "The trial exists so you can test the product in real work, not just click through an empty demo.",
      points: [
        "No pressure.",
        "No forced upgrade.",
        "Use it, test it, decide if it helps.",
      ],
    },
  },
  trialDetails: {
    title: "What's included in the trial?",
    intro: [
      "The trial gives you 14 days of free access to Nevora Business OS. You can add up to 2 members, use 500 MB of storage and test the core modules: tasks, CRM, money tracking, documents, subscriptions, basic analytics and a limited AI assistant.",
      "This is not a demo for the sake of a demo. The trial exists so you can check the system on a real workflow: add tasks, clients, deals, documents, subscriptions and basic financial data.",
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
        title: "Tasks preview",
        text: "Create tasks, assign owners and see whether the system helps keep work under control.",
      },
      {
        title: "CRM preview",
        text: "Add clients, contacts and deals to check how comfortable sales and communication feel.",
      },
      {
        title: "Money tracking preview",
        text: "Check basic income, expense and cashflow tracking without a complex accounting system.",
      },
      {
        title: "Documents preview",
        text: "Store working materials and link them to tasks, clients and deals.",
      },
      {
        title: "Subscriptions preview",
        text: "Add recurring expenses and see whether the system helps you spot future payments early.",
      },
      {
        title: "Basic analytics",
        text: "Get a simple overview of tasks, clients, deals, expenses and upcoming actions.",
      },
      {
        title: "Limited AI assistant",
        text: "Try AI summaries and simple recommendations on your real data.",
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
      "I'm open to feedback from people who actually manage tasks, clients, money and daily business processes.",
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
    startFree: "Начать бесплатно",
  },
  hero: {
    title: "Простая Business OS для сфокусированной работы.",
    subtitle:
      "Nevora Business OS помогает малому бизнесу держать задачи, клиентов, деньги, документы, подписки, аналитику и AI в одной понятной системе.",
    supporting: [
      "Я создаю этот продукт не ради сложных функций и бесконечных апгрейдов.",
    ],
    goal: "Цель проще: меньше хаоса, меньше разрозненных инструментов, больше контроля над рабочим днём.",
    primaryCta: "Начать пробный период",
    secondaryCta: "Посмотреть тарифы",
    microcopy: "14 дней бесплатно. До 500 МБ хранилища. Без давления на апгрейд.",
  },
  value: {
    title: "Что помогает делать Nevora Business OS",
    text: "Система собирает ключевые части бизнеса в одном месте, чтобы вы быстрее понимали, что происходит и что требует внимания.",
    items: [
      "Задачи",
      "CRM",
      "Клиенты",
      "Сделки",
      "Документы",
      "Подписки",
      "Учёт денег",
      "Бизнес-аналитика",
      "AI-ассистент",
    ],
    supporting:
      "Откройте workspace, посмотрите главное, примите решение и двигайтесь дальше.",
  },
  about: {
    title: "О проекте",
    paragraphs: [
      "Nevora Business OS создаётся потому, что многие бизнес-инструменты становятся слишком тяжёлыми слишком рано.",
      "Сначала вам нужно простое решение: задачи, клиенты, деньги, документы и регулярные процессы. Потом software превращается в сложные меню, лишние dashboards, ограничения и функции, которыми никто не пользуется.",
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
      "Бизнесу не нужны ещё десять вкладок. Ему нужно понятное место, где работа, клиенты, деньги и решения связаны между собой.",
      "Nevora Business OS создаётся как практичная операционная система для малого и растущего бизнеса.",
    ],
    questionsIntro: "Полезная система должна помогать отвечать на простые вопросы:",
    questions: [
      "Что нужно сделать?",
      "Кто отвечает?",
      "Какие клиенты важны сейчас?",
      "Где появляются деньги?",
      "Что требует внимания сегодня?",
    ],
    closing: "Это основа продукта.",
  },
  plans: {
    title: "Тарифы",
    subtitle:
      "Начните просто. Переходите выше только тогда, когда продукт действительно даёт вам пользу.",
    explanation:
      "Каждый тариф сделан предсказуемым: включённые участники, понятные лимиты и прозрачная стоимость дополнительных участников.",
    storageLabel: "Хранилище",
    bestForLabel: "Подходит:",
    items: ruPlans,
    trialNote: {
      lead: "Вы можете попробовать Nevora Business OS 14 дней с хранилищем до 500 МБ.",
      body: "Пробный период существует, чтобы вы протестировали продукт в реальной работе, а не просто прокликали пустое демо.",
      points: [
        "Без давления.",
        "Без принудительного апгрейда.",
        "Используйте, тестируйте, решайте, помогает ли это.",
      ],
    },
  },
  trialDetails: {
    title: "Что входит в пробный период?",
    intro: [
      "Пробный период даёт 14 дней бесплатного доступа к Nevora Business OS. Вы можете добавить до 2 участников, использовать 500 МБ хранилища и протестировать основные модули: задачи, CRM, учёт денег, документы, подписки, базовую аналитику и ограниченный AI-ассистент.",
      "Это не демо ради демо. Пробный период создан, чтобы вы могли проверить систему на реальном рабочем процессе: добавить задачи, клиентов, сделки, документы, подписки и базовые финансовые данные.",
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
        title: "Превью задач",
        text: "Создавайте задачи, назначайте ответственных и проверяйте, помогает ли система держать работу под контролем.",
      },
      {
        title: "Превью CRM",
        text: "Добавьте клиентов, контакты и сделки, чтобы проверить удобство работы с продажами и коммуникацией.",
      },
      {
        title: "Превью учёта денег",
        text: "Проверьте базовый учёт доходов, расходов и cashflow без сложной бухгалтерской системы.",
      },
      {
        title: "Превью документов",
        text: "Храните рабочие материалы и связывайте их с задачами, клиентами и сделками.",
      },
      {
        title: "Превью подписок",
        text: "Добавьте регулярные расходы и проверьте, помогает ли система видеть будущие платежи заранее.",
      },
      {
        title: "Базовая аналитика",
        text: "Получите простой обзор задач, клиентов, сделок, расходов и ближайших действий.",
      },
      {
        title: "Ограниченный AI-ассистент",
        text: "Проверьте AI-сводки и простые рекомендации на ваших реальных данных.",
      },
      {
        title: "Без давления на апгрейд",
        text: "Используйте 14 дней, проверьте пользу и переходите на платный тариф только если продукт действительно помогает.",
      },
    ],
  },
  contact: {
    title: "Contact",
    text: "Есть вопрос, идея или рабочий сценарий?",
    text2:
      "Я открыт к обратной связи от людей, которые реально управляют задачами, клиентами, деньгами и ежедневными бизнес-процессами.",
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
