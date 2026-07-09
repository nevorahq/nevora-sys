import { refundsLegalDocuments } from "./refunds-content";

export const LEGAL_LOCALES = ["en", "ro", "ru"] as const;

export type LegalLocale = (typeof LEGAL_LOCALES)[number];
export type LegalPage = "terms" | "privacy" | "refunds";

export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "subheading"; title: string }
  | { type: "bullets"; items: string[] }
  | { type: "contact"; lines: Array<{ label: string; value?: string }> };

export type LegalSection = {
  title: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  title: string;
  lastUpdatedLabel: string;
  lastUpdated: string;
  intro: LegalBlock[];
  sections: LegalSection[];
};

export const LEGAL_LOCALE_LABELS: Record<LegalLocale, string> = {
  en: "EN",
  ro: "RO",
  ru: "RU",
};

export const LEGAL_LOCALE_NAMES: Record<LegalLocale, string> = {
  en: "English",
  ro: "Romana",
  ru: "Русский",
};

export const LEGAL_UI: Record<
  LegalLocale,
  {
    home: string;
    language: string;
    legal: string;
    terms: string;
    privacy: string;
    refunds: string;
  }
> = {
  en: {
    home: "Home",
    language: "Language",
    legal: "Legal",
    terms: "Terms",
    privacy: "Privacy",
    refunds: "Refunds",
  },
  ro: {
    home: "Acasa",
    language: "Limba",
    legal: "Legal",
    terms: "Termeni",
    privacy: "Confidentialitate",
    refunds: "Rambursări",
  },
  ru: {
    home: "Главная",
    language: "Язык",
    legal: "Правовые документы",
    terms: "Условия",
    privacy: "Конфиденциальность",
    refunds: "Возвраты",
  },
};

export function resolveLegalLocale(value: string | string[] | undefined): LegalLocale {
  const candidate = Array.isArray(value) ? value[0] : value;
  return LEGAL_LOCALES.includes(candidate as LegalLocale) ? (candidate as LegalLocale) : "en";
}

export function getLegalDocument(page: LegalPage, locale: LegalLocale): LegalDocument {
  return legalDocuments[page][locale];
}

const termsEn: LegalDocument = {
  title: "Terms of Service",
  lastUpdatedLabel: "Last updated",
  lastUpdated: "July 9, 2026",
  intro: [
    {
      type: "paragraph",
      text: 'These Terms of Service ("Terms") govern access to and use of Nevora Business OS, a software-as-a-service product operated by NEVORA SRL ("Nevora", "we", "us", or "our").',
    },
    {
      type: "paragraph",
      text: "By creating an account, requesting access, using a workspace, or using any part of the service, you agree to these Terms.",
    },
    {
      type: "paragraph",
      text: "If you are using Nevora on behalf of a company or organization, you represent that you have authority to bind that organization to these Terms.",
    },
  ],
  sections: [
    {
      title: "1. About Nevora Business OS",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora Business OS is an AI-assisted operating workspace for small businesses and teams. The service may include tasks, projects, documents, money records, subscriptions, Action Center, Capture Inbox, AI-assisted workflows, analytics, Developer Access, and related features.",
        },
        {
          type: "paragraph",
          text: "Nevora is designed to help users organize business operations and review suggested actions. Nevora does not replace professional financial, legal, tax, accounting, or business advice.",
        },
      ],
    },
    {
      title: "2. Private Beta",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora may be provided as a private beta, early access, preview, or trial product.",
        },
        { type: "paragraph", text: "During private beta:" },
        {
          type: "bullets",
          items: [
            "features may change;",
            "limits may change;",
            "some workflows may be incomplete;",
            "some functionality may be disabled or invitation-only;",
            "service availability is not guaranteed;",
            "we may collect feedback to improve the product.",
          ],
        },
        {
          type: "paragraph",
          text: "We may accept, reject, limit, or remove access to private beta at our discretion.",
        },
      ],
    },
    {
      title: "3. Accounts and Organizations",
      blocks: [
        {
          type: "paragraph",
          text: "You must provide accurate account information and keep your login credentials secure.",
        },
        { type: "paragraph", text: "You are responsible for:" },
        {
          type: "bullets",
          items: [
            "all activity under your account;",
            "users invited to your organization or workspace;",
            "permissions granted to team members;",
            "the accuracy of data entered into the service;",
            "ensuring that your use of Nevora complies with applicable laws.",
          ],
        },
        {
          type: "paragraph",
          text: "You must notify us promptly if you suspect unauthorized access to your account or workspace.",
        },
      ],
    },
    {
      title: "4. Customer Content",
      blocks: [
        {
          type: "paragraph",
          text: '"Customer Content" means data, files, documents, records, text, images, financial entries, tasks, subscriptions, comments, metadata, and other information that you or your users submit to Nevora.',
        },
        { type: "paragraph", text: "You retain ownership of your Customer Content." },
        {
          type: "paragraph",
          text: "You grant Nevora a limited license to host, process, transmit, display, analyze, and use Customer Content only as necessary to:",
        },
        {
          type: "bullets",
          items: [
            "provide the service;",
            "secure and maintain the service;",
            "support user workflows;",
            "generate AI-assisted suggestions where enabled;",
            "troubleshoot issues;",
            "comply with applicable law.",
          ],
        },
        {
          type: "paragraph",
          text: "You are responsible for having the necessary rights and permissions to upload or process Customer Content in Nevora.",
        },
      ],
    },
    {
      title: "5. AI-Assisted Features",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora may include AI-assisted features such as extraction, classification, summaries, recommendations, or suggested actions.",
        },
        {
          type: "paragraph",
          text: "AI-assisted outputs may be inaccurate, incomplete, or unsuitable for your specific situation.",
        },
        {
          type: "paragraph",
          text: "You are responsible for reviewing and confirming AI-assisted outputs before relying on them.",
        },
        {
          type: "paragraph",
          text: "Nevora does not automatically post financial transactions, mark obligations paid, or make business decisions without user confirmation unless a specific workflow is explicitly approved by an authorized user.",
        },
      ],
    },
    {
      title: "6. Financial and Business Records",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora may help you track money records, documents, subscriptions, obligations, and related business context.",
        },
        {
          type: "paragraph",
          text: "Nevora is not a bank, accounting firm, tax advisor, law firm, payment institution, or regulated financial advisor.",
        },
        {
          type: "paragraph",
          text: "Financial records in Nevora are operational records created or confirmed by users. You are responsible for validating all financial, accounting, tax, and reporting information before using it for official purposes.",
        },
      ],
    },
    {
      title: "7. Acceptable Use",
      blocks: [
        { type: "paragraph", text: "You must not use Nevora to:" },
        {
          type: "bullets",
          items: [
            "violate any law or regulation;",
            "infringe intellectual property or privacy rights;",
            "upload malware, harmful code, or illegal content;",
            "attempt unauthorized access to systems or data;",
            "interfere with service availability or security;",
            "reverse engineer or abuse APIs except as permitted by documentation;",
            "process unlawful, fraudulent, or harmful activity;",
            "upload sensitive data unless you have a lawful basis and appropriate safeguards;",
            "use AI features to generate harmful, deceptive, or unlawful outputs.",
          ],
        },
        {
          type: "paragraph",
          text: "We may suspend or terminate access if we reasonably believe these rules are violated.",
        },
      ],
    },
    {
      title: "8. Plans, Trials, Billing, and Payments",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora may offer free trials, private beta access, paid plans, usage limits, storage limits, AI limits, member limits, and other plan-based restrictions.",
        },
        {
          type: "paragraph",
          text: "Trial users are not charged during a free trial or unpaid private beta unless they explicitly choose a paid plan or complete a paid checkout.",
        },
        {
          type: "paragraph",
          text: "Paid plans are subscription-based SaaS access plans.",
        },
        {
          type: "paragraph",
          text: "Plan details may be shown on the pricing page or inside the product.",
        },
        {
          type: "paragraph",
          text: "If paid billing is enabled, payments may be processed through Paddle or another authorized billing provider. Where Paddle processes a transaction, Paddle may act as Merchant of Record or authorised reseller for purchases, taxes, invoices, receipts, cancellation tools, refunds, and payment processing.",
        },
        {
          type: "paragraph",
          text: "Your subscription terms, renewal, cancellation, refund eligibility, and tax handling may be governed by the checkout terms presented by the payment provider at the time of purchase.",
        },
        {
          type: "paragraph",
          text: "Refund, cancellation, payment, chargeback, or subscription-status events affect only SaaS access, billing state, entitlements, limits, support, and account administration. They do not automatically create, update, or delete Money transactions inside your workspace.",
        },
        {
          type: "paragraph",
          text: "Nevora may update plans, pricing, limits, or available features, but changes will not reduce the paid service you already purchased during the current billing period unless required for legal, security, or operational reasons.",
        },
      ],
    },
    {
      title: "9. Taxes",
      blocks: [
        {
          type: "paragraph",
          text: "Prices may be exclusive or inclusive of applicable taxes depending on the payment provider, customer location, and checkout configuration.",
        },
        {
          type: "paragraph",
          text: "Where Paddle acts as Merchant of Record, Paddle may calculate, collect, and remit applicable taxes according to its own terms and legal obligations.",
        },
      ],
    },
    {
      title: "10. Third-Party Services",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora may integrate with third-party services such as hosting providers, database providers, AI providers, analytics providers, email providers, storage providers, and payment providers.",
        },
        {
          type: "paragraph",
          text: "We are not responsible for third-party services outside our control, but we use reasonable care when selecting providers that are necessary to operate Nevora.",
        },
      ],
    },
    {
      title: "11. Service Changes and Availability",
      blocks: [
        {
          type: "paragraph",
          text: "We may modify, improve, suspend, or discontinue parts of the service.",
        },
        {
          type: "paragraph",
          text: "We aim to provide a reliable service, but we do not guarantee uninterrupted or error-free availability, especially during private beta.",
        },
      ],
    },
    {
      title: "12. Suspension and Termination",
      blocks: [
        { type: "paragraph", text: "You may stop using Nevora at any time." },
        { type: "paragraph", text: "We may suspend or terminate your account or workspace if:" },
        {
          type: "bullets",
          items: [
            "you violate these Terms;",
            "payment fails or subscription expires;",
            "your use creates security, legal, or operational risk;",
            "required by law;",
            "the private beta program ends or changes.",
          ],
        },
        {
          type: "paragraph",
          text: "After termination, access to the service and Customer Content may be limited or removed according to our retention policies and applicable law.",
        },
      ],
    },
    {
      title: "13. Intellectual Property",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora, including its software, design, workflows, branding, documentation, and related materials, is owned by NEVORA SRL or its licensors.",
        },
        {
          type: "paragraph",
          text: "These Terms do not grant you ownership of Nevora intellectual property.",
        },
        {
          type: "paragraph",
          text: "You may not copy, resell, sublicense, or commercially exploit the service except as expressly permitted.",
        },
      ],
    },
    {
      title: "14. Feedback",
      blocks: [
        {
          type: "paragraph",
          text: "If you provide feedback, suggestions, or ideas, you grant us the right to use them without restriction or compensation, provided we do not disclose your confidential Customer Content.",
        },
      ],
    },
    {
      title: "15. Confidentiality",
      blocks: [
        { type: "paragraph", text: "Each party may receive confidential information from the other." },
        {
          type: "paragraph",
          text: "You and Nevora agree to use reasonable care to protect confidential information and to use it only for the purpose of providing or using the service.",
        },
        {
          type: "paragraph",
          text: "Customer Content is treated as confidential unless it is publicly available, independently developed, or required to be disclosed by law.",
        },
      ],
    },
    {
      title: "16. Disclaimers",
      blocks: [
        {
          type: "paragraph",
          text: 'The service is provided "as is" and "as available" to the maximum extent permitted by law.',
        },
        {
          type: "paragraph",
          text: "We do not warrant that Nevora will be uninterrupted, error-free, secure against all threats, or suitable for every business, legal, financial, tax, or accounting purpose.",
        },
        {
          type: "paragraph",
          text: "You are responsible for independent verification of important business and financial decisions.",
        },
      ],
    },
    {
      title: "17. Limitation of Liability",
      blocks: [
        {
          type: "paragraph",
          text: "To the maximum extent permitted by law, NEVORA SRL will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, including lost profits, lost revenue, loss of data, loss of goodwill, or business interruption.",
        },
        {
          type: "paragraph",
          text: "To the maximum extent permitted by law, our total liability for any claim relating to the service will not exceed the amount paid by you to Nevora for the service during the three months before the event giving rise to the claim, or EUR 100 if you used the service for free.",
        },
      ],
    },
    {
      title: "18. Indemnity",
      blocks: [
        {
          type: "paragraph",
          text: "You agree to indemnify and hold harmless NEVORA SRL from claims, damages, liabilities, costs, and expenses arising from:",
        },
        {
          type: "bullets",
          items: [
            "your use of the service;",
            "your Customer Content;",
            "your violation of these Terms;",
            "your violation of applicable law;",
            "your infringement of third-party rights.",
          ],
        },
      ],
    },
    {
      title: "19. Governing Law",
      blocks: [
        {
          type: "paragraph",
          text: "These Terms are governed by the laws of the Republic of Moldova, unless mandatory consumer protection laws require otherwise.",
        },
        {
          type: "paragraph",
          text: "Any disputes will be handled by competent courts in the Republic of Moldova, unless applicable law provides a different mandatory forum.",
        },
      ],
    },
    {
      title: "20. Changes to These Terms",
      blocks: [
        { type: "paragraph", text: "We may update these Terms from time to time." },
        {
          type: "paragraph",
          text: 'If changes are material, we will take reasonable steps to notify users, such as by posting a notice in the service or updating the "Last updated" date.',
        },
        {
          type: "paragraph",
          text: "Continued use of the service after changes become effective means you accept the updated Terms.",
        },
      ],
    },
    {
      title: "21. Contact",
      blocks: [
        { type: "paragraph", text: "If you have questions about these Terms, contact us:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Email", value: "nevorahq@gmail.com" },
            { label: "Registered address", value: "[NEVORA SRL registered address]" },
            { label: "Registration number / IDNO", value: "[NEVORA SRL registration number]" },
          ],
        },
      ],
    },
  ],
};

const termsRo: LegalDocument = {
  title: "Termeni de utilizare",
  lastUpdatedLabel: "Ultima actualizare",
  lastUpdated: "9 iulie 2026",
  intro: [
    {
      type: "paragraph",
      text: 'Acești Termeni de utilizare ("Termeni") guverneaza accesul la si utilizarea Nevora Business OS, un produs software-as-a-service operat de NEVORA SRL ("Nevora", "noi" sau "nostru").',
    },
    {
      type: "paragraph",
      text: "Prin crearea unui cont, solicitarea accesului, utilizarea unui workspace sau utilizarea oricarei parti a serviciului, acceptati acesti Termeni.",
    },
    {
      type: "paragraph",
      text: "Daca utilizati Nevora in numele unei companii sau organizatii, declarati ca aveti autoritatea de a obliga acea organizatie sa respecte acesti Termeni.",
    },
  ],
  sections: [
    {
      title: "1. Despre Nevora Business OS",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora Business OS este un workspace operational asistat de AI pentru afaceri mici si echipe. Serviciul poate include sarcini, proiecte, documente, inregistrari financiare, abonamente, Action Center, Capture Inbox, workflow-uri asistate de AI, analytics, Developer Access si functionalitati conexe.",
        },
        {
          type: "paragraph",
          text: "Nevora este conceput pentru a ajuta utilizatorii sa organizeze operatiunile de business si sa revizuiasca actiuni sugerate. Nevora nu inlocuieste consultanta profesionala financiara, juridica, fiscala, contabila sau de business.",
        },
      ],
    },
    {
      title: "2. Private Beta",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora poate fi oferit ca produs private beta, early access, preview sau trial.",
        },
        { type: "paragraph", text: "In perioada private beta:" },
        {
          type: "bullets",
          items: [
            "functionalitatile se pot schimba;",
            "limitele se pot schimba;",
            "unele workflow-uri pot fi incomplete;",
            "unele functionalitati pot fi dezactivate sau disponibile doar pe baza de invitatie;",
            "disponibilitatea serviciului nu este garantata;",
            "putem colecta feedback pentru imbunatatirea produsului.",
          ],
        },
        {
          type: "paragraph",
          text: "Putem accepta, respinge, limita sau retrage accesul la private beta la discretia noastra.",
        },
      ],
    },
    {
      title: "3. Conturi si organizatii",
      blocks: [
        {
          type: "paragraph",
          text: "Trebuie sa furnizati informatii exacte despre cont si sa pastrati confidentialitatea datelor de autentificare.",
        },
        { type: "paragraph", text: "Sunteti responsabil pentru:" },
        {
          type: "bullets",
          items: [
            "toata activitatea din contul dvs.;",
            "utilizatorii invitati in organizatia sau workspace-ul dvs.;",
            "permisiunile acordate membrilor echipei;",
            "acuratetea datelor introduse in serviciu;",
            "asigurarea faptului ca utilizarea Nevora respecta legile aplicabile.",
          ],
        },
        {
          type: "paragraph",
          text: "Trebuie sa ne notificati prompt daca suspectati acces neautorizat la contul sau workspace-ul dvs.",
        },
      ],
    },
    {
      title: "4. Continutul clientului",
      blocks: [
        {
          type: "paragraph",
          text: '"Continutul clientului" inseamna date, fisiere, documente, inregistrari, texte, imagini, intrari financiare, sarcini, abonamente, comentarii, metadate si alte informatii transmise catre Nevora de dvs. sau de utilizatorii dvs.',
        },
        { type: "paragraph", text: "Pastrati dreptul de proprietate asupra Continutului clientului." },
        {
          type: "paragraph",
          text: "Acordati Nevora o licenta limitata de a gazdui, procesa, transmite, afisa, analiza si utiliza Continutul clientului doar in masura necesara pentru:",
        },
        {
          type: "bullets",
          items: [
            "furnizarea serviciului;",
            "securizarea si mentinerea serviciului;",
            "sustinerea workflow-urilor utilizatorilor;",
            "generarea sugestiilor asistate de AI acolo unde sunt activate;",
            "depanarea problemelor;",
            "respectarea legii aplicabile.",
          ],
        },
        {
          type: "paragraph",
          text: "Sunteti responsabil sa aveti drepturile si permisiunile necesare pentru a incarca sau procesa Continutul clientului in Nevora.",
        },
      ],
    },
    {
      title: "5. Functionalitati asistate de AI",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora poate include functionalitati asistate de AI, precum extractie, clasificare, rezumate, recomandari sau actiuni sugerate.",
        },
        {
          type: "paragraph",
          text: "Rezultatele asistate de AI pot fi inexacte, incomplete sau nepotrivite pentru situatia dvs. specifica.",
        },
        {
          type: "paragraph",
          text: "Sunteti responsabil sa revizuiti si sa confirmati rezultatele asistate de AI inainte de a va baza pe ele.",
        },
        {
          type: "paragraph",
          text: "Nevora nu posteaza automat tranzactii financiare, nu marcheaza obligatii ca platite si nu ia decizii de business fara confirmarea utilizatorului, cu exceptia unui workflow aprobat explicit de un utilizator autorizat.",
        },
      ],
    },
    {
      title: "6. Inregistrari financiare si de business",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora va poate ajuta sa urmariti inregistrari financiare, documente, abonamente, obligatii si context de business conex.",
        },
        {
          type: "paragraph",
          text: "Nevora nu este banca, firma de contabilitate, consultant fiscal, firma de avocatura, institutie de plata sau consultant financiar reglementat.",
        },
        {
          type: "paragraph",
          text: "Inregistrarile financiare din Nevora sunt inregistrari operationale create sau confirmate de utilizatori. Sunteti responsabil pentru validarea tuturor informatiilor financiare, contabile, fiscale si de raportare inainte de utilizarea lor in scopuri oficiale.",
        },
      ],
    },
    {
      title: "7. Utilizare acceptabila",
      blocks: [
        { type: "paragraph", text: "Nu trebuie sa utilizati Nevora pentru a:" },
        {
          type: "bullets",
          items: [
            "incalca orice lege sau reglementare;",
            "incalca drepturi de proprietate intelectuala sau de confidentialitate;",
            "incarca malware, cod daunator sau continut ilegal;",
            "incerca acces neautorizat la sisteme sau date;",
            "interfera cu disponibilitatea sau securitatea serviciului;",
            "face reverse engineering sau abuza API-urile, cu exceptia celor permise de documentatie;",
            "procesa activitati ilegale, frauduloase sau daunatoare;",
            "incarca date sensibile fara temei legal si garantii adecvate;",
            "utiliza functionalitatile AI pentru rezultate daunatoare, inselatoare sau ilegale.",
          ],
        },
        {
          type: "paragraph",
          text: "Putem suspenda sau inchide accesul daca avem motive rezonabile sa credem ca aceste reguli sunt incalcate.",
        },
      ],
    },
    {
      title: "8. Planuri, trial, facturare si plati",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora poate oferi trial-uri gratuite, acces private beta, planuri platite, limite de utilizare, limite de stocare, limite AI, limite de membri si alte restrictii pe baza de plan.",
        },
        {
          type: "paragraph",
          text: "Utilizatorii de trial nu sunt taxati in timpul unui trial gratuit sau al unui private beta neplatit, cu exceptia cazului in care aleg explicit un plan platit sau finalizeaza un checkout platit.",
        },
        {
          type: "paragraph",
          text: "Planurile platite sunt planuri de acces SaaS pe baza de abonament.",
        },
        {
          type: "paragraph",
          text: "Detaliile planurilor pot fi afisate pe pagina de preturi sau in produs.",
        },
        {
          type: "paragraph",
          text: "Daca facturarea platita este activata, platile pot fi procesate prin Paddle sau alt furnizor autorizat de facturare. Cand Paddle proceseaza o tranzactie, Paddle poate actiona ca Merchant of Record sau reseller autorizat pentru achizitii, taxe, facturi, chitante, instrumente de anulare, rambursari si procesarea platilor.",
        },
        {
          type: "paragraph",
          text: "Termenii abonamentului, reinnoirea, anularea, eligibilitatea pentru rambursare si gestionarea taxelor pot fi guvernate de termenii de checkout prezentati de furnizorul de plata la momentul achizitiei.",
        },
        {
          type: "paragraph",
          text: "Evenimentele de rambursare, anulare, plata, chargeback sau status al abonamentului afecteaza doar accesul SaaS, starea de facturare, entitlements, limitele, suportul si administrarea contului. Acestea nu creeaza, actualizeaza sau sterg automat tranzactii Money in workspace.",
        },
        {
          type: "paragraph",
          text: "Nevora poate actualiza planuri, preturi, limite sau functionalitati disponibile, dar modificarile nu vor reduce serviciul platit deja achizitionat pentru perioada curenta de facturare, cu exceptia motivelor legale, de securitate sau operationale.",
        },
      ],
    },
    {
      title: "9. Taxe",
      blocks: [
        {
          type: "paragraph",
          text: "Preturile pot exclude sau include taxele aplicabile, in functie de furnizorul de plata, locatia clientului si configuratia checkout-ului.",
        },
        {
          type: "paragraph",
          text: "Cand Paddle actioneaza ca Merchant of Record, Paddle poate calcula, colecta si remite taxele aplicabile conform propriilor termeni si obligatii legale.",
        },
      ],
    },
    {
      title: "10. Servicii terte",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora se poate integra cu servicii terte, precum furnizori de hosting, baze de date, AI, analytics, email, stocare si plati.",
        },
        {
          type: "paragraph",
          text: "Nu suntem responsabili pentru servicii terte aflate in afara controlului nostru, dar folosim grija rezonabila la selectarea furnizorilor necesari pentru operarea Nevora.",
        },
      ],
    },
    {
      title: "11. Modificari si disponibilitatea serviciului",
      blocks: [
        {
          type: "paragraph",
          text: "Putem modifica, imbunatati, suspenda sau intrerupe parti ale serviciului.",
        },
        {
          type: "paragraph",
          text: "Ne propunem sa oferim un serviciu fiabil, dar nu garantam disponibilitate neintrerupta sau fara erori, mai ales in perioada private beta.",
        },
      ],
    },
    {
      title: "12. Suspendare si incetare",
      blocks: [
        { type: "paragraph", text: "Puteti inceta utilizarea Nevora in orice moment." },
        { type: "paragraph", text: "Putem suspenda sau inchide contul sau workspace-ul dvs. daca:" },
        {
          type: "bullets",
          items: [
            "incalcati acesti Termeni;",
            "plata esueaza sau abonamentul expira;",
            "utilizarea dvs. creeaza risc de securitate, legal sau operational;",
            "este cerut de lege;",
            "programul private beta se incheie sau se modifica.",
          ],
        },
        {
          type: "paragraph",
          text: "Dupa incetare, accesul la serviciu si la Continutul clientului poate fi limitat sau eliminat conform politicilor noastre de retentie si legii aplicabile.",
        },
      ],
    },
    {
      title: "13. Proprietate intelectuala",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora, inclusiv software-ul, designul, workflow-urile, brandingul, documentatia si materialele conexe, este detinuta de NEVORA SRL sau licentiatorii sai.",
        },
        {
          type: "paragraph",
          text: "Acesti Termeni nu va acorda drept de proprietate asupra proprietatii intelectuale Nevora.",
        },
        {
          type: "paragraph",
          text: "Nu puteti copia, revinde, sublicentia sau exploata comercial serviciul decat in mod expres permis.",
        },
      ],
    },
    {
      title: "14. Feedback",
      blocks: [
        {
          type: "paragraph",
          text: "Daca furnizati feedback, sugestii sau idei, ne acordati dreptul de a le utiliza fara restrictii sau compensatii, cu conditia sa nu divulgam Continutul clientului confidential.",
        },
      ],
    },
    {
      title: "15. Confidentialitate",
      blocks: [
        { type: "paragraph", text: "Fiecare parte poate primi informatii confidentiale de la cealalta." },
        {
          type: "paragraph",
          text: "Dvs. si Nevora sunteti de acord sa folositi grija rezonabila pentru protejarea informatiilor confidentiale si sa le utilizati doar in scopul furnizarii sau utilizarii serviciului.",
        },
        {
          type: "paragraph",
          text: "Continutul clientului este tratat ca confidential, cu exceptia cazului in care este public, dezvoltat independent sau trebuie divulgat conform legii.",
        },
      ],
    },
    {
      title: "16. Disclaimer",
      blocks: [
        {
          type: "paragraph",
          text: 'Serviciul este furnizat "ca atare" si "in functie de disponibilitate", in masura maxima permisa de lege.',
        },
        {
          type: "paragraph",
          text: "Nu garantam ca Nevora va fi neintrerupt, fara erori, sigur impotriva tuturor amenintarilor sau potrivit pentru fiecare scop de business, juridic, financiar, fiscal sau contabil.",
        },
        {
          type: "paragraph",
          text: "Sunteti responsabil pentru verificarea independenta a deciziilor importante de business si financiare.",
        },
      ],
    },
    {
      title: "17. Limitarea raspunderii",
      blocks: [
        {
          type: "paragraph",
          text: "In masura maxima permisa de lege, NEVORA SRL nu va raspunde pentru daune indirecte, incidentale, speciale, consecutive, exemplare sau punitive, inclusiv pierdere de profit, venituri, date, goodwill sau intreruperea afacerii.",
        },
        {
          type: "paragraph",
          text: "In masura maxima permisa de lege, raspunderea noastra totala pentru orice pretentie legata de serviciu nu va depasi suma platita de dvs. catre Nevora pentru serviciu in cele trei luni anterioare evenimentului care a generat pretentia sau EUR 100 daca ati utilizat serviciul gratuit.",
        },
      ],
    },
    {
      title: "18. Despagubire",
      blocks: [
        {
          type: "paragraph",
          text: "Sunteti de acord sa despagubiti si sa protejati NEVORA SRL impotriva pretentiilor, daunelor, raspunderilor, costurilor si cheltuielilor care rezulta din:",
        },
        {
          type: "bullets",
          items: [
            "utilizarea serviciului de catre dvs.;",
            "Continutul clientului;",
            "incalcarea acestor Termeni;",
            "incalcarea legii aplicabile;",
            "incalcarea drepturilor tertilor.",
          ],
        },
      ],
    },
    {
      title: "19. Legea aplicabila",
      blocks: [
        {
          type: "paragraph",
          text: "Acesti Termeni sunt guvernati de legile Republicii Moldova, cu exceptia cazului in care legile obligatorii de protectie a consumatorilor impun altfel.",
        },
        {
          type: "paragraph",
          text: "Orice dispute vor fi solutionate de instantele competente din Republica Moldova, cu exceptia cazului in care legea aplicabila prevede un alt forum obligatoriu.",
        },
      ],
    },
    {
      title: "20. Modificari ale Termenilor",
      blocks: [
        { type: "paragraph", text: "Putem actualiza acesti Termeni din cand in cand." },
        {
          type: "paragraph",
          text: 'Daca modificarile sunt materiale, vom lua masuri rezonabile pentru a notifica utilizatorii, de exemplu prin afisarea unei notificari in serviciu sau actualizarea datei "Ultima actualizare".',
        },
        {
          type: "paragraph",
          text: "Continuarea utilizarii serviciului dupa intrarea in vigoare a modificarilor inseamna ca acceptati Termenii actualizati.",
        },
      ],
    },
    {
      title: "21. Contact",
      blocks: [
        { type: "paragraph", text: "Daca aveti intrebari despre acesti Termeni, contactati-ne:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Email", value: "nevorahq@gmail.com" },
            { label: "Adresa inregistrata", value: "[NEVORA SRL registered address]" },
            { label: "Numar de inregistrare / IDNO", value: "[NEVORA SRL registration number]" },
          ],
        },
      ],
    },
  ],
};

const termsRu: LegalDocument = {
  title: "Условия использования",
  lastUpdatedLabel: "Последнее обновление",
  lastUpdated: "9 июля 2026 г.",
  intro: [
    {
      type: "paragraph",
      text: 'Настоящие Условия использования ("Условия") регулируют доступ к Nevora Business OS и использование Nevora Business OS, SaaS-продукта, которым управляет NEVORA SRL ("Nevora", "мы", "нас" или "наш").',
    },
    {
      type: "paragraph",
      text: "Создавая аккаунт, запрашивая доступ, используя workspace или любую часть сервиса, вы соглашаетесь с настоящими Условиями.",
    },
    {
      type: "paragraph",
      text: "Если вы используете Nevora от имени компании или организации, вы подтверждаете, что имеете полномочия связывать такую организацию настоящими Условиями.",
    },
  ],
  sections: [
    {
      title: "1. О Nevora Business OS",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora Business OS — это рабочая операционная среда с AI-поддержкой для малого бизнеса и команд. Сервис может включать задачи, проекты, документы, денежные записи, подписки, Action Center, Capture Inbox, AI-assisted workflows, аналитику, Developer Access и связанные функции.",
        },
        {
          type: "paragraph",
          text: "Nevora помогает пользователям организовывать бизнес-операции и проверять предложенные действия. Nevora не заменяет профессиональные финансовые, юридические, налоговые, бухгалтерские или бизнес-консультации.",
        },
      ],
    },
    {
      title: "2. Private Beta",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora может предоставляться как private beta, early access, preview или trial-продукт.",
        },
        { type: "paragraph", text: "Во время private beta:" },
        {
          type: "bullets",
          items: [
            "функции могут изменяться;",
            "лимиты могут изменяться;",
            "некоторые workflow могут быть неполными;",
            "часть функциональности может быть отключена или доступна только по приглашению;",
            "доступность сервиса не гарантируется;",
            "мы можем собирать feedback для улучшения продукта.",
          ],
        },
        {
          type: "paragraph",
          text: "Мы можем принимать, отклонять, ограничивать или отзывать доступ к private beta по своему усмотрению.",
        },
      ],
    },
    {
      title: "3. Аккаунты и организации",
      blocks: [
        {
          type: "paragraph",
          text: "Вы должны предоставлять точную информацию об аккаунте и обеспечивать безопасность ваших учетных данных.",
        },
        { type: "paragraph", text: "Вы отвечаете за:" },
        {
          type: "bullets",
          items: [
            "всю активность под вашим аккаунтом;",
            "пользователей, приглашенных в вашу организацию или workspace;",
            "права доступа, выданные членам команды;",
            "точность данных, введенных в сервис;",
            "соблюдение применимого законодательства при использовании Nevora.",
          ],
        },
        {
          type: "paragraph",
          text: "Вы должны незамедлительно уведомить нас, если подозреваете несанкционированный доступ к аккаунту или workspace.",
        },
      ],
    },
    {
      title: "4. Customer Content",
      blocks: [
        {
          type: "paragraph",
          text: '"Customer Content" означает данные, файлы, документы, записи, тексты, изображения, финансовые записи, задачи, подписки, комментарии, метаданные и другую информацию, которую вы или ваши пользователи передаете в Nevora.',
        },
        { type: "paragraph", text: "Вы сохраняете право собственности на свой Customer Content." },
        {
          type: "paragraph",
          text: "Вы предоставляете Nevora ограниченную лицензию на хостинг, обработку, передачу, отображение, анализ и использование Customer Content только в той мере, в которой это необходимо, чтобы:",
        },
        {
          type: "bullets",
          items: [
            "предоставлять сервис;",
            "обеспечивать безопасность и поддержку сервиса;",
            "поддерживать пользовательские workflow;",
            "создавать AI-assisted suggestions, если они включены;",
            "устранять проблемы;",
            "соблюдать применимое законодательство.",
          ],
        },
        {
          type: "paragraph",
          text: "Вы отвечаете за наличие необходимых прав и разрешений для загрузки или обработки Customer Content в Nevora.",
        },
      ],
    },
    {
      title: "5. AI-assisted функции",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora может включать AI-assisted функции, такие как извлечение данных, классификация, резюме, рекомендации или предложенные действия.",
        },
        {
          type: "paragraph",
          text: "AI-assisted результаты могут быть неточными, неполными или неподходящими для вашей конкретной ситуации.",
        },
        {
          type: "paragraph",
          text: "Вы отвечаете за проверку и подтверждение AI-assisted результатов до того, как полагаться на них.",
        },
        {
          type: "paragraph",
          text: "Nevora не публикует финансовые транзакции автоматически, не отмечает обязательства как оплаченные и не принимает бизнес-решения без подтверждения пользователя, если только конкретный workflow явно не одобрен авторизованным пользователем.",
        },
      ],
    },
    {
      title: "6. Финансовые и бизнес-записи",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora может помогать отслеживать денежные записи, документы, подписки, обязательства и связанный бизнес-контекст.",
        },
        {
          type: "paragraph",
          text: "Nevora не является банком, бухгалтерской фирмой, налоговым консультантом, юридической фирмой, платежной организацией или регулируемым финансовым советником.",
        },
        {
          type: "paragraph",
          text: "Финансовые записи в Nevora являются операционными записями, созданными или подтвержденными пользователями. Вы отвечаете за проверку всей финансовой, бухгалтерской, налоговой и отчетной информации перед ее использованием в официальных целях.",
        },
      ],
    },
    {
      title: "7. Допустимое использование",
      blocks: [
        { type: "paragraph", text: "Вы не должны использовать Nevora для того, чтобы:" },
        {
          type: "bullets",
          items: [
            "нарушать закон или регулирование;",
            "нарушать права интеллектуальной собственности или privacy-права;",
            "загружать malware, вредоносный код или незаконный контент;",
            "пытаться получить несанкционированный доступ к системам или данным;",
            "мешать доступности или безопасности сервиса;",
            "делать reverse engineering или злоупотреблять API, кроме случаев, разрешенных документацией;",
            "обрабатывать незаконную, мошенническую или вредоносную деятельность;",
            "загружать чувствительные данные без законного основания и надлежащих safeguards;",
            "использовать AI-функции для вредоносных, вводящих в заблуждение или незаконных результатов.",
          ],
        },
        {
          type: "paragraph",
          text: "Мы можем приостановить или прекратить доступ, если разумно полагаем, что эти правила нарушены.",
        },
      ],
    },
    {
      title: "8. Тарифы, trial, billing и платежи",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora может предлагать free trials, private beta access, платные тарифы, лимиты использования, лимиты хранения, AI-лимиты, лимиты участников и другие ограничения по тарифам.",
        },
        {
          type: "paragraph",
          text: "Trial users не оплачивают бесплатный trial или неоплачиваемый private beta, если явно не выбирают платный тариф и не завершают платный checkout.",
        },
        {
          type: "paragraph",
          text: "Платные тарифы являются subscription-based SaaS access plans.",
        },
        {
          type: "paragraph",
          text: "Детали тарифов могут отображаться на pricing page или внутри продукта.",
        },
        {
          type: "paragraph",
          text: "Если платный billing включен, платежи могут обрабатываться через Paddle или другого авторизованного billing provider. Когда Paddle обрабатывает транзакцию, Paddle может выступать Merchant of Record или authorised reseller для покупок, налогов, инвойсов, чеков, инструментов отмены, возвратов и обработки платежей.",
        },
        {
          type: "paragraph",
          text: "Условия подписки, продление, отмена, право на возврат и обработка налогов могут регулироваться checkout-условиями платежного провайдера, представленными в момент покупки.",
        },
        {
          type: "paragraph",
          text: "События refund, cancellation, payment, chargeback или subscription status влияют только на SaaS-доступ, billing state, entitlements, лимиты, support и account administration. Они не создают, не обновляют и не удаляют Money transactions внутри workspace автоматически.",
        },
        {
          type: "paragraph",
          text: "Nevora может обновлять тарифы, цены, лимиты или доступные функции, но такие изменения не уменьшат уже купленный платный сервис в текущем billing period, кроме случаев, необходимых по юридическим, security или операционным причинам.",
        },
      ],
    },
    {
      title: "9. Налоги",
      blocks: [
        {
          type: "paragraph",
          text: "Цены могут включать или не включать применимые налоги в зависимости от платежного провайдера, страны клиента и checkout-конфигурации.",
        },
        {
          type: "paragraph",
          text: "Когда Paddle выступает Merchant of Record, Paddle может рассчитывать, собирать и перечислять применимые налоги согласно своим условиям и юридическим обязанностям.",
        },
      ],
    },
    {
      title: "10. Сторонние сервисы",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora может интегрироваться со сторонними сервисами, такими как hosting providers, database providers, AI providers, analytics providers, email providers, storage providers и payment providers.",
        },
        {
          type: "paragraph",
          text: "Мы не отвечаем за сторонние сервисы вне нашего контроля, но проявляем разумную осмотрительность при выборе провайдеров, необходимых для работы Nevora.",
        },
      ],
    },
    {
      title: "11. Изменения и доступность сервиса",
      blocks: [
        {
          type: "paragraph",
          text: "Мы можем изменять, улучшать, приостанавливать или прекращать части сервиса.",
        },
        {
          type: "paragraph",
          text: "Мы стремимся предоставлять надежный сервис, но не гарантируем бесперебойную или безошибочную доступность, особенно во время private beta.",
        },
      ],
    },
    {
      title: "12. Приостановка и прекращение",
      blocks: [
        { type: "paragraph", text: "Вы можете прекратить использование Nevora в любое время." },
        { type: "paragraph", text: "Мы можем приостановить или прекратить ваш аккаунт или workspace, если:" },
        {
          type: "bullets",
          items: [
            "вы нарушаете настоящие Условия;",
            "платеж не проходит или подписка истекает;",
            "ваше использование создает security, legal или operational risk;",
            "это требуется законом;",
            "private beta program завершается или меняется.",
          ],
        },
        {
          type: "paragraph",
          text: "После прекращения доступ к сервису и Customer Content может быть ограничен или удален согласно нашим retention policies и применимому законодательству.",
        },
      ],
    },
    {
      title: "13. Интеллектуальная собственность",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora, включая software, design, workflows, branding, documentation и связанные материалы, принадлежит NEVORA SRL или ее лицензиарам.",
        },
        {
          type: "paragraph",
          text: "Настоящие Условия не предоставляют вам право собственности на интеллектуальную собственность Nevora.",
        },
        {
          type: "paragraph",
          text: "Вы не можете копировать, перепродавать, сублицензировать или коммерчески эксплуатировать сервис, кроме случаев, явно разрешенных.",
        },
      ],
    },
    {
      title: "14. Feedback",
      blocks: [
        {
          type: "paragraph",
          text: "Если вы предоставляете feedback, предложения или идеи, вы предоставляете нам право использовать их без ограничений или компенсации при условии, что мы не раскрываем ваш конфиденциальный Customer Content.",
        },
      ],
    },
    {
      title: "15. Конфиденциальность",
      blocks: [
        { type: "paragraph", text: "Каждая сторона может получать конфиденциальную информацию от другой стороны." },
        {
          type: "paragraph",
          text: "Вы и Nevora соглашаетесь применять разумную заботу для защиты конфиденциальной информации и использовать ее только для предоставления или использования сервиса.",
        },
        {
          type: "paragraph",
          text: "Customer Content считается конфиденциальным, если он не является публично доступным, независимо разработанным или подлежащим раскрытию по закону.",
        },
      ],
    },
    {
      title: "16. Отказ от гарантий",
      blocks: [
        {
          type: "paragraph",
          text: 'Сервис предоставляется "как есть" и "по мере доступности" в максимально допустимой законом степени.',
        },
        {
          type: "paragraph",
          text: "Мы не гарантируем, что Nevora будет бесперебойной, безошибочной, защищенной от всех угроз или подходящей для любой бизнес-, юридической, финансовой, налоговой или бухгалтерской цели.",
        },
        {
          type: "paragraph",
          text: "Вы отвечаете за независимую проверку важных бизнес- и финансовых решений.",
        },
      ],
    },
    {
      title: "17. Ограничение ответственности",
      blocks: [
        {
          type: "paragraph",
          text: "В максимально допустимой законом степени NEVORA SRL не несет ответственности за косвенные, случайные, специальные, последующие, exemplary или punitive damages, включая потерю прибыли, выручки, данных, goodwill или перерыв в бизнесе.",
        },
        {
          type: "paragraph",
          text: "В максимально допустимой законом степени наша общая ответственность по любому требованию, связанному с сервисом, не превышает сумму, уплаченную вами Nevora за сервис в течение трех месяцев до события, вызвавшего требование, или EUR 100, если вы использовали сервис бесплатно.",
        },
      ],
    },
    {
      title: "18. Indemnity",
      blocks: [
        {
          type: "paragraph",
          text: "Вы соглашаетесь возмещать убытки и защищать NEVORA SRL от претензий, ущерба, ответственности, затрат и расходов, возникающих из:",
        },
        {
          type: "bullets",
          items: [
            "вашего использования сервиса;",
            "вашего Customer Content;",
            "вашего нарушения настоящих Условий;",
            "вашего нарушения применимого законодательства;",
            "вашего нарушения прав третьих лиц.",
          ],
        },
      ],
    },
    {
      title: "19. Применимое право",
      blocks: [
        {
          type: "paragraph",
          text: "Настоящие Условия регулируются законодательством Республики Молдова, если обязательные законы о защите прав потребителей не требуют иного.",
        },
        {
          type: "paragraph",
          text: "Любые споры рассматриваются компетентными судами Республики Молдова, если применимое законодательство не предусматривает иной обязательный форум.",
        },
      ],
    },
    {
      title: "20. Изменения Условий",
      blocks: [
        { type: "paragraph", text: "Мы можем периодически обновлять настоящие Условия." },
        {
          type: "paragraph",
          text: "Если изменения существенные, мы предпримем разумные меры для уведомления пользователей, например разместим уведомление в сервисе или обновим дату последнего обновления.",
        },
        {
          type: "paragraph",
          text: "Продолжение использования сервиса после вступления изменений в силу означает ваше согласие с обновленными Условиями.",
        },
      ],
    },
    {
      title: "21. Контакты",
      blocks: [
        { type: "paragraph", text: "Если у вас есть вопросы об этих Условиях, свяжитесь с нами:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Email", value: "nevorahq@gmail.com" },
            { label: "Юридический адрес", value: "[NEVORA SRL registered address]" },
            { label: "Регистрационный номер / IDNO", value: "[NEVORA SRL registration number]" },
          ],
        },
      ],
    },
  ],
};

const privacyEn: LegalDocument = {
  title: "Privacy Policy",
  lastUpdatedLabel: "Last updated",
  lastUpdated: "July 9, 2026",
  intro: [
    {
      type: "paragraph",
      text: 'This Privacy Policy explains how NEVORA SRL ("Nevora", "we", "us", or "our") collects, uses, stores, shares, and protects personal data when you use Nevora Business OS, our website, private beta, and related services.',
    },
    { type: "paragraph", text: "This Privacy Policy applies to:" },
    {
      type: "bullets",
      items: [
        "visitors to our website;",
        "users who request early access;",
        "account holders;",
        "members invited to organizations or workspaces;",
        "customers and trial users;",
        "people who contact us for support, feedback, or business communication.",
      ],
    },
  ],
  sections: [
    {
      title: "1. Who We Are",
      blocks: [
        { type: "paragraph", text: "The service is operated by:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Registered address", value: "[NEVORA SRL registered address]" },
            { label: "Registration number / IDNO", value: "[NEVORA SRL registration number]" },
            { label: "Email", value: "nevorahq@gmail.com" },
          ],
        },
        { type: "paragraph", text: "For privacy-related requests, contact:" },
        { type: "contact", lines: [{ label: "Email", value: "nevorahq@gmail.com" }] },
        {
          type: "paragraph",
          text: "If a Data Protection Officer is appointed later, this Privacy Policy should be updated with DPO contact details.",
        },
      ],
    },
    {
      title: "2. Our Role",
      blocks: [
        { type: "paragraph", text: "Depending on the context, Nevora may act as:" },
        { type: "subheading", title: "Controller" },
        {
          type: "paragraph",
          text: "We act as controller for personal data that we process for our own purposes, such as:",
        },
        {
          type: "bullets",
          items: [
            "account registration;",
            "authentication;",
            "billing administration;",
            "customer support;",
            "website analytics;",
            "security logs;",
            "product communications;",
            "private beta management.",
          ],
        },
        { type: "subheading", title: "Processor" },
        {
          type: "paragraph",
          text: "We may act as processor for Customer Content that users upload or create inside Nevora, such as:",
        },
        {
          type: "bullets",
          items: [
            "business documents;",
            "task records;",
            "project records;",
            "money records;",
            "subscription records;",
            "workspace comments;",
            "files and metadata;",
            "data about a customer's own employees, clients, suppliers, or contractors.",
          ],
        },
        {
          type: "paragraph",
          text: "In that case, the organization using Nevora is responsible for having a lawful basis to process that data.",
        },
      ],
    },
    {
      title: "3. Personal Data We Collect",
      blocks: [
        { type: "paragraph", text: "We may collect the following categories of personal data." },
        { type: "subheading", title: "Account and identity data" },
        {
          type: "bullets",
          items: [
            "name;",
            "email address;",
            "password authentication data or authentication provider ID;",
            "organization/workspace membership;",
            "role and permissions;",
            "language or interface preferences.",
          ],
        },
        { type: "subheading", title: "Contact and communication data" },
        {
          type: "bullets",
          items: [
            "messages you send to us;",
            "feedback;",
            "support requests;",
            "Telegram, email, or social media contact data if you contact us through those channels.",
          ],
        },
        { type: "subheading", title: "Workspace and Customer Content" },
        { type: "paragraph", text: "Depending on how you use the product, this may include:" },
        {
          type: "bullets",
          items: [
            "tasks and project data;",
            "documents and files;",
            "document text extracted or processed by the system;",
            "money records entered by users;",
            "subscription records;",
            "operational notes;",
            "business metadata;",
            "relation links between entities;",
            "activity and audit history.",
          ],
        },
        { type: "paragraph", text: "You control what Customer Content you upload or create." },
        { type: "subheading", title: "Billing and payment data" },
        {
          type: "paragraph",
          text: "If paid plans are enabled, billing may be processed by Paddle or another authorized payment provider.",
        },
        { type: "paragraph", text: "We may receive limited billing information such as:" },
        {
          type: "bullets",
          items: [
            "customer name;",
            "email;",
            "billing country;",
            "plan purchased;",
            "subscription status;",
            "transaction status;",
            "invoice or receipt reference;",
            "tax-related information made available by the payment provider.",
          ],
        },
        { type: "paragraph", text: "We do not intentionally store full card numbers in Nevora." },
        { type: "subheading", title: "Usage and technical data" },
        {
          type: "bullets",
          items: [
            "IP address;",
            "browser type;",
            "device information;",
            "pages viewed;",
            "login timestamps;",
            "activity logs;",
            "error logs;",
            "security events;",
            "API usage;",
            "feature usage;",
            "storage and usage counters.",
          ],
        },
        { type: "subheading", title: "Cookies and similar technologies" },
        { type: "paragraph", text: "We may use cookies and similar technologies for:" },
        {
          type: "bullets",
          items: [
            "essential website and authentication functionality;",
            "security;",
            "session management;",
            "preferences;",
            "analytics;",
            "product improvement.",
          ],
        },
        {
          type: "paragraph",
          text: "Where required by law, non-essential cookies should be used only with consent.",
        },
      ],
    },
    {
      title: "4. How We Use Personal Data",
      blocks: [
        { type: "paragraph", text: "We use personal data to:" },
        {
          type: "bullets",
          items: [
            "provide and operate Nevora;",
            "create and manage accounts;",
            "manage organizations, members, roles, and permissions;",
            "store and display Customer Content;",
            "process documents and user-confirmed workflows;",
            "provide AI-assisted suggestions where enabled;",
            "manage trials, plans, limits, and billing;",
            "provide support;",
            "send service messages;",
            "improve product reliability and usability;",
            "protect against abuse, fraud, unauthorized access, and security incidents;",
            "comply with legal obligations;",
            "enforce our Terms of Service.",
          ],
        },
      ],
    },
    {
      title: "5. Legal Bases for Processing",
      blocks: [
        {
          type: "paragraph",
          text: "Depending on the context and applicable law, we rely on one or more of the following legal bases:",
        },
        { type: "subheading", title: "Contract" },
        {
          type: "paragraph",
          text: "We process data to provide the service you requested, manage your account, deliver workspace functionality, and administer your subscription or trial.",
        },
        { type: "subheading", title: "Legitimate interests" },
        {
          type: "paragraph",
          text: "We process data for security, fraud prevention, service improvement, internal analytics, support, product development, and business communication, where those interests are not overridden by your rights.",
        },
        { type: "subheading", title: "Consent" },
        {
          type: "paragraph",
          text: "We may rely on consent for optional marketing communications, non-essential cookies, or certain optional data processing activities.",
        },
        { type: "subheading", title: "Legal obligation" },
        {
          type: "paragraph",
          text: "We may process data where required for tax, accounting, regulatory, dispute resolution, or legal compliance purposes.",
        },
      ],
    },
    {
      title: "6. AI-Assisted Processing",
      blocks: [
        { type: "paragraph", text: "Nevora may use AI-assisted features to help with:" },
        {
          type: "bullets",
          items: [
            "document extraction;",
            "classification;",
            "summaries;",
            "recommendations;",
            "suggested actions;",
            "operational context.",
          ],
        },
        {
          type: "paragraph",
          text: "AI-assisted outputs are reviewable and should be confirmed by users before relying on them.",
        },
        {
          type: "paragraph",
          text: "We do not use AI to automatically post financial transactions or make final business decisions without user confirmation.",
        },
        {
          type: "paragraph",
          text: "Depending on configuration, Customer Content may be processed by third-party AI providers acting as subprocessors. We should document the active AI providers in our subprocessors list.",
        },
      ],
    },
    {
      title: "7. Payments Through Paddle",
      blocks: [
        {
          type: "paragraph",
          text: "If Paddle is used for paid plans after private beta or trial access, Paddle may act as Merchant of Record or authorised reseller for payment processing, checkout, receipts, taxes, invoicing, cancellation tools, refund processing, fraud prevention, and buyer support.",
        },
        {
          type: "paragraph",
          text: "Paddle may collect and process buyer data such as name, email, location, billing details, payment information, purchase details, and tax information.",
        },
        {
          type: "paragraph",
          text: "Paddle may share limited buyer and subscription data with Nevora to allow us to provide access to the purchased service, manage subscriptions, provide support, and prevent fraud.",
        },
        {
          type: "paragraph",
          text: "Billing, refund, cancellation, chargeback, and subscription-status events are used for SaaS access, billing state, entitlements, limits, support, and account administration. They do not automatically create, update, or delete Money transactions inside a workspace.",
        },
        {
          type: "paragraph",
          text: "Paddle's processing is also governed by Paddle's own legal terms and privacy documents.",
        },
      ],
    },
    {
      title: "8. Sharing Personal Data",
      blocks: [
        { type: "paragraph", text: "We may share personal data with:" },
        {
          type: "bullets",
          items: [
            "hosting and infrastructure providers;",
            "database and storage providers;",
            "authentication providers;",
            "email and communication providers;",
            "analytics providers;",
            "AI providers, where enabled;",
            "payment providers such as Paddle;",
            "professional advisors;",
            "authorities, courts, or regulators where required by law;",
            "successors in the event of merger, acquisition, restructuring, or sale of assets.",
          ],
        },
        { type: "paragraph", text: "We do not sell personal data." },
      ],
    },
    {
      title: "9. International Transfers",
      blocks: [
        {
          type: "paragraph",
          text: "Some service providers may process data outside the Republic of Moldova, the European Economic Area, or your country of residence.",
        },
        {
          type: "paragraph",
          text: "Where required, we use appropriate safeguards such as contractual protections, data processing agreements, standard contractual clauses, or equivalent mechanisms.",
        },
      ],
    },
    {
      title: "10. Data Retention",
      blocks: [
        {
          type: "paragraph",
          text: "We keep personal data only for as long as necessary for the purposes described in this Privacy Policy.",
        },
        { type: "paragraph", text: "Typical retention principles:" },
        {
          type: "bullets",
          items: [
            "account data is kept while the account is active;",
            "workspace data is kept while the organization uses the service;",
            "billing records may be kept as required for tax, accounting, and legal obligations;",
            "security logs may be kept for a limited period for fraud prevention and incident investigation;",
            "support messages may be kept as needed to handle requests and improve service.",
          ],
        },
        {
          type: "paragraph",
          text: "When data is no longer needed, we delete, anonymize, or securely archive it unless we are legally required to keep it.",
        },
      ],
    },
    {
      title: "11. Security",
      blocks: [
        {
          type: "paragraph",
          text: "We use technical and organizational measures designed to protect personal data, including:",
        },
        {
          type: "bullets",
          items: [
            "access controls;",
            "authentication;",
            "role-based permissions;",
            "tenant isolation;",
            "database security controls;",
            "encrypted transport where applicable;",
            "audit and security logs;",
            "operational monitoring;",
            "restricted access to production systems.",
          ],
        },
        {
          type: "paragraph",
          text: "No system is perfectly secure. You are responsible for keeping your login credentials confidential and for managing access within your organization.",
        },
      ],
    },
    {
      title: "12. Your Rights",
      blocks: [
        { type: "paragraph", text: "Depending on applicable law, you may have the right to:" },
        {
          type: "bullets",
          items: [
            "request access to your personal data;",
            "request correction of inaccurate data;",
            "request deletion of your data;",
            "request restriction of processing;",
            "object to certain processing;",
            "withdraw consent where processing is based on consent;",
            "request data portability;",
            "lodge a complaint with a competent data protection authority.",
          ],
        },
        { type: "paragraph", text: "To exercise your rights, contact us at:" },
        { type: "contact", lines: [{ label: "Email", value: "nevorahq@gmail.com" }] },
        { type: "paragraph", text: "We may need to verify your identity before responding." },
        {
          type: "paragraph",
          text: "If your request concerns Customer Content controlled by an organization using Nevora, we may direct the request to that organization.",
        },
      ],
    },
    {
      title: "13. Data Protection Authority",
      blocks: [
        {
          type: "paragraph",
          text: "For users in the Republic of Moldova, the competent authority is the National Center for Personal Data Protection of the Republic of Moldova.",
        },
        {
          type: "paragraph",
          text: "You may have the right to contact the authority if you believe your personal data rights have been violated.",
        },
      ],
    },
    {
      title: "14. Children's Privacy",
      blocks: [
        { type: "paragraph", text: "Nevora is intended for business use and is not directed to children." },
        {
          type: "paragraph",
          text: "We do not knowingly collect personal data from children. If you believe a child has provided personal data to us, contact us so we can take appropriate action.",
        },
      ],
    },
    {
      title: "15. Marketing Communications",
      blocks: [
        {
          type: "paragraph",
          text: "We may send service-related messages necessary for account, security, product, billing, or operational purposes.",
        },
        {
          type: "paragraph",
          text: "Marketing communications, where used, should be based on consent or another lawful basis. You may opt out of marketing communications at any time.",
        },
      ],
    },
    {
      title: "16. Changes to This Privacy Policy",
      blocks: [
        { type: "paragraph", text: "We may update this Privacy Policy from time to time." },
        {
          type: "paragraph",
          text: 'If changes are material, we will take reasonable steps to notify users, such as by updating the "Last updated" date, posting a notice, or sending a message where appropriate.',
        },
        {
          type: "paragraph",
          text: "Continued use of the service after the updated Privacy Policy becomes effective means you acknowledge the updated policy.",
        },
      ],
    },
    {
      title: "17. Contact",
      blocks: [
        { type: "paragraph", text: "For privacy questions or requests:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Email", value: "nevorahq@gmail.com" },
            { label: "Registered address", value: "[NEVORA SRL registered address]" },
            { label: "Registration number / IDNO", value: "[NEVORA SRL registration number]" },
          ],
        },
      ],
    },
  ],
};

const privacyRo: LegalDocument = {
  title: "Politica de confidentialitate",
  lastUpdatedLabel: "Ultima actualizare",
  lastUpdated: "9 iulie 2026",
  intro: [
    {
      type: "paragraph",
      text: 'Aceasta Politica de confidentialitate explica modul in care NEVORA SRL ("Nevora", "noi" sau "nostru") colecteaza, utilizeaza, stocheaza, partajeaza si protejeaza datele cu caracter personal atunci cand utilizati Nevora Business OS, website-ul nostru, private beta si serviciile conexe.',
    },
    { type: "paragraph", text: "Aceasta Politica de confidentialitate se aplica:" },
    {
      type: "bullets",
      items: [
        "vizitatorilor website-ului nostru;",
        "utilizatorilor care solicita early access;",
        "detinatorilor de cont;",
        "membrilor invitati in organizatii sau workspace-uri;",
        "clientilor si utilizatorilor trial;",
        "persoanelor care ne contacteaza pentru suport, feedback sau comunicare de business.",
      ],
    },
  ],
  sections: [
    {
      title: "1. Cine suntem",
      blocks: [
        { type: "paragraph", text: "Serviciul este operat de:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Adresa inregistrata", value: "[NEVORA SRL registered address]" },
            { label: "Numar de inregistrare / IDNO", value: "[NEVORA SRL registration number]" },
            { label: "Email", value: "nevorahq@gmail.com" },
          ],
        },
        { type: "paragraph", text: "Pentru solicitari legate de confidentialitate, contactati:" },
        { type: "contact", lines: [{ label: "Email", value: "nevorahq@gmail.com" }] },
        {
          type: "paragraph",
          text: "Daca va fi desemnat ulterior un responsabil cu protectia datelor, aceasta Politica de confidentialitate trebuie actualizata cu datele de contact ale DPO.",
        },
      ],
    },
    {
      title: "2. Rolul nostru",
      blocks: [
        { type: "paragraph", text: "In functie de context, Nevora poate actiona ca:" },
        { type: "subheading", title: "Operator" },
        {
          type: "paragraph",
          text: "Actionam ca operator pentru datele cu caracter personal pe care le prelucram in scopurile noastre, cum ar fi:",
        },
        {
          type: "bullets",
          items: [
            "inregistrarea contului;",
            "autentificarea;",
            "administrarea facturarii;",
            "suportul pentru clienti;",
            "analytics pentru website;",
            "loguri de securitate;",
            "comunicari de produs;",
            "administrarea private beta.",
          ],
        },
        { type: "subheading", title: "Persoana imputernicita" },
        {
          type: "paragraph",
          text: "Putem actiona ca persoana imputernicita pentru Continutul clientului pe care utilizatorii il incarca sau il creeaza in Nevora, cum ar fi:",
        },
        {
          type: "bullets",
          items: [
            "documente de business;",
            "inregistrari de sarcini;",
            "inregistrari de proiecte;",
            "inregistrari financiare;",
            "inregistrari de abonamente;",
            "comentarii din workspace;",
            "fisiere si metadate;",
            "date despre angajatii, clientii, furnizorii sau contractorii proprii ai clientului.",
          ],
        },
        {
          type: "paragraph",
          text: "In acest caz, organizatia care utilizeaza Nevora este responsabila sa aiba un temei legal pentru prelucrarea acestor date.",
        },
      ],
    },
    {
      title: "3. Date personale pe care le colectam",
      blocks: [
        { type: "paragraph", text: "Putem colecta urmatoarele categorii de date cu caracter personal." },
        { type: "subheading", title: "Date de cont si identitate" },
        {
          type: "bullets",
          items: [
            "nume;",
            "adresa de email;",
            "date de autentificare a parolei sau ID-ul furnizorului de autentificare;",
            "apartenenta la organizatie/workspace;",
            "rol si permisiuni;",
            "preferinte de limba sau interfata.",
          ],
        },
        { type: "subheading", title: "Date de contact si comunicare" },
        {
          type: "bullets",
          items: [
            "mesaje pe care ni le trimiteti;",
            "feedback;",
            "solicitari de suport;",
            "date de contact Telegram, email sau social media daca ne contactati prin aceste canale.",
          ],
        },
        { type: "subheading", title: "Workspace si Continutul clientului" },
        { type: "paragraph", text: "In functie de modul in care utilizati produsul, acestea pot include:" },
        {
          type: "bullets",
          items: [
            "date despre sarcini si proiecte;",
            "documente si fisiere;",
            "text de document extras sau procesat de sistem;",
            "inregistrari financiare introduse de utilizatori;",
            "inregistrari de abonamente;",
            "note operationale;",
            "metadate de business;",
            "legaturi de relatie intre entitati;",
            "istoric de activitate si audit.",
          ],
        },
        { type: "paragraph", text: "Dvs. controlati ce Continut al clientului incarcati sau creati." },
        { type: "subheading", title: "Date de facturare si plata" },
        {
          type: "paragraph",
          text: "Daca planurile platite sunt activate, facturarea poate fi procesata de Paddle sau alt furnizor autorizat de plata.",
        },
        { type: "paragraph", text: "Putem primi informatii limitate de facturare, cum ar fi:" },
        {
          type: "bullets",
          items: [
            "numele clientului;",
            "email;",
            "tara de facturare;",
            "planul achizitionat;",
            "statusul abonamentului;",
            "statusul tranzactiei;",
            "referinta facturii sau chitantei;",
            "informatii fiscale puse la dispozitie de furnizorul de plata.",
          ],
        },
        { type: "paragraph", text: "Nu stocam in mod intentionat numere complete de card in Nevora." },
        { type: "subheading", title: "Date de utilizare si tehnice" },
        {
          type: "bullets",
          items: [
            "adresa IP;",
            "tipul browserului;",
            "informatii despre dispozitiv;",
            "pagini vizualizate;",
            "timestamp-uri de autentificare;",
            "loguri de activitate;",
            "loguri de eroare;",
            "evenimente de securitate;",
            "utilizare API;",
            "utilizare functionalitati;",
            "contoare de stocare si utilizare.",
          ],
        },
        { type: "subheading", title: "Cookies si tehnologii similare" },
        { type: "paragraph", text: "Putem utiliza cookies si tehnologii similare pentru:" },
        {
          type: "bullets",
          items: [
            "functionalitati esentiale ale website-ului si autentificarii;",
            "securitate;",
            "managementul sesiunii;",
            "preferinte;",
            "analytics;",
            "imbunatatirea produsului.",
          ],
        },
        {
          type: "paragraph",
          text: "Unde este cerut de lege, cookies neesentiale ar trebui utilizate doar cu consimtamant.",
        },
      ],
    },
    {
      title: "4. Cum utilizam datele personale",
      blocks: [
        { type: "paragraph", text: "Utilizam datele personale pentru a:" },
        {
          type: "bullets",
          items: [
            "furniza si opera Nevora;",
            "crea si administra conturi;",
            "gestiona organizatii, membri, roluri si permisiuni;",
            "stoca si afisa Continutul clientului;",
            "procesa documente si workflow-uri confirmate de utilizatori;",
            "oferi sugestii asistate de AI acolo unde sunt activate;",
            "gestiona trial-uri, planuri, limite si facturare;",
            "oferi suport;",
            "trimite mesaje de serviciu;",
            "imbunatati fiabilitatea si utilizabilitatea produsului;",
            "proteja impotriva abuzului, fraudei, accesului neautorizat si incidentelor de securitate;",
            "respecta obligatiile legale;",
            "aplica Termenii de utilizare.",
          ],
        },
      ],
    },
    {
      title: "5. Temeiuri legale pentru prelucrare",
      blocks: [
        {
          type: "paragraph",
          text: "In functie de context si legea aplicabila, ne bazam pe unul sau mai multe dintre urmatoarele temeiuri legale:",
        },
        { type: "subheading", title: "Contract" },
        {
          type: "paragraph",
          text: "Prelucram date pentru a furniza serviciul solicitat, pentru a va gestiona contul, pentru a livra functionalitatea workspace-ului si pentru a administra abonamentul sau trial-ul.",
        },
        { type: "subheading", title: "Interese legitime" },
        {
          type: "paragraph",
          text: "Prelucram date pentru securitate, prevenirea fraudei, imbunatatirea serviciului, analytics intern, suport, dezvoltare de produs si comunicare de business, atunci cand aceste interese nu sunt depasite de drepturile dvs.",
        },
        { type: "subheading", title: "Consimtamant" },
        {
          type: "paragraph",
          text: "Ne putem baza pe consimtamant pentru comunicari de marketing optionale, cookies neesentiale sau anumite activitati optionale de prelucrare.",
        },
        { type: "subheading", title: "Obligatie legala" },
        {
          type: "paragraph",
          text: "Putem prelucra date atunci cand este necesar pentru taxe, contabilitate, reglementare, solutionarea disputelor sau conformitate legala.",
        },
      ],
    },
    {
      title: "6. Prelucrare asistata de AI",
      blocks: [
        { type: "paragraph", text: "Nevora poate utiliza functionalitati asistate de AI pentru:" },
        {
          type: "bullets",
          items: [
            "extractie de documente;",
            "clasificare;",
            "rezumate;",
            "recomandari;",
            "actiuni sugerate;",
            "context operational.",
          ],
        },
        {
          type: "paragraph",
          text: "Rezultatele asistate de AI pot fi revizuite si ar trebui confirmate de utilizatori inainte de a se baza pe ele.",
        },
        {
          type: "paragraph",
          text: "Nu folosim AI pentru a posta automat tranzactii financiare sau pentru a lua decizii finale de business fara confirmarea utilizatorului.",
        },
        {
          type: "paragraph",
          text: "In functie de configuratie, Continutul clientului poate fi procesat de furnizori AI terti care actioneaza ca subimputerniciti. Ar trebui sa documentam furnizorii AI activi in lista noastra de subprocessors.",
        },
      ],
    },
    {
      title: "7. Plati prin Paddle",
      blocks: [
        {
          type: "paragraph",
          text: "Daca Paddle este utilizat pentru planuri platite dupa acces private beta sau trial, Paddle poate actiona ca Merchant of Record sau reseller autorizat pentru procesarea platilor, checkout, chitante, taxe, facturare, instrumente de anulare, procesarea rambursarilor, prevenirea fraudei si suport pentru cumparatori.",
        },
        {
          type: "paragraph",
          text: "Paddle poate colecta si prelucra date despre cumparator, precum nume, email, locatie, date de facturare, informatii de plata, detalii de achizitie si informatii fiscale.",
        },
        {
          type: "paragraph",
          text: "Paddle poate partaja cu Nevora date limitate despre cumparator si abonament pentru a ne permite sa oferim acces la serviciul achizitionat, sa gestionam abonamente, sa oferim suport si sa prevenim frauda.",
        },
        {
          type: "paragraph",
          text: "Evenimentele de facturare, rambursare, anulare, chargeback si status al abonamentului sunt folosite pentru acces SaaS, stare de facturare, entitlements, limite, suport si administrarea contului. Acestea nu creeaza, actualizeaza sau sterg automat tranzactii Money intr-un workspace.",
        },
        {
          type: "paragraph",
          text: "Prelucrarea de catre Paddle este guvernata si de propriii termeni legali si documente de confidentialitate Paddle.",
        },
      ],
    },
    {
      title: "8. Partajarea datelor personale",
      blocks: [
        { type: "paragraph", text: "Putem partaja date personale cu:" },
        {
          type: "bullets",
          items: [
            "furnizori de hosting si infrastructura;",
            "furnizori de baze de date si stocare;",
            "furnizori de autentificare;",
            "furnizori de email si comunicare;",
            "furnizori de analytics;",
            "furnizori AI, unde sunt activati;",
            "furnizori de plata precum Paddle;",
            "consilieri profesionali;",
            "autoritati, instante sau regulatori unde este cerut de lege;",
            "succesori in cazul unei fuziuni, achizitii, restructurari sau vanzari de active.",
          ],
        },
        { type: "paragraph", text: "Nu vindem date personale." },
      ],
    },
    {
      title: "9. Transferuri internationale",
      blocks: [
        {
          type: "paragraph",
          text: "Unii furnizori de servicii pot prelucra date in afara Republicii Moldova, a Spatiului Economic European sau a tarii dvs. de resedinta.",
        },
        {
          type: "paragraph",
          text: "Unde este necesar, folosim garantii adecvate, precum protectii contractuale, acorduri de prelucrare a datelor, clauze contractuale standard sau mecanisme echivalente.",
        },
      ],
    },
    {
      title: "10. Retentia datelor",
      blocks: [
        {
          type: "paragraph",
          text: "Pastram datele personale doar atat timp cat este necesar pentru scopurile descrise in aceasta Politica de confidentialitate.",
        },
        { type: "paragraph", text: "Principii tipice de retentie:" },
        {
          type: "bullets",
          items: [
            "datele de cont sunt pastrate cat timp contul este activ;",
            "datele workspace-ului sunt pastrate cat timp organizatia utilizeaza serviciul;",
            "inregistrarile de facturare pot fi pastrate conform obligatiilor fiscale, contabile si legale;",
            "logurile de securitate pot fi pastrate o perioada limitata pentru prevenirea fraudei si investigarea incidentelor;",
            "mesajele de suport pot fi pastrate cat este necesar pentru gestionarea solicitarilor si imbunatatirea serviciului.",
          ],
        },
        {
          type: "paragraph",
          text: "Cand datele nu mai sunt necesare, le stergem, anonimizam sau arhivam in siguranta, cu exceptia cazului in care suntem obligati legal sa le pastram.",
        },
      ],
    },
    {
      title: "11. Securitate",
      blocks: [
        {
          type: "paragraph",
          text: "Folosim masuri tehnice si organizationale concepute sa protejeze datele personale, inclusiv:",
        },
        {
          type: "bullets",
          items: [
            "controale de acces;",
            "autentificare;",
            "permisiuni pe baza de rol;",
            "izolare intre tenant-i;",
            "controale de securitate pentru baza de date;",
            "transport criptat unde este aplicabil;",
            "loguri de audit si securitate;",
            "monitorizare operationala;",
            "acces restrictionat la sistemele de productie.",
          ],
        },
        {
          type: "paragraph",
          text: "Niciun sistem nu este perfect securizat. Sunteti responsabil pentru pastrarea confidentialitatii datelor de autentificare si pentru gestionarea accesului in organizatia dvs.",
        },
      ],
    },
    {
      title: "12. Drepturile dvs.",
      blocks: [
        { type: "paragraph", text: "In functie de legea aplicabila, puteti avea dreptul sa:" },
        {
          type: "bullets",
          items: [
            "solicitati acces la datele dvs. personale;",
            "solicitati corectarea datelor inexacte;",
            "solicitati stergerea datelor;",
            "solicitati restrictionarea prelucrarii;",
            "va opuneti anumitor prelucrari;",
            "va retrageti consimtamantul unde prelucrarea se bazeaza pe consimtamant;",
            "solicitati portabilitatea datelor;",
            "depuneti o plangere la o autoritate competenta de protectie a datelor.",
          ],
        },
        { type: "paragraph", text: "Pentru exercitarea drepturilor, contactati-ne la:" },
        { type: "contact", lines: [{ label: "Email", value: "nevorahq@gmail.com" }] },
        { type: "paragraph", text: "Este posibil sa fie nevoie sa va verificam identitatea inainte de a raspunde." },
        {
          type: "paragraph",
          text: "Daca solicitarea dvs. priveste Continutul clientului controlat de o organizatie care utilizeaza Nevora, putem directiona solicitarea catre acea organizatie.",
        },
      ],
    },
    {
      title: "13. Autoritatea de protectie a datelor",
      blocks: [
        {
          type: "paragraph",
          text: "Pentru utilizatorii din Republica Moldova, autoritatea competenta este Centrul National pentru Protectia Datelor cu Caracter Personal al Republicii Moldova.",
        },
        {
          type: "paragraph",
          text: "Puteti avea dreptul sa contactati autoritatea daca considerati ca drepturile dvs. privind datele personale au fost incalcate.",
        },
      ],
    },
    {
      title: "14. Confidentialitatea copiilor",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora este destinat utilizarii in business si nu este adresat copiilor.",
        },
        {
          type: "paragraph",
          text: "Nu colectam cu buna stiinta date personale de la copii. Daca credeti ca un copil ne-a furnizat date personale, contactati-ne pentru a lua masuri adecvate.",
        },
      ],
    },
    {
      title: "15. Comunicari de marketing",
      blocks: [
        {
          type: "paragraph",
          text: "Putem trimite mesaje legate de serviciu, necesare pentru cont, securitate, produs, facturare sau scopuri operationale.",
        },
        {
          type: "paragraph",
          text: "Comunicările de marketing, atunci cand sunt folosite, ar trebui sa se bazeze pe consimtamant sau pe alt temei legal. Puteti renunta la comunicarile de marketing in orice moment.",
        },
      ],
    },
    {
      title: "16. Modificari ale acestei Politici",
      blocks: [
        {
          type: "paragraph",
          text: "Putem actualiza aceasta Politica de confidentialitate din cand in cand.",
        },
        {
          type: "paragraph",
          text: 'Daca modificarile sunt materiale, vom lua masuri rezonabile pentru a notifica utilizatorii, cum ar fi actualizarea datei "Ultima actualizare", afisarea unei notificari sau trimiterea unui mesaj unde este potrivit.',
        },
        {
          type: "paragraph",
          text: "Continuarea utilizarii serviciului dupa intrarea in vigoare a Politicii actualizate inseamna ca luati cunostinta de politica actualizata.",
        },
      ],
    },
    {
      title: "17. Contact",
      blocks: [
        { type: "paragraph", text: "Pentru intrebari sau solicitari privind confidentialitatea:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Email", value: "nevorahq@gmail.com" },
            { label: "Adresa inregistrata", value: "[NEVORA SRL registered address]" },
            { label: "Numar de inregistrare / IDNO", value: "[NEVORA SRL registration number]" },
          ],
        },
      ],
    },
  ],
};

const privacyRu: LegalDocument = {
  title: "Политика конфиденциальности",
  lastUpdatedLabel: "Последнее обновление",
  lastUpdated: "9 июля 2026 г.",
  intro: [
    {
      type: "paragraph",
      text: 'Настоящая Политика конфиденциальности объясняет, как NEVORA SRL ("Nevora", "мы", "нас" или "наш") собирает, использует, хранит, передает и защищает персональные данные при использовании Nevora Business OS, нашего website, private beta и связанных сервисов.',
    },
    { type: "paragraph", text: "Настоящая Политика конфиденциальности применяется к:" },
    {
      type: "bullets",
      items: [
        "посетителям нашего website;",
        "пользователям, запрашивающим early access;",
        "владельцам аккаунтов;",
        "участникам, приглашенным в организации или workspace;",
        "клиентам и trial users;",
        "лицам, которые связываются с нами по вопросам поддержки, feedback или business communication.",
      ],
    },
  ],
  sections: [
    {
      title: "1. Кто мы",
      blocks: [
        { type: "paragraph", text: "Сервисом управляет:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Юридический адрес", value: "[NEVORA SRL registered address]" },
            { label: "Регистрационный номер / IDNO", value: "[NEVORA SRL registration number]" },
            { label: "Email", value: "nevorahq@gmail.com" },
          ],
        },
        { type: "paragraph", text: "По вопросам, связанным с privacy, обращайтесь:" },
        { type: "contact", lines: [{ label: "Email", value: "nevorahq@gmail.com" }] },
        {
          type: "paragraph",
          text: "Если в будущем будет назначен Data Protection Officer, эта Политика конфиденциальности должна быть обновлена контактными данными DPO.",
        },
      ],
    },
    {
      title: "2. Наша роль",
      blocks: [
        { type: "paragraph", text: "В зависимости от контекста Nevora может выступать как:" },
        { type: "subheading", title: "Controller" },
        {
          type: "paragraph",
          text: "Мы выступаем controller для персональных данных, которые обрабатываем для собственных целей, таких как:",
        },
        {
          type: "bullets",
          items: [
            "регистрация аккаунта;",
            "аутентификация;",
            "billing administration;",
            "customer support;",
            "website analytics;",
            "security logs;",
            "product communications;",
            "private beta management.",
          ],
        },
        { type: "subheading", title: "Processor" },
        {
          type: "paragraph",
          text: "Мы можем выступать processor для Customer Content, который пользователи загружают или создают внутри Nevora, например:",
        },
        {
          type: "bullets",
          items: [
            "business documents;",
            "task records;",
            "project records;",
            "money records;",
            "subscription records;",
            "workspace comments;",
            "files and metadata;",
            "данные о собственных сотрудниках, клиентах, поставщиках или подрядчиках клиента.",
          ],
        },
        {
          type: "paragraph",
          text: "В таком случае организация, использующая Nevora, отвечает за наличие законного основания для обработки этих данных.",
        },
      ],
    },
    {
      title: "3. Какие персональные данные мы собираем",
      blocks: [
        { type: "paragraph", text: "Мы можем собирать следующие категории персональных данных." },
        { type: "subheading", title: "Account and identity data" },
        {
          type: "bullets",
          items: [
            "имя;",
            "email address;",
            "password authentication data или authentication provider ID;",
            "membership в organization/workspace;",
            "role and permissions;",
            "language or interface preferences.",
          ],
        },
        { type: "subheading", title: "Contact and communication data" },
        {
          type: "bullets",
          items: [
            "сообщения, которые вы отправляете нам;",
            "feedback;",
            "support requests;",
            "Telegram, email или social media contact data, если вы связываетесь с нами через эти каналы.",
          ],
        },
        { type: "subheading", title: "Workspace and Customer Content" },
        { type: "paragraph", text: "В зависимости от использования продукта это может включать:" },
        {
          type: "bullets",
          items: [
            "tasks and project data;",
            "documents and files;",
            "document text, extracted or processed by the system;",
            "money records entered by users;",
            "subscription records;",
            "operational notes;",
            "business metadata;",
            "relation links between entities;",
            "activity and audit history.",
          ],
        },
        { type: "paragraph", text: "Вы контролируете, какой Customer Content вы загружаете или создаете." },
        { type: "subheading", title: "Billing and payment data" },
        {
          type: "paragraph",
          text: "Если платные тарифы включены, billing может обрабатываться Paddle или другим авторизованным payment provider.",
        },
        { type: "paragraph", text: "Мы можем получать ограниченную billing information, такую как:" },
        {
          type: "bullets",
          items: [
            "customer name;",
            "email;",
            "billing country;",
            "plan purchased;",
            "subscription status;",
            "transaction status;",
            "invoice or receipt reference;",
            "tax-related information, made available by the payment provider.",
          ],
        },
        { type: "paragraph", text: "Мы намеренно не храним полные номера карт в Nevora." },
        { type: "subheading", title: "Usage and technical data" },
        {
          type: "bullets",
          items: [
            "IP address;",
            "browser type;",
            "device information;",
            "pages viewed;",
            "login timestamps;",
            "activity logs;",
            "error logs;",
            "security events;",
            "API usage;",
            "feature usage;",
            "storage and usage counters.",
          ],
        },
        { type: "subheading", title: "Cookies and similar technologies" },
        { type: "paragraph", text: "Мы можем использовать cookies и similar technologies для:" },
        {
          type: "bullets",
          items: [
            "essential website and authentication functionality;",
            "security;",
            "session management;",
            "preferences;",
            "analytics;",
            "product improvement.",
          ],
        },
        {
          type: "paragraph",
          text: "Там, где это требуется законом, non-essential cookies должны использоваться только с согласием.",
        },
      ],
    },
    {
      title: "4. Как мы используем персональные данные",
      blocks: [
        { type: "paragraph", text: "Мы используем персональные данные, чтобы:" },
        {
          type: "bullets",
          items: [
            "предоставлять и эксплуатировать Nevora;",
            "создавать и управлять аккаунтами;",
            "управлять organizations, members, roles and permissions;",
            "хранить и отображать Customer Content;",
            "обрабатывать documents and user-confirmed workflows;",
            "предоставлять AI-assisted suggestions, если они включены;",
            "управлять trials, plans, limits and billing;",
            "предоставлять support;",
            "отправлять service messages;",
            "улучшать надежность и удобство продукта;",
            "защищать от abuse, fraud, unauthorized access and security incidents;",
            "соблюдать legal obligations;",
            "обеспечивать выполнение Terms of Service.",
          ],
        },
      ],
    },
    {
      title: "5. Legal bases for processing",
      blocks: [
        {
          type: "paragraph",
          text: "В зависимости от контекста и применимого законодательства мы опираемся на одно или несколько следующих legal bases:",
        },
        { type: "subheading", title: "Contract" },
        {
          type: "paragraph",
          text: "Мы обрабатываем данные, чтобы предоставить запрошенный сервис, управлять вашим аккаунтом, предоставлять workspace functionality и администрировать subscription или trial.",
        },
        { type: "subheading", title: "Legitimate interests" },
        {
          type: "paragraph",
          text: "Мы обрабатываем данные для security, fraud prevention, service improvement, internal analytics, support, product development и business communication, если эти интересы не перевешиваются вашими правами.",
        },
        { type: "subheading", title: "Consent" },
        {
          type: "paragraph",
          text: "Мы можем полагаться на consent для optional marketing communications, non-essential cookies или некоторых optional data processing activities.",
        },
        { type: "subheading", title: "Legal obligation" },
        {
          type: "paragraph",
          text: "Мы можем обрабатывать данные, если это требуется для tax, accounting, regulatory, dispute resolution или legal compliance purposes.",
        },
      ],
    },
    {
      title: "6. AI-assisted processing",
      blocks: [
        { type: "paragraph", text: "Nevora может использовать AI-assisted features для помощи с:" },
        {
          type: "bullets",
          items: [
            "document extraction;",
            "classification;",
            "summaries;",
            "recommendations;",
            "suggested actions;",
            "operational context.",
          ],
        },
        {
          type: "paragraph",
          text: "AI-assisted outputs доступны для проверки и должны подтверждаться пользователями до использования.",
        },
        {
          type: "paragraph",
          text: "Мы не используем AI для автоматической публикации финансовых транзакций или принятия финальных бизнес-решений без подтверждения пользователя.",
        },
        {
          type: "paragraph",
          text: "В зависимости от конфигурации Customer Content может обрабатываться third-party AI providers, выступающими subprocessors. Активные AI providers должны быть задокументированы в списке subprocessors.",
        },
      ],
    },
    {
      title: "7. Платежи через Paddle",
      blocks: [
        {
          type: "paragraph",
          text: "Если Paddle используется для платных тарифов после private beta или trial access, Paddle может выступать Merchant of Record или authorised reseller для payment processing, checkout, receipts, taxes, invoicing, cancellation tools, refund processing, fraud prevention и buyer support.",
        },
        {
          type: "paragraph",
          text: "Paddle может собирать и обрабатывать buyer data, такие как name, email, location, billing details, payment information, purchase details и tax information.",
        },
        {
          type: "paragraph",
          text: "Paddle может передавать Nevora ограниченные buyer and subscription data, чтобы мы могли предоставить доступ к купленному сервису, управлять subscriptions, предоставлять support и предотвращать fraud.",
        },
        {
          type: "paragraph",
          text: "Billing, refund, cancellation, chargeback и subscription-status events используются для SaaS access, billing state, entitlements, limits, support и account administration. Они не создают, не обновляют и не удаляют Money transactions внутри workspace автоматически.",
        },
        {
          type: "paragraph",
          text: "Обработка Paddle также регулируется собственными legal terms and privacy documents Paddle.",
        },
      ],
    },
    {
      title: "8. Передача персональных данных",
      blocks: [
        { type: "paragraph", text: "Мы можем передавать персональные данные:" },
        {
          type: "bullets",
          items: [
            "hosting and infrastructure providers;",
            "database and storage providers;",
            "authentication providers;",
            "email and communication providers;",
            "analytics providers;",
            "AI providers, where enabled;",
            "payment providers such as Paddle;",
            "professional advisors;",
            "authorities, courts, or regulators where required by law;",
            "successors in the event of merger, acquisition, restructuring, or sale of assets.",
          ],
        },
        { type: "paragraph", text: "Мы не продаем персональные данные." },
      ],
    },
    {
      title: "9. Международные передачи",
      blocks: [
        {
          type: "paragraph",
          text: "Некоторые service providers могут обрабатывать данные за пределами Республики Молдова, Европейской экономической зоны или вашей страны проживания.",
        },
        {
          type: "paragraph",
          text: "Там, где это требуется, мы используем appropriate safeguards, такие как contractual protections, data processing agreements, standard contractual clauses или equivalent mechanisms.",
        },
      ],
    },
    {
      title: "10. Хранение данных",
      blocks: [
        {
          type: "paragraph",
          text: "Мы храним персональные данные только столько, сколько необходимо для целей, описанных в настоящей Политике конфиденциальности.",
        },
        { type: "paragraph", text: "Типичные принципы retention:" },
        {
          type: "bullets",
          items: [
            "account data хранится, пока аккаунт активен;",
            "workspace data хранится, пока организация использует сервис;",
            "billing records могут храниться в соответствии с tax, accounting and legal obligations;",
            "security logs могут храниться ограниченный период для fraud prevention и incident investigation;",
            "support messages могут храниться по мере необходимости для обработки запросов и улучшения сервиса.",
          ],
        },
        {
          type: "paragraph",
          text: "Когда данные больше не нужны, мы удаляем, анонимизируем или безопасно архивируем их, если закон не требует сохранять их.",
        },
      ],
    },
    {
      title: "11. Безопасность",
      blocks: [
        {
          type: "paragraph",
          text: "Мы используем technical and organizational measures, designed to protect personal data, including:",
        },
        {
          type: "bullets",
          items: [
            "access controls;",
            "authentication;",
            "role-based permissions;",
            "tenant isolation;",
            "database security controls;",
            "encrypted transport where applicable;",
            "audit and security logs;",
            "operational monitoring;",
            "restricted access to production systems.",
          ],
        },
        {
          type: "paragraph",
          text: "Ни одна система не является идеально безопасной. Вы отвечаете за сохранение конфиденциальности учетных данных и управление доступом внутри вашей организации.",
        },
      ],
    },
    {
      title: "12. Ваши права",
      blocks: [
        { type: "paragraph", text: "В зависимости от применимого законодательства вы можете иметь право:" },
        {
          type: "bullets",
          items: [
            "запросить доступ к вашим персональным данным;",
            "запросить исправление неточных данных;",
            "запросить удаление ваших данных;",
            "запросить ограничение обработки;",
            "возразить против определенной обработки;",
            "отозвать consent, если обработка основана на consent;",
            "запросить data portability;",
            "подать жалобу в компетентный орган по защите данных.",
          ],
        },
        { type: "paragraph", text: "Чтобы реализовать свои права, свяжитесь с нами:" },
        { type: "contact", lines: [{ label: "Email", value: "nevorahq@gmail.com" }] },
        { type: "paragraph", text: "Нам может потребоваться подтвердить вашу личность перед ответом." },
        {
          type: "paragraph",
          text: "Если ваш запрос касается Customer Content, контролируемого организацией, использующей Nevora, мы можем направить запрос этой организации.",
        },
      ],
    },
    {
      title: "13. Орган по защите данных",
      blocks: [
        {
          type: "paragraph",
          text: "Для пользователей в Республике Молдова компетентным органом является Национальный центр по защите персональных данных Республики Молдова.",
        },
        {
          type: "paragraph",
          text: "Вы можете иметь право обратиться в орган, если считаете, что ваши права на персональные данные были нарушены.",
        },
      ],
    },
    {
      title: "14. Children's Privacy",
      blocks: [
        { type: "paragraph", text: "Nevora предназначена для business use и не адресована детям." },
        {
          type: "paragraph",
          text: "Мы сознательно не собираем персональные данные детей. Если вы считаете, что ребенок предоставил нам персональные данные, свяжитесь с нами, чтобы мы приняли соответствующие меры.",
        },
      ],
    },
    {
      title: "15. Marketing Communications",
      blocks: [
        {
          type: "paragraph",
          text: "Мы можем отправлять service-related messages, необходимые для account, security, product, billing или operational purposes.",
        },
        {
          type: "paragraph",
          text: "Marketing communications, если используются, должны основываться на consent или другом lawful basis. Вы можете отказаться от marketing communications в любое время.",
        },
      ],
    },
    {
      title: "16. Изменения Политики конфиденциальности",
      blocks: [
        { type: "paragraph", text: "Мы можем периодически обновлять настоящую Политику конфиденциальности." },
        {
          type: "paragraph",
          text: "Если изменения существенные, мы предпримем разумные меры для уведомления пользователей, например обновим дату последнего обновления, разместим уведомление или отправим сообщение, где это уместно.",
        },
        {
          type: "paragraph",
          text: "Продолжение использования сервиса после вступления обновленной Политики конфиденциальности в силу означает, что вы ознакомились с обновленной политикой.",
        },
      ],
    },
    {
      title: "17. Контакты",
      blocks: [
        { type: "paragraph", text: "По вопросам или запросам, связанным с privacy:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Email", value: "nevorahq@gmail.com" },
            { label: "Юридический адрес", value: "[NEVORA SRL registered address]" },
            { label: "Регистрационный номер / IDNO", value: "[NEVORA SRL registration number]" },
          ],
        },
      ],
    },
  ],
};

export const legalDocuments = {
  terms: {
    en: termsEn,
    ro: termsRo,
    ru: termsRu,
  },
  privacy: {
    en: privacyEn,
    ro: privacyRo,
    ru: privacyRu,
  },
  refunds: refundsLegalDocuments,
} satisfies Record<LegalPage, Record<LegalLocale, LegalDocument>>;
