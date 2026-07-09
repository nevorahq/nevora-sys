/**
 * Контент лендинга Nevora Business OS — локализованный (en / ro / ru).
 *
 * Почему не в общих словарях shared/i18n: их тип `DeepString<typeof en>`
 * сводит листья к `string` и не поддерживает массивы — а лендинг состоит
 * из списков (features, limits, questions, items). Здесь мы держим
 * собственный строго типизированный контент: `LandingContent = typeof en`.
 *
 * Публичный лендинг поддерживает RO отдельно от shared app locale, потому что
 * dashboard-словари пока есть только для en / ru.
 *
 * Тон: честный founder-led копирайт. Без хайпа, фейковых цифр,
 * фейковых отзывов, фейковых скидок и логотипов.
 */

export const BRAND = "Nevora Business OS";
export const LANDING_LOCALES = ["en", "ro", "ru"] as const;

export type LandingLocale = (typeof LANDING_LOCALES)[number];

export const LANDING_LOCALE_LABELS: Record<LandingLocale, string> = {
  en: "EN",
  ro: "RO",
  ru: "RU",
};

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
    channels: [
      { label: "Email", value: "nevorahq@gmail.com", href: "mailto:nevorahq@gmail.com" },
      { label: "Telegram", value: "@NEVORAHQ", href: "https://t.me/NEVORAHQ" },
      { label: "Instagram", value: "@nevorahq", href: "https://www.instagram.com/nevorahq/" },
      // Facebook временно скрыт — вернуть, когда появится страница проекта.
      // { label: "Facebook", value: "Nevora", href: "https://facebook.com/nevora" },
    ],
  },
  footer: {
    text: "A simple operating system for focused business work.",
    note: "Built for clarity, productivity and real daily use.",
    terms: "Terms",
    privacy: "Privacy",
    refunds: "Refunds",
  },
};

/** Форма контента лендинга. Источник истины — английский объект `en`. */
export type LandingContent = typeof en;

const ro: LandingContent = {
  nav: [
    { label: "Acasă", href: "#home" },
    { label: "Despre", href: "#about" },
    { label: "Planuri", href: "#plan" },
    { label: "Contact", href: "#contact" },
  ],
  header: {
    login: "Autentificare",
    startFree: "Solicită acces",
  },
  hero: {
    title: "Operațiuni de business conectate.",
    subtitle:
      "Nevora Business OS conectează taskuri, proiecte, bani, documente, abonamente, Action Center și workflow-uri asistate de AI într-un singur strat operațional clar.",
    supporting: [
      "AI asistă, nu controlează.",
      "Control financiar fără erori automate.",
    ],
    goal: "Capturezi mai întâi. Decizi după. Obligațiile importante rămân vizibile până sunt rezolvate.",
    primaryCta: "Solicită acces timpuriu",
    secondaryCta: "Vezi planurile",
    microcopy: "Private beta. Trial de 14 zile, 500 MB stocare, workflow-uri cu verificare.",
  },
  value: {
    title: "Ce te ajută să faci Nevora Business OS",
    text: "Sistemul aduce părțile active ale operațiunilor într-un singur loc, ca să înțelegi mai repede ce se întâmplă și ce are nevoie de atenție.",
    items: [
      "Taskuri",
      "Proiecte",
      "Action Center",
      "Relații",
      "Documente",
      "Abonamente",
      "Evidența banilor",
      "Capture Inbox",
      "Analitică de business",
      "Sugestii AI",
      "Developer Access",
    ],
    supporting:
      "Deschizi workspace-ul, vezi obligațiile, revizuiești sugestiile, confirmi acțiunile financiare și mergi mai departe cu un workflow înregistrat.",
  },
  about: {
    title: "Despre proiect",
    paragraphs: [
      "Nevora Business OS este construit pentru că multe instrumente de business devin prea grele prea devreme.",
      "Mai întâi ai nevoie de un loc conectat pentru taskuri, proiecte, bani, documente, abonamente și obligații recurente. Apoi software-ul se transformă des în meniuri complicate, dashboard-uri în plus, limite și funcții pe care nimeni nu le folosește.",
      "Vreau să construiesc produsul într-o direcție diferită.",
    ],
    principles: [
      {
        title: "Simplu implicit",
        text: "Ar trebui să înțelegi workspace-ul fără training.",
      },
      {
        title: "Util înainte de complex",
        text: "Fiecare modul trebuie să rezolve o problemă reală de lucru, nu să existe doar pentru impresie.",
      },
      {
        title: "Valoare onestă",
        text: "Produsul trebuie să câștige încredere prin utilitate, transparență și confort.",
      },
    ],
    closing:
      "Nu este un instrument făcut ca să vândă complexitate înapoi utilizatorului. Este un sistem de lucru pentru oameni care au nevoie de ordine în business.",
  },
  philosophy: {
    title: "Mai puțin zgomot. Mai mult control.",
    paragraphs: [
      "Businessul nu are nevoie de încă zece taburi. Are nevoie de un loc clar unde munca, documentele, abonamentele, banii și deciziile sunt conectate.",
      "Nevora Business OS este construit ca un sistem operațional practic pentru afaceri mici și în creștere.",
    ],
    questionsIntro: "Un sistem util ar trebui să te ajute să răspunzi la întrebări simple:",
    questions: [
      "Ce trebuie făcut?",
      "Cine este responsabil?",
      "Ce obligație are nevoie de atenție acum?",
      "Ce acțiune financiară este gata de confirmare?",
      "Ce are nevoie de atenție astăzi?",
    ],
    closing: "Obligațiile importante nu dispar doar pentru că o notificare a fost citită.",
  },
  plans: {
    title: "Planuri",
    subtitle:
      "Începe simplu. Treci mai sus doar atunci când produsul îți oferă valoare reală.",
    explanation:
      "Fiecare plan este previzibil: membri incluși, limite pentru module active și context de preț transparent.",
    trialNote: {
      lead: "Poți încerca Nevora Business OS timp de 14 zile cu până la 500 MB de stocare.",
      body: "Trialul există ca să testezi produsul în muncă reală, cât timp produsul rămâne în private beta.",
      points: [
        "AI cu revizuire.",
        "Finanțe doar după confirmare.",
        "Folosește, testează și decide dacă te ajută.",
      ],
    },
  },
  trialDetails: {
    title: "Ce este inclus în trial?",
    intro: [
      "Trialul oferă 14 zile de acces private beta la Nevora Business OS. Poți adăuga până la 2 membri, folosi 500 MB de stocare și testa taskuri, proiecte, evidența banilor, documente, abonamente, Action Center, analitică de bază și sugestii AI.",
      "Nu este un demo de dragul unui demo. Trialul există ca să verifici sistemul pe un workflow real: capturezi munca, conectezi documente, revizuiești obligațiile de abonament și confirmi acțiunile financiare doar când sunt pregătite.",
      "După 14 zile poți decide calm dacă Start, Pro sau Business ți se potrivește. Fără presiune, fără upgrade forțat și fără capcane de marketing.",
    ],
    items: [
      {
        title: "2 membri",
        text: "Verifică sistemul singur sau împreună cu un coleg.",
      },
      {
        title: "500 MB stocare",
        text: "Suficient pentru a testa documente, fișiere și materiale de lucru.",
      },
      {
        title: "Taskuri și proiecte",
        text: "Creează lucru, atribuie responsabili și păstrează execuția conectată la context.",
      },
      {
        title: "Evidența banilor",
        text: "Urmărește venituri, cheltuieli și cashflow fără să tratezi sugestiile ca fapte contabile.",
      },
      {
        title: "Documente și relații",
        text: "Stochează materiale de lucru și conectează-le cu taskuri, bani și abonamente.",
      },
      {
        title: "Abonamente",
        text: "Urmărește obligațiile recurente și folosește Mark as paid doar când plata chiar s-a întâmplat.",
      },
      {
        title: "Action Center",
        text: "Păstrează obligațiile vizibile până sunt rezolvate, nu doar până este citită notificarea.",
      },
      {
        title: "Capture Inbox",
        text: "Capturezi mai întâi, revizuiești intenția și decizi ce trebuie să devină acțiune.",
      },
      {
        title: "Sugestii AI",
        text: "Testează rezumate și recomandări care cer revizuire înainte de execuție.",
      },
      {
        title: "Analitică de bază",
        text: "Primești o vedere simplă asupra taskurilor, cheltuielilor, abonamentelor și acțiunilor apropiate.",
      },
      {
        title: "Fără presiune pentru upgrade",
        text: "Folosește cele 14 zile, verifică valoarea și treci la un plan plătit doar dacă produsul chiar ajută.",
      },
    ],
  },
  contact: {
    title: "Contact",
    text: "Ai o întrebare, idee sau un scenariu de lucru?",
    text2:
      "Sunt deschis la feedback de la oameni care gestionează efectiv taskuri, documente, bani, abonamente și procese zilnice de business.",
    cta: "Ia legătura",
    ctaHref: "mailto:hello@nevora.com",
    channels: [
      { label: "Email", value: "nevorahq@gmail.com", href: "mailto:nevorahq@gmail.com" },
      { label: "Telegram", value: "@NEVORAHQ", href: "https://t.me/NEVORAHQ" },
      { label: "Instagram", value: "@nevorahq", href: "https://www.instagram.com/nevorahq/" },
      // Facebook временно скрыт — вернуть, когда появится страница проекта.
      // { label: "Facebook", value: "Nevora", href: "https://facebook.com/nevora" },
    ],
  },
  footer: {
    text: "Un sistem operațional simplu pentru lucru de business concentrat.",
    note: "Construit pentru claritate, productivitate și utilizare zilnică reală.",
    terms: "Termeni",
    privacy: "Confidențialitate",
    refunds: "Rambursări",
  },
};

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
    title: "Связанные бизнес-операции.",
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
      { label: "Email", value: "nevorahq@gmail.com", href: "mailto:nevorahq@gmail.com" },
      { label: "Telegram", value: "@NEVORAHQ", href: "https://t.me/NEVORAHQ" },
      { label: "Instagram", value: "@nevorahq", href: "https://www.instagram.com/nevorahq/" },
      // Facebook временно скрыт — вернуть, когда появится страница проекта.
      // { label: "Facebook", value: "Nevora", href: "https://facebook.com/nevora" },
    ],
  },
  footer: {
    text: "Простая операционная система для сфокусированной бизнес-работы.",
    note: "Создано для ясности, продуктивности и реального ежедневного использования.",
    terms: "Условия",
    privacy: "Конфиденциальность",
    refunds: "Возвраты",
  },
};

const CONTENT: Record<LandingLocale, LandingContent> = { en, ro, ru };

/** Возвращает контент лендинга для текущей публичной локали. */
export function getLandingContent(locale: LandingLocale): LandingContent {
  return CONTENT[locale];
}
