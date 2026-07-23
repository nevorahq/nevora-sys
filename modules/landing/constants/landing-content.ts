/**
 * Контент лендинга Nevora Business OS — локализованный (en / ru / ro).
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
 */

import type { PublicLocale } from "@/shared/i18n/constants";

export const BRAND = "Nevora Business OS";

/** Публичные локали лендинга совпадают с общей осью языка приложения. */
export const LANDING_LOCALES = ["en", "ru", "ro"] as const;

export type LandingLocale = PublicLocale;

/**
 * Области продукта в порядке основной навигации приложения
 * (Home · Work · Money · Documents · Inbox + команда/доступ из Settings).
 * `id` — стабильный ключ: он связывает локализованный текст с иконкой в
 * `areas-section` и переживает перевод. Порядок и состав одинаковы во всех
 * локалях — это пинит `landing-content.test.ts`.
 */
export const AREA_IDS = ["actions", "work", "money", "documents", "inbox", "team"] as const;

export type AreaId = (typeof AREA_IDS)[number];

/**
 * Четыре состояния модели внимания (`docs/contracts/attention-model.md` §1).
 * Порядок — путь сигнала: добавлено → сообщено → требует действия → сделано.
 */
export const ATTENTION_IDS = ["captured", "informed", "required", "done"] as const;

export type AttentionId = (typeof ATTENTION_IDS)[number];

/** Вопросы FAQ. Стабильные `id` держат один порядок и состав во всех локалях. */
export const FAQ_IDS = ["beta", "afterTrial", "workspace", "data", "ai", "languages"] as const;

export type FaqId = (typeof FAQ_IDS)[number];

const en = {
  meta: {
    title: "Nevora Business OS — One workspace that tells you what needs action",
    description:
      "Tasks, money, documents and subscriptions in one system. Your home screen is the queue of what needs a decision; Nevora suggests the next step and every important change stays under your control.",
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
    // Компактный CTA хедера: кнопка фиксированной высоты (h-9) в одну строку —
    // глагольная форма не помещается в ru/ro. Длительность и условия несёт hero
    // (primaryCta + microcopy).
    cta: "Free trial",
    menu: "Open menu",
    close: "Close menu",
  },
  hero: {
    title: "One workspace that tells you what needs action.",
    subtitle:
      "Tasks, money, documents and subscriptions live in one system. Your home screen is the queue of what actually needs a decision — and an obligation stays visible until the work is really done.",
    trust: "AI suggests. You review. Financial actions never run automatically.",
    primaryCta: "Start a 14-day trial",
    secondaryCta: "See pricing",
    microcopy: "Private beta · 14-day trial · 500 MB storage · no card · EN / RU / RO.",
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
    title: "Six sections. Nothing to learn.",
    subtitle:
      "This is the whole product — the same sections you see after signing in, in the same order.",
    items: [
      {
        id: "actions",
        title: "Action Center",
        text: "Your home screen is the queue of what needs a decision. Reading a notification never closes an obligation — it stays until the work is done.",
      },
      {
        id: "work",
        title: "Work",
        text: "Tasks and projects with owners and deadlines, connected to the document or the payment they came from.",
      },
      {
        id: "money",
        title: "Money",
        text: "Transactions, financial tasks and subscriptions in one workspace. An amount becomes a fact only when you confirm the payment.",
      },
      {
        id: "documents",
        title: "Documents",
        text: "Upload an invoice or a receipt; Nevora reads it and proposes what it means. You decide whether it becomes an obligation or an expense.",
      },
      {
        id: "inbox",
        title: "Capture",
        text: "Drop in text, a photo or a file from anywhere. It waits in the Inbox until you review it — nothing is filed behind your back.",
      },
      {
        id: "team",
        title: "Team and access",
        text: "Invite the people who need it, with roles. Your workspace is isolated: a member sees only what their role allows.",
      },
    ],
  },
  attention: {
    title: "Captured, informed, needed, done — four different things",
    subtitle:
      "Most tools blur them, so “I saw it” quietly counts as “it is handled”. Nevora keeps them apart.",
    items: [
      {
        id: "captured",
        title: "Captured",
        text: "Something you dropped into the Inbox. Not classified and not an obligation — it waits for your review.",
      },
      {
        id: "informed",
        title: "Informed",
        text: "A notification reached you. That is delivery and nothing more: marking it read changes no obligation anywhere.",
      },
      {
        id: "required",
        title: "Needs action",
        text: "A business action is genuinely required. It stays on your home screen until the underlying work is done.",
      },
      {
        id: "done",
        title: "Done",
        text: "The owning module recorded the real thing — task closed, payment made, review confirmed. Only that resolves it.",
      },
    ],
    closing:
      "Which is why an unpaid invoice cannot be silenced by clearing a notification badge.",
  },
  states: {
    title: "One financial vocabulary, everywhere",
    subtitle:
      "A subscription, an invoice, a receipt and a manual expense all move through the same six states — and they are called the same thing on every screen.",
    items: [
      { id: "detected", text: "A signal was found. Nothing is owed yet." },
      { id: "needs_review", text: "Waiting for you to classify or confirm it." },
      { id: "planned", text: "A future obligation exists on the books." },
      { id: "due", text: "Owed now: the date arrived, or a payment task is open." },
      { id: "paid", text: "Money actually moved — the only state backed by a transaction." },
      { id: "cancelled", text: "Closed without payment: rejected, skipped or cancelled." },
    ],
    note: "Reaching “Paid” takes an explicit confirmation from you — and confirming the same obligation twice cannot pay it twice.",
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
  aiLimits: {
    title: "What the AI can do — and what it can never do alone",
    subtitle:
      "This is not a promise; it is enforced in code and checked by our tests on every build.",
    can: {
      title: "AI may",
      points: [
        "Read a document and extract its fields",
        "Suggest a category, a task or a next step",
        "Explain why something needs your attention",
      ],
    },
    cannot: {
      title: "AI may never, on its own",
      points: [
        "Post income or an expense",
        "Mark an obligation as paid",
        "Change your billing plan",
        "Change anyone’s permissions",
        "Delete your data",
      ],
    },
    closing:
      "Every accepted suggestion runs through the same module and the same confirmation as a manual action. The AI has no privileged path.",
  },
  docJourney: {
    title: "From a photo of an invoice to a paid obligation",
    subtitle:
      "The flagship path, and you approve every step that touches money.",
    steps: [
      {
        badge: "Upload",
        title: "Add the document",
        text: "Photograph or drop in an invoice or a receipt. It lands in your Inbox, nowhere else yet.",
      },
      {
        badge: "Extract",
        title: "Nevora reads it",
        text: "The amount, date and counterparty are extracted into a draft. Still a suggestion — no money is touched.",
      },
      {
        badge: "Decide",
        title: "You classify it",
        text: "An invoice becomes an obligation to pay; a receipt becomes a recorded expense. One document, one entry — never both.",
      },
      {
        badge: "Confirm",
        title: "You mark it paid",
        text: "Only your explicit confirmation posts the transaction — and doing it twice will not pay it twice.",
      },
    ],
  },
  plans: {
    title: "Pricing",
    subtitle: "Start with a free 14-day trial. Move up only when the product truly earns it.",
    betaNotice:
      "Nevora is in private beta: the free trial is open to everyone, and paid plans switch on once billing is enabled. No card is charged in the meantime.",
    note: {
      lead: "Try Nevora Business OS for 14 days with up to 500 MB of storage.",
      points: [
        "AI you review",
        "Finance you confirm",
        "Decide freely after the trial",
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
        q: "What does the AI actually do?",
        a: "It reads, extracts and suggests — a category, a task, a draft. It never posts money, marks anything paid, changes your plan or permissions, or deletes data on its own. Every accepted suggestion runs through your confirmation.",
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
    title: "Nevora Business OS — рабочее пространство, которое говорит, что требует действия",
    description:
      "Задачи, финансы, документы и подписки в одной системе. Главный экран — очередь того, что требует решения; Nevora подсказывает следующий шаг, а важные изменения остаются под вашим контролем.",
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
    cta: "Пробный период",
    menu: "Открыть меню",
    close: "Закрыть меню",
  },
  hero: {
    title: "Рабочее пространство, которое говорит, что требует действия.",
    subtitle:
      "Задачи, финансы, документы и подписки живут в одной системе. Главный экран — очередь того, что действительно требует решения, а обязательство остаётся видимым, пока работа не сделана.",
    trust: "ИИ предлагает. Вы проверяете. Финансовые действия не выполняются автоматически.",
    primaryCta: "Начать 14-дневный пробный период",
    secondaryCta: "Смотреть тарифы",
    microcopy: "Закрытая бета · пробный период 14 дней · 500 МБ · без карты · EN / RU / RO.",
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
    title: "Шесть разделов. Учиться нечему.",
    subtitle:
      "Это весь продукт — те же разделы, что вы увидите после входа, и в том же порядке.",
    items: [
      {
        id: "actions",
        title: "Центр действий",
        text: "Главный экран — очередь того, что требует решения. Прочитанное уведомление ничего не закрывает: обязательство остаётся, пока работа не сделана.",
      },
      {
        id: "work",
        title: "Работа",
        text: "Задачи и проекты с ответственными и сроками, связанные с документом или платежом, из которого они возникли.",
      },
      {
        id: "money",
        title: "Финансы",
        text: "Транзакции, финансовые задачи и подписки в одном рабочем пространстве. Сумма становится фактом только после вашего подтверждения платежа.",
      },
      {
        id: "documents",
        title: "Документы",
        text: "Загрузите счёт или чек — Nevora прочитает его и предложит, что это. Вы решаете, станет это обязательством или расходом.",
      },
      {
        id: "inbox",
        title: "Входящие",
        text: "Добавляйте текст, фото или файл откуда угодно. Добавленное ждёт во входящих, пока вы его не проверите, — ничего не оформляется за вашей спиной.",
      },
      {
        id: "team",
        title: "Команда и доступ",
        text: "Приглашайте тех, кому это нужно, и назначайте роли. Рабочее пространство изолировано: участник видит только то, что позволяет его роль.",
      },
    ],
  },
  attention: {
    title: "Добавлено, сообщено, требуется, сделано — это разные вещи",
    subtitle:
      "Большинство инструментов их смешивают, и «я увидел» тихо превращается в «это сделано». Nevora их разделяет.",
    items: [
      {
        id: "captured",
        title: "Добавлено",
        text: "То, что вы бросили во входящие. Не классифицировано и не обязательство — ждёт вашей проверки.",
      },
      {
        id: "informed",
        title: "Сообщено",
        text: "Уведомление до вас дошло. Это только доставка: отметка «прочитано» нигде не меняет обязательство.",
      },
      {
        id: "required",
        title: "Требует действия",
        text: "Действительно нужно бизнес-действие. Остаётся на главном экране, пока лежащая в основе работа не сделана.",
      },
      {
        id: "done",
        title: "Сделано",
        text: "Модуль записал реальный факт — задача закрыта, платёж проведён, проверка подтверждена. Только это закрывает пункт.",
      },
    ],
    closing:
      "Поэтому неоплаченный счёт нельзя заглушить, сбросив значок уведомления.",
  },
  states: {
    title: "Единый финансовый словарь — везде",
    subtitle:
      "Подписка, счёт, чек и ручной расход проходят одни и те же шесть состояний — и называются одинаково на каждом экране.",
    items: [
      { id: "detected", text: "Сигнал найден. Пока ничего не должно." },
      { id: "needs_review", text: "Ждёт, чтобы вы классифицировали или подтвердили." },
      { id: "planned", text: "Будущее обязательство уже учтено." },
      { id: "due", text: "К оплате сейчас: срок наступил или открыта задача на платёж." },
      { id: "paid", text: "Деньги действительно двигались — единственное состояние за реальной транзакцией." },
      { id: "cancelled", text: "Закрыто без оплаты: отклонено, пропущено или отменено." },
    ],
    note: "Чтобы дойти до «Оплачено», нужно ваше явное подтверждение — а подтвердить одно обязательство дважды не значит оплатить его дважды.",
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
  aiLimits: {
    title: "Что ИИ может — и чего он никогда не сделает сам",
    subtitle:
      "Это не обещание, а ограничение в коде, которое наши тесты проверяют на каждой сборке.",
    can: {
      title: "ИИ может",
      points: [
        "Прочитать документ и извлечь его поля",
        "Предложить категорию, задачу или следующий шаг",
        "Объяснить, почему что-то требует вашего внимания",
      ],
    },
    cannot: {
      title: "ИИ никогда сам не",
      points: [
        "Проведёт доход или расход",
        "Отметит обязательство оплаченным",
        "Сменит ваш тариф",
        "Изменит чьи-либо права",
        "Удалит ваши данные",
      ],
    },
    closing:
      "Любое принятое предложение проходит через тот же модуль и то же подтверждение, что и ручное действие. У ИИ нет привилегированного пути записи.",
  },
  docJourney: {
    title: "От фото счёта до оплаченного обязательства",
    subtitle:
      "Флагманский путь, где каждый шаг, касающийся денег, подтверждаете вы.",
    steps: [
      {
        badge: "Загрузка",
        title: "Добавьте документ",
        text: "Сфотографируйте или перетащите счёт или чек. Он попадает во входящие — и пока никуда больше.",
      },
      {
        badge: "Извлечение",
        title: "Nevora читает его",
        text: "Сумма, дата и контрагент извлекаются в черновик. Это всё ещё предложение — деньги не затронуты.",
      },
      {
        badge: "Решение",
        title: "Вы классифицируете",
        text: "Счёт становится обязательством к оплате, чек — записанным расходом. Один документ — одна запись, никогда обе сразу.",
      },
      {
        badge: "Подтверждение",
        title: "Вы отмечаете оплату",
        text: "Транзакцию проводит только ваше явное подтверждение — и дважды оно не оплатит счёт дважды.",
      },
    ],
  },
  plans: {
    title: "Тарифы",
    subtitle:
      "Начните с бесплатного пробного периода на 14 дней. Переходите выше только когда продукт этого действительно стоит.",
    betaNotice:
      "Nevora в закрытой бете: пробный период открыт для всех, а платные тарифы включатся после подключения оплаты. Пока никакая карта не списывается.",
    note: {
      lead: "Попробуйте Nevora Business OS 14 дней с хранилищем до 500 МБ.",
      points: [
        "ИИ, который вы проверяете",
        "Финансы, которые вы подтверждаете",
        "Свободный выбор после пробного периода",
      ],
    },
    workspace:
      "Одна рабочая область на аккаунт во время закрытой беты. Приглашайте коллег в неё по ролям; отдельная вторая область откроется после беты.",
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
        q: "Можно ли создать больше одной рабочей области?",
        a: "Во время закрытой беты у каждого аккаунта одна рабочая область. Вы можете приглашать в неё коллег с ролями; создание второй, отдельной области откроется после беты.",
      },
      {
        id: "data",
        q: "Где хранятся мои данные и кто их видит?",
        a: "Ваша рабочая область изолирована и приватна. Приглашённые коллеги видят только то, что позволяет их роль, и мы не передаём ваши данные кому-либо втихую.",
      },
      {
        id: "ai",
        q: "Что на самом деле делает ИИ?",
        a: "Он читает, извлекает и предлагает — категорию, задачу, черновик. Он сам не проводит деньги, не отмечает оплату, не меняет тариф или права и не удаляет данные. Любое принятое предложение проходит через ваше подтверждение.",
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
    title: "Nevora Business OS — un spațiu de lucru care îți spune ce necesită acțiune",
    description:
      "Sarcini, bani, documente și abonamente într-un singur sistem. Ecranul principal este coada a ceea ce necesită o decizie; Nevora sugerează pasul următor, iar modificările importante rămân sub controlul tău.",
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
    cta: "Perioadă de probă",
    menu: "Deschide meniul",
    close: "Închide meniul",
  },
  hero: {
    title: "Un spațiu de lucru care îți spune ce necesită acțiune.",
    subtitle:
      "Sarcinile, banii, documentele și abonamentele stau într-un singur sistem. Ecranul principal este coada a ceea ce chiar necesită o decizie, iar o obligație rămâne vizibilă până când lucrul este făcut.",
    trust: "IA propune. Tu verifici. Acțiunile financiare nu se execută automat.",
    primaryCta: "Începe perioada de probă de 14 zile",
    secondaryCta: "Vezi prețurile",
    microcopy: "Versiune beta privată · probă de 14 zile · 500 MB · fără card · EN / RU / RO.",
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
    title: "Șase secțiuni. Nimic de învățat.",
    subtitle:
      "Acesta este tot produsul — aceleași secțiuni pe care le vezi după autentificare, în aceeași ordine.",
    items: [
      {
        id: "actions",
        title: "Centrul de acțiuni",
        text: "Ecranul principal este coada a ceea ce necesită o decizie. O notificare citită nu închide nimic: obligația rămâne până când lucrul este făcut.",
      },
      {
        id: "work",
        title: "Lucru",
        text: "Sarcini și proiecte cu responsabili și termene, conectate la documentul sau plata din care au apărut.",
      },
      {
        id: "money",
        title: "Finanțe",
        text: "Tranzacții, sarcini financiare și abonamente într-un singur spațiu de lucru. O sumă devine fapt doar după ce confirmi plata.",
      },
      {
        id: "documents",
        title: "Documente",
        text: "Încarcă o factură sau un bon — Nevora îl citește și propune ce înseamnă. Tu decizi dacă devine obligație sau cheltuială.",
      },
      {
        id: "inbox",
        title: "Mesaje primite",
        text: "Adaugă text, o fotografie sau un fișier de oriunde. Ce ai adăugat așteaptă până îl verifici — nimic nu se înregistrează pe la spatele tău.",
      },
      {
        id: "team",
        title: "Echipă și acces",
        text: "Invită oamenii care au nevoie și atribuie-le roluri. Spațiul tău de lucru este izolat: un membru vede doar ce îi permite rolul.",
      },
    ],
  },
  attention: {
    title: "Adăugat, informat, necesar, făcut — sunt lucruri diferite",
    subtitle:
      "Majoritatea instrumentelor le amestecă, iar „am văzut” devine tacit „e rezolvat”. Nevora le ține separate.",
    items: [
      {
        id: "captured",
        title: "Adăugat",
        text: "Ceva ce ai pus în Mesaje primite. Neclasificat și nu o obligație — așteaptă verificarea ta.",
      },
      {
        id: "informed",
        title: "Informat",
        text: "O notificare a ajuns la tine. Este doar livrare: marcarea ca citită nu schimbă nicio obligație.",
      },
      {
        id: "required",
        title: "Necesită acțiune",
        text: "Chiar este nevoie de o acțiune de business. Rămâne pe ecranul principal până când lucrul de bază este făcut.",
      },
      {
        id: "done",
        title: "Făcut",
        text: "Modulul a înregistrat faptul real — sarcină închisă, plată efectuată, verificare confirmată. Doar asta îl rezolvă.",
      },
    ],
    closing:
      "De aceea o factură neplătită nu poate fi redusă la tăcere ștergând un indicator de notificare.",
  },
  states: {
    title: "Un singur vocabular financiar, peste tot",
    subtitle:
      "Un abonament, o factură, un bon și o cheltuială manuală trec prin aceleași șase stări — și se numesc la fel pe fiecare ecran.",
    items: [
      { id: "detected", text: "Un semnal a fost găsit. Nimic nu este datorat încă." },
      { id: "needs_review", text: "Așteaptă să îl clasifici sau să îl confirmi." },
      { id: "planned", text: "O obligație viitoare există deja în evidență." },
      { id: "due", text: "De plată acum: data a sosit sau o sarcină de plată este deschisă." },
      { id: "paid", text: "Banii chiar s-au mișcat — singura stare susținută de o tranzacție." },
      { id: "cancelled", text: "Închis fără plată: respins, sărit sau anulat." },
    ],
    note: "Pentru a ajunge la „Plătit” e nevoie de confirmarea ta explicită — iar confirmarea aceleiași obligații de două ori nu o plătește de două ori.",
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
  aiLimits: {
    title: "Ce poate face IA — și ce nu poate face niciodată singură",
    subtitle:
      "Nu este o promisiune, ci o restricție în cod, verificată de testele noastre la fiecare build.",
    can: {
      title: "IA poate",
      points: [
        "Să citească un document și să îi extragă câmpurile",
        "Să sugereze o categorie, o sarcină sau un pas următor",
        "Să explice de ce ceva îți necesită atenția",
      ],
    },
    cannot: {
      title: "IA niciodată, singură, nu",
      points: [
        "Va înregistra un venit sau o cheltuială",
        "Va marca o obligație ca plătită",
        "Îți va schimba planul de facturare",
        "Va schimba drepturile cuiva",
        "Îți va șterge datele",
      ],
    },
    closing:
      "Fiecare sugestie acceptată trece prin același modul și aceeași confirmare ca o acțiune manuală. IA nu are o cale de scriere privilegiată.",
  },
  docJourney: {
    title: "De la poza unei facturi la o obligație plătită",
    subtitle:
      "Traseul principal, în care aprobi fiecare pas ce atinge banii.",
    steps: [
      {
        badge: "Încărcare",
        title: "Adaugă documentul",
        text: "Fotografiază sau trage o factură ori un bon. Ajunge în Mesaje primite, deocamdată nicăieri altundeva.",
      },
      {
        badge: "Extragere",
        title: "Nevora îl citește",
        text: "Suma, data și partenerul sunt extrase într-o ciornă. Tot o sugestie — niciun ban nu este atins.",
      },
      {
        badge: "Decizie",
        title: "Tu îl clasifici",
        text: "O factură devine o obligație de plată; un bon devine o cheltuială înregistrată. Un document, o intrare — niciodată ambele.",
      },
      {
        badge: "Confirmare",
        title: "Tu marchezi plata",
        text: "Doar confirmarea ta explicită înregistrează tranzacția — iar de două ori nu o plătește de două ori.",
      },
    ],
  },
  plans: {
    title: "Prețuri",
    subtitle:
      "Începe cu o perioadă de probă gratuită de 14 zile. Treci mai sus doar când produsul chiar merită.",
    betaNotice:
      "Nevora este în versiune beta privată: proba gratuită este deschisă tuturor, iar planurile plătite se activează după pornirea facturării. Până atunci niciun card nu este debitat.",
    note: {
      lead: "Încearcă Nevora Business OS timp de 14 zile cu până la 500 MB de stocare.",
      points: [
        "IA pe care o verifici",
        "Finanțe pe care le confirmi",
        "Alegere liberă după probă",
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
        q: "Ce face de fapt IA?",
        a: "Citește, extrage și sugerează — o categorie, o sarcină, o ciornă. Nu înregistrează singură bani, nu marchează plăți, nu îți schimbă planul sau drepturile și nu șterge date. Fiecare sugestie acceptată trece prin confirmarea ta.",
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
