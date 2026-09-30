/**
 * Контент продуктового лендинга Nevora — локализованный (en / ru / ro).
 *
 * Почему не в общих словарях shared/i18n: их тип `DeepString<typeof en>`
 * сводит листья к `string` и не поддерживает массивы — а лендинг состоит
 * из списков (steps, areas, points). Здесь мы держим собственный строго
 * типизированный контент: `LandingContent = typeof en`.
 *
 * Публичный лендинг поддерживает RO наравне с en/ru — как и само приложение:
 * у ro теперь полноценный app-словарь, `toAppLocale` стал тождеством. Поэтому
 * лендинг вправе обещать интерфейс на трёх языках, а не только публичные
 * страницы.
 *
 * Тон: честный founder-led копирайт. Единый глоссарий терминов, без хайпа,
 * без смешения языков, без фейковых цифр и отзывов. Финансовые действия — только
 * после подтверждения пользователя; ИИ ничего не выполняет автоматически.
 *
 * Лендинг описывает ОДНО рабочее пространство с общей боковой панелью (PR #75):
 * Входящие собирают всё из приложения, Telegram, Slack и почты, Nevora готовит
 * черновики, пользователь подтверждает. Обещаем только то, что работает сейчас —
 * например, голосовые в Telegram не упоминаем, пока не подключено распознавание.
 */

import type { PublicLocale } from "@/shared/i18n/constants";

export const BRAND = "Nevora Business OS";

/** Публичные локали лендинга совпадают с общей осью языка приложения. */
export const LANDING_LOCALES = ["en", "ru", "ro"] as const;

export type LandingLocale = PublicLocale;

/**
 * Карточки «что доступно сегодня» — по одной на раздел боковой панели.
 * `id` — стабильный ключ: он связывает локализованный текст с иконкой в
 * `areas-section` и переживает перевод. Порядок и состав одинаковы во всех
 * локалях — это пинит `landing-content.test.ts`.
 */
export const AREA_IDS = ["actions", "inbox", "work", "money", "subscriptions", "documents"] as const;

export type AreaId = (typeof AREA_IDS)[number];

/**
 * Вкладки интерактивного превью. Каждая ведёт в свой раздел приложения через
 * вход (`PREVIEW_ENTRY_ROUTE` в `product-preview-section`).
 */
export const PREVIEW_IDS = ["inbox", "tasks", "finance", "subscriptions"] as const;

export type PreviewId = (typeof PREVIEW_IDS)[number];

/** Вопросы FAQ. Стабильные `id` держат один порядок и состав во всех локалях. */
export const FAQ_IDS = ["beta", "afterTrial", "workspace", "data", "ai", "channels", "languages"] as const;

export type FaqId = (typeof FAQ_IDS)[number];

/**
 * Гарантии секции «как мы это доказываем». Каждая привязана к реальному
 * контрактному тесту (docs/contracts/* + test/release-invariants), поэтому
 * формулировки — проверяемые инварианты, а не маркетинг. Стабильные `id`
 * держат порядок и состав во всех локалях.
 */
export const PROOF_IDS = [
  "money",
  "idempotent",
  "notifications",
  "ai",
  "isolation",
  "privacy",
] as const;

export type ProofId = (typeof PROOF_IDS)[number];

const en = {
  meta: {
    title: "Nevora — capture anything, confirm what matters",
    description:
      "One workspace for small businesses. Send notes, emails, receipts and messages from the app, Telegram, Slack or email — Nevora prepares tasks and expense drafts, and nothing changes until you confirm.",
  },
  nav: [
    { label: "Home", href: "#home" },
    { label: "How it works", href: "#how" },
    { label: "Product", href: "#products" },
    { label: "Pricing", href: "#pricing" },
    { label: "Contact", href: "#contact" },
  ],
  header: {
    login: "Log in",
    // Компактный CTA хедера: кнопка фиксированной высоты (h-9) в одну строку —
    // глагольная форма не помещается в ru/ro. Длительность и условия несёт hero
    // (primaryCta + microcopy).
    cta: "Free trial",
    menu: "Open menu",
    close: "Close menu",
  },
  hero: {
    title: "Capture anything. Confirm what matters.",
    subtitle:
      "Forward an email, message the Telegram bot, send a Slack message or snap a receipt. Nevora turns it into a task or an expense draft and files it in the right place — nothing changes until you confirm.",
    trust: "Nothing is created, posted or paid without your confirmation.",
    primaryCta: "See the product",
    secondaryCta: "Start a 14-day trial",
    microcopy: "Private beta · 14-day trial · 500 MB storage · no card · EN / RU / RO.",
    audience: "For freelancers and small teams who run their own tasks, money and subscriptions.",
  },
  preview: {
    title: "One workspace, one sidebar",
    subtitle:
      "Inbox, Tasks, Finance and Subscriptions live side by side, and the Action Center shows what needs you today across all of them.",
    caption: "Interactive preview — sample data. “Open” takes you to that section after sign-in.",
    tabs: [
      {
        id: "inbox",
        title: "Inbox",
        description:
          "Everything you send to Nevora lands here as a draft. Accept it, edit it or throw it away — your call.",
        metric: "3",
        metricLabel: "drafts to review",
        openLabel: "Open Inbox",
        items: [
          { title: "“Sign the lease renewal by Friday”", meta: "Email · task draft · project Office", status: "Review" },
          { title: "Receipt photo — office supplies", meta: "Telegram · expense draft · €42.50", status: "Review" },
          { title: "“Call the accountant tomorrow at 10”", meta: "Slack · task draft · due tomorrow", status: "Review" },
        ],
      },
      {
        id: "tasks",
        title: "Tasks",
        description:
          "Day-to-day work with priorities, due dates and projects. Tasks you accept from the Inbox arrive in the right project.",
        metric: "12",
        metricLabel: "open tasks",
        openLabel: "Open Tasks",
        items: [
          { title: "Prepare client proposal", meta: "Today · High priority", status: "In progress" },
          { title: "Update release checklist", meta: "Product launch", status: "To do" },
          { title: "Review landing copy", meta: "Marketing", status: "Done" },
        ],
      },
      {
        id: "finance",
        title: "Finance",
        description:
          "Accounts, income, expenses and transfers in several currencies. A receipt becomes an expense only after you confirm it.",
        metric: "€4,280",
        metricLabel: "tracked balance",
        openLabel: "Open Finance",
        items: [],
      },
      {
        id: "subscriptions",
        title: "Subscriptions",
        description:
          "Recurring services, renewal dates and payment reminders — and a list of renewals to decide on before they charge.",
        metric: "3",
        metricLabel: "renewals this month",
        openLabel: "Open Subscriptions",
        items: [
          { title: "Cloud storage", meta: "Renews 24 Oct · €15", status: "Active" },
          { title: "Design tools", meta: "Renews 2 Nov · €24", status: "Decide" },
          { title: "Team calls", meta: "Renews 11 Nov · €12", status: "Active" },
        ],
      },
    ],
    // Строки вкладки «Финансы»: состояние — канонический ключ бейджа, общий для
    // всех локалей (подпись берётся из dict.money.states).
    rows: [
      { name: "Receipt — office supplies", amount: "€42.50", state: "needs_review" },
      { name: "Cloud storage", amount: "€15", state: "paid" },
      { name: "Office rent", amount: "€800", state: "planned" },
    ],
  },
  how: {
    title: "From anywhere to done — you have the last word",
    subtitle: "Three steps. The last one is always yours.",
    steps: [
      {
        badge: "Capture",
        title: "Send it from where you are",
        text: "Type or photograph it in the app, scan a receipt’s QR code, message the Telegram bot, use “Send to Nevora” in Slack or forward an email.",
      },
      {
        badge: "Prepare",
        title: "Nevora drafts it",
        text: "A note becomes a task with a date and a project. A receipt or an invoice becomes an expense draft with its amount and line items.",
      },
      {
        badge: "Confirm",
        title: "You decide",
        text: "Accept, edit or reject it in the Inbox. Only then does it appear in Tasks or Finance — and the Action Center shows what is left.",
      },
    ],
  },
  areas: {
    title: "What is available today",
    subtitle: "Everything below works in the app right now.",
    items: [
      {
        id: "actions",
        title: "Action Center",
        text: "Your home screen: what is overdue, due today or waiting for a decision — across every section.",
      },
      {
        id: "inbox",
        title: "Inbox and channels",
        text: "Capture in the app or from Telegram, Slack and email. Move a draft to another project once, and Nevora remembers it for that source.",
      },
      {
        id: "work",
        title: "Tasks and projects",
        text: "Priorities, due dates, recurring tasks, assignees and projects for you and your team.",
      },
      {
        id: "money",
        title: "Finance",
        text: "Accounts, income, expenses and transfers in several currencies, with rules for categories that repeat.",
      },
      {
        id: "subscriptions",
        title: "Subscriptions",
        text: "Renewal dates, payment reminders and a list of renewals to keep or cancel before they charge.",
      },
      {
        id: "documents",
        title: "Documents",
        text: "Receipts, invoices and contracts stored privately. Nevora reads amounts, dates and line items for you to check.",
      },
    ],
  },
  control: {
    title: "Nevora prepares. You decide.",
    subtitle: "Automation that saves you typing — never one that acts behind your back.",
    points: [
      {
        title: "Confirm-first, always",
        text: "Every draft — a task from Slack, an expense from a receipt — waits in the Inbox until you accept it.",
      },
      {
        title: "It learns from your corrections",
        text: "File a Slack or email capture under another project once, and the next one from that source goes there directly.",
      },
      {
        title: "Only accounts you linked",
        text: "Telegram, Slack and email capture accept messages only from accounts you connected in Settings. Everything else is ignored.",
      },
    ],
    closing: "Channels change where things come from — not who decides.",
  },
  proof: {
    title: "How we prove it, not just say it",
    subtitle:
      "Each guarantee below is a contract test in our codebase. Break it, and the build fails — the promise ships with the code.",
    items: [
      {
        id: "money",
        claim: "Money moves only when you confirm it",
        how: "Nothing posts a transaction on its own — not a receipt, not a subscription, not a finished task. A test checks it, not a convention.",
      },
      {
        id: "idempotent",
        claim: "Marking paid twice records it once",
        how: "Marking the same subscription payment paid twice is a no-op the second time — a retry or a double click cannot duplicate it.",
      },
      {
        id: "notifications",
        claim: "Reading a notice doesn’t resolve it",
        how: "Notification state and task state are separate. Clearing a badge never closes the underlying work.",
      },
      {
        id: "ai",
        claim: "The AI can’t act on its own",
        how: "AI writes only drafts — it can’t post money, mark anything paid, change your plan or permissions, or delete data.",
      },
      {
        id: "isolation",
        claim: "Your workspace is sealed off",
        how: "A request for another workspace’s data comes back empty, as if it didn’t exist — enforced row by row, not by hiding a button.",
      },
      {
        id: "privacy",
        claim: "Analytics never sees your content",
        how: "Usage events carry no document text, file names or email addresses — only that something happened.",
      },
    ],
    closing:
      "These are not badges we drew. Each one fails our build the moment it stops being true.",
  },
  aiLimits: {
    title: "What the AI can do — and what it can never do alone",
    subtitle:
      "This is not a promise; it is enforced in code and checked by our tests on every build.",
    can: {
      title: "AI may",
      points: [
        "Read a document, a receipt or a forwarded email and extract its fields",
        "Turn a note or a message into a task draft with a date and a project",
        "Suggest a category for an expense",
      ],
    },
    cannot: {
      title: "AI may never, on its own",
      points: [
        "Post income or an expense",
        "Mark anything as paid",
        "Change your billing plan",
        "Change anyone’s permissions",
        "Delete your data",
      ],
    },
    closing:
      "Every accepted draft runs through the same module and the same confirmation as a manual action. The AI has no privileged path.",
  },
  plans: {
    title: "Pricing",
    subtitle: "Start with a free 14-day trial. Move up only when the product truly earns it.",
    betaNotice:
      "Nevora is in private beta: the free trial is open to everyone, and paid plans switch on once billing is enabled. No card is charged in the meantime.",
    note: {
      lead: "Try all of Nevora for 14 days with up to 500 MB of storage.",
      points: [
        "Inbox with Telegram, Slack and email",
        "Tasks and projects",
        "Finance and documents",
        "Subscriptions",
      ],
    },
    workspace:
      "One workspace per account during private beta. Invite teammates into it by role; a second separate workspace opens after beta.",
  },
  faq: {
    title: "Questions before you start",
    subtitle: "The honest answers, in plain words.",
    items: [
      {
        id: "beta",
        q: "What does “private beta” mean?",
        a: "The product is live and usable, but paid checkout is not switched on yet. Anyone can start the free 14-day trial without a card; paid plans open once billing is enabled.",
      },
      {
        id: "afterTrial",
        q: "What happens after the 14-day trial?",
        a: "Nothing is charged automatically. When billing opens you choose a plan with higher monthly limits, or keep going on the free tier. The decision is yours — we never auto-upgrade you.",
      },
      {
        id: "workspace",
        q: "Can I create more than one workspace?",
        a: "During private beta each account has one workspace. You can invite teammates into it with roles; creating a second, separate workspace opens after beta.",
      },
      {
        id: "data",
        q: "Where does my data live, and who can see it?",
        a: "Your workspace is isolated and private. Teammates you invite see only what their role allows, and we never quietly share your data with anyone else.",
      },
      {
        id: "ai",
        q: "Does the AI do things on its own?",
        a: "No. It reads what you send and prepares drafts — a task, an expense, a project. Nothing is created, posted or paid until you accept it. AI requests count toward your plan’s monthly limit.",
      },
      {
        id: "channels",
        q: "How do I send things from Telegram, Slack or email?",
        a: "In Settings → Integrations: link the Telegram bot with a one-time code, connect Slack, or copy your personal forwarding address. Messages from accounts you haven’t linked are not captured.",
      },
      {
        id: "languages",
        q: "What languages does Nevora support?",
        a: "The whole product — landing, legal pages and the app interface — is available in English, Russian and Romanian. Switch anytime from the language menu.",
      },
    ],
  },
  story: {
    title: "Why Nevora exists",
    paragraphs: [
      "Many business tools become heavy too early — extra menus, unused features and limits that get in the way.",
      "Nevora is being built the other way round: you send things from wherever you already are, Nevora does the routine sorting, and you keep the final word on every task and every euro.",
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
    tagline: "Capture anything. Confirm what matters.",
    note: "Built for clarity, productivity and real daily use.",
    copyright: "© 2026 NEVORA. All Rights Reserved.",
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
    title: "Nevora — добавляйте что угодно, подтверждайте главное",
    description:
      "Одно рабочее пространство для малого бизнеса. Отправляйте заметки, письма, чеки и сообщения из приложения, Telegram, Slack или почты — Nevora подготовит задачи и черновики расходов, а без вашего подтверждения ничего не изменится.",
  },
  nav: [
    { label: "Главная", href: "#home" },
    { label: "Как это работает", href: "#how" },
    { label: "Продукт", href: "#products" },
    { label: "Тарифы", href: "#pricing" },
    { label: "Контакты", href: "#contact" },
  ],
  header: {
    login: "Войти",
    cta: "Пробный период",
    menu: "Открыть меню",
    close: "Закрыть меню",
  },
  hero: {
    title: "Добавляйте что угодно. Подтверждайте главное.",
    subtitle:
      "Перешлите письмо, напишите боту в Telegram, отправьте сообщение из Slack или сфотографируйте чек. Nevora превратит это в задачу или черновик расхода и разложит по местам — без вашего подтверждения ничего не изменится.",
    trust: "Ничего не создаётся, не проводится и не оплачивается без вашего подтверждения.",
    primaryCta: "Посмотреть продукт",
    secondaryCta: "Начать пробный период",
    microcopy: "Закрытая бета · пробный период 14 дней · 500 МБ · без карты · EN / RU / RO.",
    audience: "Для фрилансеров и небольших команд, которые сами ведут задачи, деньги и подписки.",
  },
  preview: {
    title: "Одно рабочее пространство, одно меню",
    subtitle:
      "Входящие, Задачи, Финансы и Подписки находятся рядом, а Центр действий показывает, что требует вашего внимания сегодня во всех разделах.",
    caption: "Интерактивное превью с примерными данными. «Открыть» ведёт в этот раздел после входа.",
    tabs: [
      {
        id: "inbox",
        title: "Входящие",
        description:
          "Всё, что вы отправляете в Nevora, попадает сюда черновиком. Примите, исправьте или удалите — решаете вы.",
        metric: "3",
        metricLabel: "черновика на проверку",
        openLabel: "Открыть Входящие",
        items: [
          { title: "«Подписать продление аренды до пятницы»", meta: "Почта · черновик задачи · проект «Офис»", status: "Проверить" },
          { title: "Фото чека — канцтовары", meta: "Telegram · черновик расхода · €42,50", status: "Проверить" },
          { title: "«Позвонить бухгалтеру завтра в 10»", meta: "Slack · черновик задачи · срок завтра", status: "Проверить" },
        ],
      },
      {
        id: "tasks",
        title: "Задачи",
        description:
          "Ежедневная работа с приоритетами, сроками и проектами. Задачи, принятые из Входящих, сразу попадают в нужный проект.",
        metric: "12",
        metricLabel: "открытых задач",
        openLabel: "Открыть Задачи",
        items: [
          { title: "Подготовить предложение клиенту", meta: "Сегодня · Высокий приоритет", status: "В работе" },
          { title: "Обновить чек-лист релиза", meta: "Запуск продукта", status: "К выполнению" },
          { title: "Проверить текст лендинга", meta: "Маркетинг", status: "Готово" },
        ],
      },
      {
        id: "finance",
        title: "Финансы",
        description:
          "Счета, доходы, расходы и переводы в нескольких валютах. Чек становится расходом только после вашего подтверждения.",
        metric: "€4 280",
        metricLabel: "учтённый баланс",
        openLabel: "Открыть Финансы",
        items: [],
      },
      {
        id: "subscriptions",
        title: "Подписки",
        description:
          "Регулярные сервисы, даты продления и напоминания об оплате — и список продлений, по которым нужно решить до списания.",
        metric: "3",
        metricLabel: "продления в этом месяце",
        openLabel: "Открыть Подписки",
        items: [
          { title: "Облачное хранилище", meta: "Продление 24 окт. · €15", status: "Активна" },
          { title: "Инструменты дизайна", meta: "Продление 2 нояб. · €24", status: "Решить" },
          { title: "Командные звонки", meta: "Продление 11 нояб. · €12", status: "Активна" },
        ],
      },
    ],
    rows: [
      { name: "Чек — канцтовары", amount: "€42,50", state: "needs_review" },
      { name: "Облачное хранилище", amount: "€15", state: "paid" },
      { name: "Аренда офиса", amount: "€800", state: "planned" },
    ],
  },
  how: {
    title: "Откуда угодно — до результата, последнее слово за вами",
    subtitle: "Три шага. Последний всегда ваш.",
    steps: [
      {
        badge: "Добавить",
        title: "Отправьте оттуда, где вы сейчас",
        text: "Напишите или сфотографируйте в приложении, отсканируйте QR-код чека, напишите боту в Telegram, нажмите «Send to Nevora» в Slack или перешлите письмо.",
      },
      {
        badge: "Подготовить",
        title: "Nevora готовит черновик",
        text: "Заметка становится задачей со сроком и проектом. Чек или счёт — черновиком расхода с суммой и позициями.",
      },
      {
        badge: "Подтвердить",
        title: "Решаете вы",
        text: "Примите, исправьте или отклоните во Входящих. Только тогда запись появится в Задачах или Финансах, а Центр действий покажет, что осталось.",
      },
    ],
  },
  areas: {
    title: "Что уже доступно",
    subtitle: "Всё перечисленное ниже работает в приложении прямо сейчас.",
    items: [
      {
        id: "actions",
        title: "Центр действий",
        text: "Главный экран: что просрочено, что на сегодня и что ждёт решения — по всем разделам сразу.",
      },
      {
        id: "inbox",
        title: "Входящие и каналы",
        text: "Добавляйте в приложении или из Telegram, Slack и почты. Один раз перенесите черновик в другой проект — Nevora запомнит это для источника.",
      },
      {
        id: "work",
        title: "Задачи и проекты",
        text: "Приоритеты, сроки, повторяющиеся задачи, исполнители и проекты — для вас и вашей команды.",
      },
      {
        id: "money",
        title: "Финансы",
        text: "Счета, доходы, расходы и переводы в нескольких валютах, с правилами для повторяющихся категорий.",
      },
      {
        id: "subscriptions",
        title: "Подписки",
        text: "Даты продления, напоминания об оплате и список продлений: оставить или отменить до списания.",
      },
      {
        id: "documents",
        title: "Документы",
        text: "Чеки, счета и договоры хранятся приватно. Nevora считывает суммы, даты и позиции, а вы проверяете.",
      },
    ],
  },
  control: {
    title: "Nevora готовит. Решаете вы.",
    subtitle: "Автоматизация, которая избавляет от ручного ввода, но никогда не действует за вашей спиной.",
    points: [
      {
        title: "Всегда сначала подтверждение",
        text: "Любой черновик — задача из Slack или расход из чека — ждёт во Входящих, пока вы его не примете.",
      },
      {
        title: "Учится на ваших исправлениях",
        text: "Один раз отнесите сообщение из Slack или письмо к другому проекту — и следующее из того же источника попадёт туда сразу.",
      },
      {
        title: "Только привязанные аккаунты",
        text: "Telegram, Slack и почта принимают сообщения только от аккаунтов, которые вы подключили в Настройках. Остальное игнорируется.",
      },
    ],
    closing: "Каналы меняют то, откуда приходят дела, — но не то, кто принимает решение.",
  },
  proof: {
    title: "Как мы это доказываем, а не просто заявляем",
    subtitle:
      "Каждая гарантия ниже — это контрактный тест в нашем коде. Нарушь её — и сборка падает; обещание идёт вместе с кодом.",
    items: [
      {
        id: "money",
        claim: "Деньги двигаются только после вашего подтверждения",
        how: "Ничто не проводит транзакцию само — ни чек, ни подписка, ни завершённая задача. Это проверяет тест, а не договорённость.",
      },
      {
        id: "idempotent",
        claim: "Двойная отметка оплаты учитывается один раз",
        how: "Если отметить один и тот же платёж по подписке оплаченным дважды, второй раз ничего не произойдёт — повтор или двойной клик не создадут дубль.",
      },
      {
        id: "notifications",
        claim: "Прочтение уведомления его не закрывает",
        how: "Состояние уведомления и состояние задачи раздельны. Сброс значка никогда не завершает саму работу.",
      },
      {
        id: "ai",
        claim: "ИИ не может действовать сам",
        how: "ИИ пишет только черновики — он не проводит деньги, не отмечает оплату, не меняет тариф или права и не удаляет данные.",
      },
      {
        id: "isolation",
        claim: "Ваше рабочее пространство изолировано",
        how: "Запрос данных чужого пространства возвращается пустым, как будто их нет, — на уровне каждой строки, а не спрятанной кнопки.",
      },
      {
        id: "privacy",
        claim: "Аналитика не видит ваш контент",
        how: "События использования не несут текста документов, имён файлов и адресов почты — только факт, что что-то произошло.",
      },
    ],
    closing:
      "Это не бейджи, которые мы нарисовали. Каждый из них роняет нашу сборку в тот момент, когда перестаёт быть правдой.",
  },
  aiLimits: {
    title: "Что ИИ может — и чего он никогда не сделает сам",
    subtitle:
      "Это не обещание, а ограничение в коде, которое наши тесты проверяют на каждой сборке.",
    can: {
      title: "ИИ может",
      points: [
        "Прочитать документ, чек или пересланное письмо и извлечь поля",
        "Превратить заметку или сообщение в черновик задачи со сроком и проектом",
        "Предложить категорию расхода",
      ],
    },
    cannot: {
      title: "ИИ никогда сам не",
      points: [
        "Проведёт доход или расход",
        "Отметит что-либо оплаченным",
        "Сменит ваш тариф",
        "Изменит чьи-либо права",
        "Удалит ваши данные",
      ],
    },
    closing:
      "Любой принятый черновик проходит через тот же модуль и то же подтверждение, что и ручное действие. У ИИ нет привилегированного пути записи.",
  },
  plans: {
    title: "Тарифы",
    subtitle:
      "Начните с бесплатного пробного периода на 14 дней. Переходите выше только когда продукт этого действительно стоит.",
    betaNotice:
      "Nevora в закрытой бете: пробный период открыт для всех, а платные тарифы включатся после подключения оплаты. Пока никакая карта не списывается.",
    note: {
      lead: "Попробуйте всю Nevora 14 дней с хранилищем до 500 МБ.",
      points: [
        "Входящие с Telegram, Slack и почтой",
        "Задачи и проекты",
        "Финансы и документы",
        "Подписки",
      ],
    },
    workspace:
      "Одно рабочее пространство на аккаунт во время закрытой беты. Приглашайте коллег в него по ролям; второе, отдельное пространство откроется после беты.",
  },
  faq: {
    title: "Вопросы перед стартом",
    subtitle: "Честные ответы простыми словами.",
    items: [
      {
        id: "beta",
        q: "Что значит «закрытая бета»?",
        a: "Продукт работает и им можно пользоваться, но платная оплата пока не включена. Любой может начать бесплатный 14-дневный пробный период без карты; платные тарифы откроются после подключения оплаты.",
      },
      {
        id: "afterTrial",
        q: "Что будет после 14-дневного пробного периода?",
        a: "Ничего не списывается автоматически. Когда откроется оплата, вы выберете тариф с более высокими лимитами или продолжите на бесплатном. Решение за вами — мы не повышаем тариф сами.",
      },
      {
        id: "workspace",
        q: "Можно ли создать больше одного рабочего пространства?",
        a: "Во время закрытой беты у каждого аккаунта одно рабочее пространство. Вы можете приглашать в него коллег с ролями; создание второго, отдельного пространства откроется после беты.",
      },
      {
        id: "data",
        q: "Где хранятся мои данные и кто их видит?",
        a: "Ваше рабочее пространство изолировано и приватно. Приглашённые коллеги видят только то, что позволяет их роль, и мы не передаём ваши данные кому-либо втихую.",
      },
      {
        id: "ai",
        q: "ИИ что-то делает сам?",
        a: "Нет. Он читает то, что вы отправили, и готовит черновики — задачу, расход, проект. Ничего не создаётся, не проводится и не оплачивается, пока вы это не примете. Запросы к ИИ учитываются в месячном лимите тарифа.",
      },
      {
        id: "channels",
        q: "Как отправлять дела из Telegram, Slack или почты?",
        a: "В Настройках → Интеграции: привяжите бота Telegram одноразовым кодом, подключите Slack или скопируйте свой личный адрес для пересылки. Сообщения от непривязанных аккаунтов не добавляются.",
      },
      {
        id: "languages",
        q: "Какие языки поддерживает Nevora?",
        a: "Весь продукт — лендинг, правовые страницы и интерфейс приложения — доступен на английском, русском и румынском. Переключайтесь в любой момент через меню языка.",
      },
    ],
  },
  story: {
    title: "Почему существует Nevora",
    paragraphs: [
      "Многие бизнес-инструменты становятся тяжёлыми слишком рано — лишние меню, неиспользуемые функции и ограничения, которые мешают.",
      "Nevora строится наоборот: вы отправляете дела оттуда, где уже находитесь, рутинную сортировку берёт на себя Nevora, а последнее слово по каждой задаче и каждому евро остаётся за вами.",
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
    tagline: "Добавляйте что угодно. Подтверждайте главное.",
    note: "Создано для ясности, продуктивности и реального ежедневного использования.",
    copyright: "© 2026 NEVORA. Все права защищены.",
    productHeading: "Продукт",
    legalHeading: "Правовое",
    terms: "Условия",
    privacy: "Конфиденциальность",
    refunds: "Возвраты",
  },
};

const ro: LandingContent = {
  meta: {
    title: "Nevora — adaugă orice, confirmă ce contează",
    description:
      "Un singur spațiu de lucru pentru afaceri mici. Trimite notițe, e-mailuri, bonuri și mesaje din aplicație, Telegram, Slack sau e-mail — Nevora pregătește sarcini și ciorne de cheltuieli, iar nimic nu se schimbă până nu confirmi.",
  },
  nav: [
    { label: "Acasă", href: "#home" },
    { label: "Cum funcționează", href: "#how" },
    { label: "Produs", href: "#products" },
    { label: "Prețuri", href: "#pricing" },
    { label: "Contact", href: "#contact" },
  ],
  header: {
    login: "Autentificare",
    cta: "Perioadă de probă",
    menu: "Deschide meniul",
    close: "Închide meniul",
  },
  hero: {
    title: "Adaugă orice. Confirmă ce contează.",
    subtitle:
      "Redirecționează un e-mail, scrie-i botului de Telegram, trimite un mesaj din Slack sau fotografiază un bon. Nevora îl transformă într-o sarcină sau o ciornă de cheltuială și îl pune la locul lui — nimic nu se schimbă până nu confirmi.",
    trust: "Nimic nu este creat, înregistrat sau plătit fără confirmarea ta.",
    primaryCta: "Vezi produsul",
    secondaryCta: "Începe proba de 14 zile",
    microcopy: "Versiune beta privată · probă de 14 zile · 500 MB · fără card · EN / RU / RO.",
    audience: "Pentru freelanceri și echipe mici care își gestionează singuri sarcinile, banii și abonamentele.",
  },
  preview: {
    title: "Un spațiu de lucru, un singur meniu",
    subtitle:
      "Mesaje primite, Sarcini, Finanțe și Abonamente stau unele lângă altele, iar Centrul de acțiuni arată ce are nevoie de tine azi, în toate secțiunile.",
    caption: "Previzualizare interactivă cu date de exemplu. „Deschide” te duce în acea secțiune după autentificare.",
    tabs: [
      {
        id: "inbox",
        title: "Mesaje primite",
        description:
          "Tot ce trimiți în Nevora ajunge aici ca ciornă. Accept-o, editeaz-o sau renunță la ea — tu decizi.",
        metric: "3",
        metricLabel: "ciorne de verificat",
        openLabel: "Deschide Mesaje primite",
        items: [
          { title: "„Semnează prelungirea chiriei până vineri”", meta: "E-mail · ciornă de sarcină · proiect Birou", status: "Verifică" },
          { title: "Poză bon — rechizite de birou", meta: "Telegram · ciornă de cheltuială · €42,50", status: "Verifică" },
          { title: "„Sună contabilul mâine la 10”", meta: "Slack · ciornă de sarcină · termen mâine", status: "Verifică" },
        ],
      },
      {
        id: "tasks",
        title: "Sarcini",
        description:
          "Munca zilnică cu priorități, termene și proiecte. Sarcinile acceptate din Mesaje primite ajung direct în proiectul potrivit.",
        metric: "12",
        metricLabel: "sarcini deschise",
        openLabel: "Deschide Sarcini",
        items: [
          { title: "Pregătește oferta pentru client", meta: "Astăzi · Prioritate înaltă", status: "În lucru" },
          { title: "Actualizează lista de lansare", meta: "Lansare produs", status: "De făcut" },
          { title: "Verifică textul landingului", meta: "Marketing", status: "Gata" },
        ],
      },
      {
        id: "finance",
        title: "Finanțe",
        description:
          "Conturi, venituri, cheltuieli și transferuri în mai multe valute. Un bon devine cheltuială doar după ce confirmi.",
        metric: "€4.280",
        metricLabel: "sold urmărit",
        openLabel: "Deschide Finanțe",
        items: [],
      },
      {
        id: "subscriptions",
        title: "Abonamente",
        description:
          "Servicii recurente, date de reînnoire și mementouri de plată — plus o listă de reînnoiri de decis înainte de debitare.",
        metric: "3",
        metricLabel: "reînnoiri luna aceasta",
        openLabel: "Deschide Abonamente",
        items: [
          { title: "Stocare cloud", meta: "Reînnoire 24 oct. · €15", status: "Activ" },
          { title: "Instrumente de design", meta: "Reînnoire 2 nov. · €24", status: "De decis" },
          { title: "Apeluri de echipă", meta: "Reînnoire 11 nov. · €12", status: "Activ" },
        ],
      },
    ],
    rows: [
      { name: "Bon — rechizite de birou", amount: "€42,50", state: "needs_review" },
      { name: "Stocare cloud", amount: "€15", state: "paid" },
      { name: "Chirie birou", amount: "€800", state: "planned" },
    ],
  },
  how: {
    title: "De oriunde până la rezultat — ultimul cuvânt e al tău",
    subtitle: "Trei pași. Ultimul este mereu al tău.",
    steps: [
      {
        badge: "Adaugă",
        title: "Trimite de unde ești",
        text: "Scrie sau fotografiază în aplicație, scanează codul QR al unui bon, scrie-i botului de Telegram, folosește „Send to Nevora” în Slack sau redirecționează un e-mail.",
      },
      {
        badge: "Pregătește",
        title: "Nevora face o ciornă",
        text: "O notiță devine o sarcină cu termen și proiect. Un bon sau o factură devine o ciornă de cheltuială cu sumă și articole.",
      },
      {
        badge: "Confirmă",
        title: "Tu decizi",
        text: "Acceptă, editează sau respinge în Mesaje primite. Abia apoi apare în Sarcini sau Finanțe — iar Centrul de acțiuni arată ce a mai rămas.",
      },
    ],
  },
  areas: {
    title: "Ce este disponibil acum",
    subtitle: "Tot ce vezi mai jos funcționează în aplicație chiar acum.",
    items: [
      {
        id: "actions",
        title: "Centrul de acțiuni",
        text: "Ecranul principal: ce a întârziat, ce e de azi și ce așteaptă o decizie — din toate secțiunile.",
      },
      {
        id: "inbox",
        title: "Mesaje primite și canale",
        text: "Adaugă în aplicație sau din Telegram, Slack și e-mail. Mută o ciornă în alt proiect o dată, iar Nevora ține minte asta pentru acea sursă.",
      },
      {
        id: "work",
        title: "Sarcini și proiecte",
        text: "Priorități, termene, sarcini recurente, responsabili și proiecte — pentru tine și echipa ta.",
      },
      {
        id: "money",
        title: "Finanțe",
        text: "Conturi, venituri, cheltuieli și transferuri în mai multe valute, cu reguli pentru categoriile care se repetă.",
      },
      {
        id: "subscriptions",
        title: "Abonamente",
        text: "Date de reînnoire, mementouri de plată și o listă de reînnoiri de păstrat sau anulat înainte de debitare.",
      },
      {
        id: "documents",
        title: "Documente",
        text: "Bonuri, facturi și contracte păstrate privat. Nevora citește sumele, datele și articolele, iar tu le verifici.",
      },
    ],
  },
  control: {
    title: "Nevora pregătește. Tu decizi.",
    subtitle: "Automatizare care te scutește de tastat — niciodată una care acționează pe la spatele tău.",
    points: [
      {
        title: "Mereu întâi confirmarea",
        text: "Orice ciornă — o sarcină din Slack, o cheltuială dintr-un bon — așteaptă în Mesaje primite până o accepți.",
      },
      {
        title: "Învață din corecturile tale",
        text: "Pune o dată un mesaj din Slack sau un e-mail în alt proiect, iar următorul din aceeași sursă ajunge direct acolo.",
      },
      {
        title: "Doar conturile conectate",
        text: "Telegram, Slack și e-mailul acceptă mesaje doar de la conturile pe care le-ai conectat în Setări. Restul este ignorat.",
      },
    ],
    closing: "Canalele schimbă de unde vin lucrurile — nu cine decide.",
  },
  proof: {
    title: "Cum dovedim, nu doar spunem",
    subtitle:
      "Fiecare garanție de mai jos este un test de contract în codul nostru. Încalc-o și build-ul pică — promisiunea vine odată cu codul.",
    items: [
      {
        id: "money",
        claim: "Banii se mișcă doar când confirmi tu",
        how: "Nimic nu înregistrează o tranzacție singur — nici un bon, nici un abonament, nici o sarcină terminată. O verifică un test, nu o convenție.",
      },
      {
        id: "idempotent",
        claim: "Marcată plătită de două ori, contează o dată",
        how: "Dacă marchezi aceeași plată de abonament ca plătită de două ori, a doua oară nu se întâmplă nimic — o reîncercare sau un dublu-clic nu creează un duplicat.",
      },
      {
        id: "notifications",
        claim: "Citirea unei notificări nu o rezolvă",
        how: "Starea notificării și starea sarcinii sunt separate. Ștergerea unui indicator nu închide niciodată lucrul de bază.",
      },
      {
        id: "ai",
        claim: "IA nu poate acționa singură",
        how: "IA scrie doar ciorne — nu înregistrează bani, nu marchează plăți, nu îți schimbă planul sau drepturile și nu șterge date.",
      },
      {
        id: "isolation",
        claim: "Spațiul tău de lucru este izolat",
        how: "O cerere pentru datele altui spațiu se întoarce goală, ca și cum nu ar exista — impus rând cu rând, nu prin ascunderea unui buton.",
      },
      {
        id: "privacy",
        claim: "Analitica nu îți vede conținutul",
        how: "Evenimentele de utilizare nu poartă textul documentelor, numele fișierelor sau adresele de e-mail — doar faptul că ceva s-a întâmplat.",
      },
    ],
    closing:
      "Nu sunt insigne pe care le-am desenat. Fiecare pică build-ul nostru în momentul în care încetează să fie adevărat.",
  },
  aiLimits: {
    title: "Ce poate face IA — și ce nu poate face niciodată singură",
    subtitle:
      "Nu este o promisiune, ci o restricție în cod, verificată de testele noastre la fiecare build.",
    can: {
      title: "IA poate",
      points: [
        "Să citească un document, un bon sau un e-mail redirecționat și să extragă câmpurile",
        "Să transforme o notiță sau un mesaj într-o ciornă de sarcină cu termen și proiect",
        "Să sugereze o categorie pentru o cheltuială",
      ],
    },
    cannot: {
      title: "IA niciodată, singură, nu",
      points: [
        "Va înregistra un venit sau o cheltuială",
        "Va marca ceva ca plătit",
        "Îți va schimba planul de facturare",
        "Va schimba drepturile cuiva",
        "Îți va șterge datele",
      ],
    },
    closing:
      "Fiecare ciornă acceptată trece prin același modul și aceeași confirmare ca o acțiune manuală. IA nu are o cale de scriere privilegiată.",
  },
  plans: {
    title: "Prețuri",
    subtitle:
      "Începe cu o perioadă de probă gratuită de 14 zile. Treci mai sus doar când produsul chiar merită.",
    betaNotice:
      "Nevora este în versiune beta privată: proba gratuită este deschisă tuturor, iar planurile plătite se activează după pornirea facturării. Până atunci niciun card nu este debitat.",
    note: {
      lead: "Încearcă tot Nevora timp de 14 zile, cu până la 500 MB de stocare.",
      points: [
        "Mesaje primite cu Telegram, Slack și e-mail",
        "Sarcini și proiecte",
        "Finanțe și documente",
        "Abonamente",
      ],
    },
    workspace:
      "Un singur spațiu de lucru per cont în versiunea beta privată. Invită colegii în el pe roluri; un al doilea spațiu separat se deschide după beta.",
  },
  faq: {
    title: "Întrebări înainte să începi",
    subtitle: "Răspunsurile oneste, pe scurt.",
    items: [
      {
        id: "beta",
        q: "Ce înseamnă „versiune beta privată”?",
        a: "Produsul este funcțional și poate fi folosit, dar plata nu este încă activată. Oricine poate începe proba gratuită de 14 zile fără card; planurile plătite se deschid după pornirea facturării.",
      },
      {
        id: "afterTrial",
        q: "Ce se întâmplă după proba de 14 zile?",
        a: "Nimic nu se debitează automat. Când se deschide facturarea, alegi un plan cu limite mai mari sau rămâi pe cel gratuit. Decizia este a ta — nu te trecem singuri pe un plan superior.",
      },
      {
        id: "workspace",
        q: "Pot crea mai mult de un spațiu de lucru?",
        a: "În versiunea beta privată fiecare cont are un singur spațiu de lucru. Poți invita colegi în el, cu roluri; crearea unui al doilea spațiu separat se deschide după beta.",
      },
      {
        id: "data",
        q: "Unde stau datele mele și cine le vede?",
        a: "Spațiul tău de lucru este izolat și privat. Colegii pe care îi inviți văd doar ce le permite rolul, iar noi nu îți partajăm datele pe ascuns cu nimeni.",
      },
      {
        id: "ai",
        q: "IA face ceva singură?",
        a: "Nu. Citește ce trimiți și pregătește ciorne — o sarcină, o cheltuială, un proiect. Nimic nu este creat, înregistrat sau plătit până nu accepți. Cererile către IA intră în limita lunară a planului.",
      },
      {
        id: "channels",
        q: "Cum trimit lucruri din Telegram, Slack sau e-mail?",
        a: "În Setări → Integrări: conectează botul de Telegram cu un cod unic, conectează Slack sau copiază adresa ta personală de redirecționare. Mesajele de la conturi neconectate nu sunt adăugate.",
      },
      {
        id: "languages",
        q: "Ce limbi acceptă Nevora?",
        a: "Tot produsul — landing, paginile legale și interfața aplicației — este disponibil în engleză, rusă și română. Comută oricând din meniul de limbă.",
      },
    ],
  },
  story: {
    title: "De ce există Nevora",
    paragraphs: [
      "Multe instrumente de business devin grele prea devreme — meniuri în plus, funcții nefolosite și limite care încurcă.",
      "Nevora se construiește invers: trimiți lucrurile de acolo unde ești deja, Nevora face sortarea de rutină, iar ultimul cuvânt despre fiecare sarcină și fiecare euro rămâne al tău.",
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
    tagline: "Adaugă orice. Confirmă ce contează.",
    note: "Construit pentru claritate, productivitate și utilizare zilnică reală.",
    copyright: "© 2026 NEVORA. Toate drepturile rezervate.",
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
