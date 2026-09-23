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
 */

import type { PublicLocale } from "@/shared/i18n/constants";

export const BRAND = "Nevora Business OS";

/** Публичные локали лендинга совпадают с общей осью языка приложения. */
export const LANDING_LOCALES = ["en", "ru", "ro"] as const;

export type LandingLocale = PublicLocale;

/**
 * Карточки текущих возможностей. Исторические id сохраняются как стабильные
 * ключи локализации и тестов, а видимые названия соответствуют продуктам.
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
    title: "Nevora — Tasks, Finance and Subscriptions as focused apps",
    description:
      "Three focused business apps with one Nevora account: manage tasks and projects, track finances, and keep recurring subscriptions under control.",
  },
  nav: [
    { label: "Home", href: "#home" },
    { label: "How it works", href: "#how" },
    { label: "Products", href: "#products" },
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
    title: "Three focused apps. One Nevora account.",
    subtitle:
      "Choose Tasks, Finance or Subscriptions. After sign-in, Nevora opens the selected product and keeps unrelated modules out of your navigation.",
    trust: "One account · focused navigation · your selected product opens after sign-in.",
    primaryCta: "Explore the apps",
    secondaryCta: "Start a 14-day trial",
    microcopy: "Private beta · 14-day trial · 500 MB storage · no card · EN / RU / RO.",
    audience: "For people and small teams who want focused tools without a heavy all-in-one interface.",
  },
  preview: {
    title: "Choose the workspace you need",
    subtitle:
      "Switch between the three live product areas. Each one has its own routes, navigation and day-to-day workflow.",
    caption: "Interactive product preview — sample data. Opening an app preserves your choice through sign-in.",
    rows: [
      { name: "Acme Studio — invoice", amount: "€1,200", state: "due" },
      { name: "Cloud storage — subscription", amount: "€15", state: "paid" },
      { name: "Office rent", amount: "€800", state: "planned" },
      { name: "Scanned receipt", amount: "—", state: "needs_review" },
    ],
  },
  how: {
    title: "Choose, sign in, stay focused",
    subtitle:
      "The product you choose on the landing page stays selected through login or registration.",
    steps: [
      {
        badge: "1",
        title: "Choose an app",
        text: "Start with Tasks, Finance or Subscriptions from the product menu or interactive preview.",
      },
      {
        badge: "2",
        title: "Sign in once",
        text: "Log in or create an account. Nevora safely keeps the selected destination during authentication.",
      },
      {
        badge: "3",
        title: "Work in context",
        text: "You land in the chosen app and see only its product navigation, while account settings remain shared.",
      },
    ],
  },
  areas: {
    title: "What is available today",
    subtitle:
      "The landing page now matches the routes and capabilities already available in the application.",
    items: [
      {
        id: "actions",
        title: "Tasks",
        text: "Create, prioritise and complete daily work in a dedicated task workspace.",
      },
      {
        id: "work",
        title: "Projects",
        text: "Group tasks into projects and open dedicated project pages without leaving the Tasks app.",
      },
      {
        id: "money",
        title: "Accounts and transactions",
        text: "Track balances, income, expenses and transfers inside the Finance app.",
      },
      {
        id: "documents",
        title: "Finance rules",
        text: "Create explicit rules for repeatable transaction categorisation and keep manual control.",
      },
      {
        id: "inbox",
        title: "Subscriptions",
        text: "Keep recurring services, renewal dates and payment workflow in their own app.",
      },
      {
        id: "team",
        title: "Shared account layer",
        text: "Use one identity, one organisation and shared settings while product navigation remains separate.",
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
    title: "Separate products, shared foundation",
    subtitle:
      "The interface is split by product without forcing you to maintain three unrelated accounts.",
    points: [
      {
        title: "Focused product navigation",
        text: "Tasks, Finance and Subscriptions expose only the routes needed for the selected workflow.",
      },
      {
        title: "Choice survives authentication",
        text: "The selected product is carried safely through login, registration and onboarding.",
      },
      {
        title: "Safe shared access",
        text: "Authentication, organisation access and settings stay centralised, with validated internal redirects.",
      },
    ],
    closing:
      "You can move between products when you choose, without mixing their navigation by default.",
  },
  proof: {
    title: "How we prove it, not just say it",
    subtitle:
      "Each guarantee below is a contract test in our codebase. Break it, and the build fails — the promise ships with the code.",
    items: [
      {
        id: "money",
        claim: "Money moves only when you confirm it",
        how: "Nothing posts a transaction on its own. The confirm-first rule is checked by a test, not left to convention.",
      },
      {
        id: "idempotent",
        claim: "Paying twice can’t charge twice",
        how: "Marking the same obligation paid more than once is idempotent by construction — the second confirm is a no-op.",
      },
      {
        id: "notifications",
        claim: "Reading a notice doesn’t resolve it",
        how: "Notification state and obligation state are separate. Clearing a badge never closes the underlying work.",
      },
      {
        id: "ai",
        claim: "The AI can’t act on its own",
        how: "AI writes only to its own suggestion tables — it can’t post money, mark anything paid, change your plan or permissions, or delete data.",
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
      lead: "Try the current Nevora apps for 14 days with up to 500 MB of storage.",
      points: [
        "Tasks and projects",
        "Accounts and transactions",
        "Recurring subscriptions",
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
        q: "Will I see every module after sign-in?",
        a: "No. Nevora opens the app you selected and shows that product’s navigation. You can deliberately switch to Tasks, Finance or Subscriptions from the app menu whenever you need another workspace.",
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
      "Nevora is being built in the other direction: focused apps for tasks, finances and subscriptions, connected by one account but separated enough to keep every workflow clear.",
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
    tagline: "Focused business apps, connected by one account.",
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
    title: "Nevora — Задачи, Финансы и Подписки как отдельные приложения",
    description:
      "Три сфокусированных бизнес-приложения с одним аккаунтом Nevora: задачи и проекты, учёт финансов и контроль регулярных подписок.",
  },
  nav: [
    { label: "Главная", href: "#home" },
    { label: "Как это работает", href: "#how" },
    { label: "Приложения", href: "#products" },
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
    title: "Три отдельных приложения. Один аккаунт Nevora.",
    subtitle:
      "Выберите «Задачи», «Финансы» или «Подписки». После входа Nevora откроет выбранный продукт и скроет из навигации посторонние модули.",
    trust: "Один аккаунт · сфокусированная навигация · выбранный продукт откроется после входа.",
    primaryCta: "Посмотреть приложения",
    secondaryCta: "Начать пробный период",
    microcopy: "Закрытая бета · пробный период 14 дней · 500 МБ · без карты · EN / RU / RO.",
    audience: "Для людей и небольших команд, которым нужны понятные инструменты без перегруженного интерфейса.",
  },
  preview: {
    title: "Выберите нужное рабочее пространство",
    subtitle:
      "Переключайтесь между тремя доступными продуктами. У каждого — свои маршруты, навигация и рабочий сценарий.",
    caption: "Интерактивное превью с примерными данными. Выбор приложения сохранится при входе.",
    rows: [
      { name: "Acme Studio — счёт", amount: "€1 200", state: "due" },
      { name: "Облачное хранилище — подписка", amount: "€15", state: "paid" },
      { name: "Аренда офиса", amount: "€800", state: "planned" },
      { name: "Отсканированный чек", amount: "—", state: "needs_review" },
    ],
  },
  how: {
    title: "Выберите, войдите, работайте без лишнего",
    subtitle:
      "Продукт, выбранный на лендинге, останется выбранным во время входа или регистрации.",
    steps: [
      {
        badge: "1",
        title: "Выберите приложение",
        text: "Начните с «Задач», «Финансов» или «Подписок» через меню или интерактивное превью.",
      },
      {
        badge: "2",
        title: "Войдите один раз",
        text: "Авторизуйтесь или создайте аккаунт. Nevora безопасно сохранит выбранный маршрут.",
      },
      {
        badge: "3",
        title: "Работайте в контексте",
        text: "Вы попадёте в выбранное приложение и увидите только его навигацию, а настройки аккаунта останутся общими.",
      },
    ],
  },
  areas: {
    title: "Что уже доступно",
    subtitle:
      "Лендинг теперь отражает реальные маршруты и возможности текущего приложения.",
    items: [
      {
        id: "actions",
        title: "Задачи",
        text: "Создавайте, расставляйте приоритеты и завершайте ежедневную работу в отдельном пространстве.",
      },
      {
        id: "work",
        title: "Проекты",
        text: "Объединяйте задачи в проекты и открывайте отдельные страницы проектов внутри приложения «Задачи».",
      },
      {
        id: "money",
        title: "Счета и транзакции",
        text: "Контролируйте балансы, доходы, расходы и переводы внутри приложения «Финансы».",
      },
      {
        id: "documents",
        title: "Финансовые правила",
        text: "Создавайте явные правила категоризации повторяющихся транзакций, сохраняя ручной контроль.",
      },
      {
        id: "inbox",
        title: "Подписки",
        text: "Храните регулярные сервисы, даты продления и статусы оплаты в отдельном приложении.",
      },
      {
        id: "team",
        title: "Общий слой аккаунта",
        text: "Одна учётная запись, одна организация и общие настройки при раздельной продуктовой навигации.",
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
    title: "Отдельные продукты, общая основа",
    subtitle:
      "Интерфейс разделён по продуктам, но вам не придётся поддерживать три независимых аккаунта.",
    points: [
      {
        title: "Сфокусированная навигация",
        text: "«Задачи», «Финансы» и «Подписки» показывают только маршруты выбранного рабочего сценария.",
      },
      {
        title: "Выбор сохраняется при входе",
        text: "Выбранный продукт безопасно переносится через логин, регистрацию и онбординг.",
      },
      {
        title: "Безопасный общий доступ",
        text: "Авторизация, доступ к организации и настройки централизованы, а внутренние переходы проходят проверку.",
      },
    ],
    closing:
      "Переключаться между продуктами можно осознанно, не смешивая их навигацию по умолчанию.",
  },
  proof: {
    title: "Как мы это доказываем, а не просто заявляем",
    subtitle:
      "Каждая гарантия ниже — это контрактный тест в нашем коде. Нарушь её — и сборка падает; обещание идёт вместе с кодом.",
    items: [
      {
        id: "money",
        claim: "Деньги двигаются только после вашего подтверждения",
        how: "Ничто не проводит транзакцию само. Правило «сначала подтверждение» проверяется тестом, а не держится на договорённости.",
      },
      {
        id: "idempotent",
        claim: "Двойная оплата не спишет дважды",
        how: "Отметить одно обязательство оплаченным дважды идемпотентно по построению — второе подтверждение ничего не делает.",
      },
      {
        id: "notifications",
        claim: "Прочтение уведомления его не закрывает",
        how: "Состояние уведомления и состояние обязательства раздельны. Сброс значка никогда не завершает саму работу.",
      },
      {
        id: "ai",
        claim: "ИИ не может действовать сам",
        how: "ИИ пишет только в свои таблицы предложений — он не проводит деньги, не отмечает оплату, не меняет тариф или права и не удаляет данные.",
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
      lead: "Попробуйте текущие приложения Nevora 14 дней с хранилищем до 500 МБ.",
      points: [
        "Задачи и проекты",
        "Счета и транзакции",
        "Регулярные подписки",
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
        q: "После входа я увижу все модули?",
        a: "Нет. Nevora откроет выбранное приложение и покажет навигацию только этого продукта. При необходимости можно осознанно переключиться на «Задачи», «Финансы» или «Подписки» через меню приложений.",
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
      "Nevora строится в другом направлении: отдельные приложения для задач, финансов и подписок, связанные одним аккаунтом, но достаточно разделённые для ясной работы.",
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
    tagline: "Сфокусированные бизнес-приложения, связанные одним аккаунтом.",
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
    title: "Nevora — Sarcini, Finanțe și Abonamente ca aplicații separate",
    description:
      "Trei aplicații de business concentrate, cu un singur cont Nevora: sarcini și proiecte, evidență financiară și controlul abonamentelor recurente.",
  },
  nav: [
    { label: "Acasă", href: "#home" },
    { label: "Cum funcționează", href: "#how" },
    { label: "Aplicații", href: "#products" },
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
    title: "Trei aplicații concentrate. Un singur cont Nevora.",
    subtitle:
      "Alege Sarcini, Finanțe sau Abonamente. După autentificare, Nevora deschide produsul ales și elimină modulele fără legătură din navigație.",
    trust: "Un cont · navigație concentrată · produsul ales se deschide după autentificare.",
    primaryCta: "Explorează aplicațiile",
    secondaryCta: "Începe proba de 14 zile",
    microcopy: "Versiune beta privată · probă de 14 zile · 500 MB · fără card · EN / RU / RO.",
    audience: "Pentru persoane și echipe mici care vor instrumente clare, fără o interfață all-in-one greoaie.",
  },
  preview: {
    title: "Alege spațiul de lucru de care ai nevoie",
    subtitle:
      "Comută între cele trei produse disponibile. Fiecare are propriile rute, propria navigație și propriul flux de lucru.",
    caption: "Previzualizare interactivă cu date de exemplu. Alegerea aplicației se păstrează la autentificare.",
    rows: [
      { name: "Acme Studio — factură", amount: "€1.200", state: "due" },
      { name: "Stocare cloud — abonament", amount: "€15", state: "paid" },
      { name: "Chirie birou", amount: "€800", state: "planned" },
      { name: "Bon scanat", amount: "—", state: "needs_review" },
    ],
  },
  how: {
    title: "Alege, autentifică-te, lucrează concentrat",
    subtitle:
      "Produsul ales pe landing rămâne selectat în timpul autentificării sau înregistrării.",
    steps: [
      {
        badge: "1",
        title: "Alege o aplicație",
        text: "Începe cu Sarcini, Finanțe sau Abonamente din meniu sau din previzualizarea interactivă.",
      },
      {
        badge: "2",
        title: "Autentifică-te o dată",
        text: "Intră în cont sau creează unul. Nevora păstrează în siguranță destinația selectată.",
      },
      {
        badge: "3",
        title: "Lucrează în context",
        text: "Ajungi în aplicația aleasă și vezi doar navigația ei, iar setările contului rămân comune.",
      },
    ],
  },
  areas: {
    title: "Ce este disponibil acum",
    subtitle:
      "Landingul reflectă acum rutele și funcționalitățile disponibile în aplicația curentă.",
    items: [
      {
        id: "actions",
        title: "Sarcini",
        text: "Creează, prioritizează și finalizează munca zilnică într-un spațiu dedicat.",
      },
      {
        id: "work",
        title: "Proiecte",
        text: "Grupează sarcinile în proiecte și deschide pagini dedicate în aplicația Sarcini.",
      },
      {
        id: "money",
        title: "Conturi și tranzacții",
        text: "Urmărește solduri, venituri, cheltuieli și transferuri în aplicația Finanțe.",
      },
      {
        id: "documents",
        title: "Reguli financiare",
        text: "Creează reguli explicite pentru clasificarea tranzacțiilor repetate și păstrează controlul manual.",
      },
      {
        id: "inbox",
        title: "Abonamente",
        text: "Păstrează serviciile recurente, datele de reînnoire și starea plăților într-o aplicație separată.",
      },
      {
        id: "team",
        title: "Nivel comun de cont",
        text: "O identitate, o organizație și setări comune, cu navigația produselor separată.",
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
    title: "Produse separate, fundație comună",
    subtitle:
      "Interfața este separată pe produse fără să te oblige să întreții trei conturi independente.",
    points: [
      {
        title: "Navigație concentrată",
        text: "Sarcini, Finanțe și Abonamente afișează doar rutele necesare fluxului selectat.",
      },
      {
        title: "Alegerea trece prin autentificare",
        text: "Produsul ales este transmis în siguranță prin login, înregistrare și onboarding.",
      },
      {
        title: "Acces comun sigur",
        text: "Autentificarea, accesul la organizație și setările sunt centralizate, cu redirectări interne validate.",
      },
    ],
    closing:
      "Poți comuta intenționat între produse fără a le amesteca navigația în mod implicit.",
  },
  proof: {
    title: "Cum dovedim, nu doar spunem",
    subtitle:
      "Fiecare garanție de mai jos este un test de contract în codul nostru. Încalc-o și build-ul pică — promisiunea vine odată cu codul.",
    items: [
      {
        id: "money",
        claim: "Banii se mișcă doar când confirmi tu",
        how: "Nimic nu înregistrează o tranzacție singur. Regula „mai întâi confirmarea” este verificată de un test, nu lăsată pe seama convenției.",
      },
      {
        id: "idempotent",
        claim: "Plata de două ori nu debitează de două ori",
        how: "Marcarea aceleiași obligații ca plătită de mai multe ori este idempotentă prin construcție — a doua confirmare nu face nimic.",
      },
      {
        id: "notifications",
        claim: "Citirea unei notificări nu o rezolvă",
        how: "Starea notificării și starea obligației sunt separate. Ștergerea unui indicator nu închide niciodată lucrul de bază.",
      },
      {
        id: "ai",
        claim: "IA nu poate acționa singură",
        how: "IA scrie doar în propriile tabele de sugestii — nu înregistrează bani, nu marchează plăți, nu îți schimbă planul sau drepturile și nu șterge date.",
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
      lead: "Încearcă aplicațiile Nevora actuale timp de 14 zile, cu până la 500 MB de stocare.",
      points: [
        "Sarcini și proiecte",
        "Conturi și tranzacții",
        "Abonamente recurente",
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
        q: "Voi vedea toate modulele după autentificare?",
        a: "Nu. Nevora deschide aplicația aleasă și afișează navigația acelui produs. Poți comuta intenționat la Sarcini, Finanțe sau Abonamente din meniul de aplicații când ai nevoie.",
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
      "Nevora se construiește în direcția opusă: aplicații separate pentru sarcini, finanțe și abonamente, conectate printr-un singur cont, dar suficient de separate pentru un flux clar.",
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
    tagline: "Aplicații de business concentrate, conectate printr-un singur cont.",
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
