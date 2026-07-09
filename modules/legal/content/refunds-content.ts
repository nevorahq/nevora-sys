import type { LegalDocument, LegalLocale } from "./legal-content";

const refundsEn: LegalDocument = {
  title: "Refund Policy",
  lastUpdatedLabel: "Last updated",
  lastUpdated: "July 9, 2026",
  intro: [
    {
      type: "paragraph",
      text: 'This Refund Policy explains how refunds, cancellations, trials, and subscription access are handled for Nevora Business OS, a software-as-a-service product operated by NEVORA SRL ("Nevora", "we", "us", or "our").',
    },
    {
      type: "paragraph",
      text: "This policy applies to purchases, subscriptions, trials, and paid access to Nevora Business OS.",
    },
    {
      type: "paragraph",
      text: "If you purchased Nevora through Paddle, Paddle may act as the Merchant of Record or authorised reseller for your transaction. In that case, payment processing, receipts, tax handling, cancellation tools, and refund processing may be handled by Paddle according to Paddle's buyer terms and refund policy.",
    },
    {
      type: "paragraph",
      text: "Nothing in this policy limits any mandatory consumer rights that apply under your local law.",
    },
  ],
  sections: [
    {
      title: "1. Private Beta and Trial Access",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora may be offered as a private beta, early access product, or free trial.",
        },
        {
          type: "paragraph",
          text: "If you are using Nevora during a free trial or unpaid private beta, you are not charged for that access unless you explicitly choose a paid plan or complete a paid checkout.",
        },
        {
          type: "paragraph",
          text: "A trial is designed to help you evaluate whether Nevora fits your workflow before upgrading.",
        },
        { type: "paragraph", text: "Trial access may include limits such as:" },
        {
          type: "bullets",
          items: [
            "limited storage;",
            "limited users;",
            "limited workspaces;",
            "limited documents;",
            "limited AI usage;",
            "limited financial records;",
            "private beta features.",
          ],
        },
        {
          type: "paragraph",
          text: "If your trial ends and you do not upgrade, your access may be limited, paused, downgraded, or disabled according to the product rules shown in the app.",
        },
      ],
    },
    {
      title: "2. Subscription Plans",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora paid plans are subscription-based SaaS access plans.",
        },
        {
          type: "paragraph",
          text: "A paid subscription may include access to features, limits, storage, AI-assisted workflows, team members, developer access, or other plan-based functionality.",
        },
        {
          type: "paragraph",
          text: "Your subscription renews automatically unless cancelled before renewal.",
        },
        {
          type: "paragraph",
          text: "Plan details, prices, included limits, and billing periods are shown on the pricing page, in checkout, or inside the billing area of the product.",
        },
      ],
    },
    {
      title: "3. Cancellations",
      blocks: [
        { type: "paragraph", text: "You may cancel your subscription at any time." },
        {
          type: "paragraph",
          text: "If your subscription is billed through Paddle, you can usually cancel through:",
        },
        {
          type: "bullets",
          items: [
            'the "Manage subscription" or "View receipt" link in your Paddle confirmation email;',
            "the billing area inside Nevora, if available;",
            "Paddle buyer support.",
          ],
        },
        {
          type: "paragraph",
          text: "Cancellation normally takes effect at the end of the current billing period.",
        },
        { type: "paragraph", text: "After cancellation:" },
        {
          type: "bullets",
          items: [
            "you should not be charged again for the cancelled subscription;",
            "you may keep access until the end of the paid billing period, unless otherwise stated or required by Paddle or applicable law;",
            "your workspace may be downgraded, limited, or disabled after the billing period ends;",
            "some paid features may become unavailable.",
          ],
        },
        {
          type: "paragraph",
          text: "Cancelling a subscription does not automatically create a refund for the current or previous billing period.",
        },
      ],
    },
    {
      title: "4. Refund Requests",
      blocks: [
        {
          type: "paragraph",
          text: "Refunds are generally reviewed on a case-by-case basis.",
        },
        {
          type: "paragraph",
          text: "If your purchase was processed by Paddle, refund requests should be submitted through Paddle using:",
        },
        {
          type: "bullets",
          items: [
            "the receipt or subscription management link in your Paddle email;",
            "the support link shown in your Paddle receipt;",
            "the billing page inside Nevora, if it links to Paddle support;",
            "Paddle buyer support.",
          ],
        },
        {
          type: "paragraph",
          text: "Nevora may assist with support context, but Paddle may be responsible for processing the refund where Paddle is the Merchant of Record or authorised reseller.",
        },
        { type: "paragraph", text: "Refund eligibility may depend on:" },
        {
          type: "bullets",
          items: [
            "applicable law;",
            "the date of the transaction;",
            "the type of subscription or purchase;",
            "whether the product was accessed or used;",
            "the reason for the request;",
            "evidence of a technical or product defect;",
            "fraud, abuse, or chargeback risk;",
            "Paddle's buyer terms and refund policy.",
          ],
        },
        {
          type: "paragraph",
          text: "Submitting a refund request does not guarantee that a refund will be approved.",
        },
      ],
    },
    {
      title: "5. 14-Day Review Window",
      blocks: [
        {
          type: "paragraph",
          text: "For many digital subscriptions, a refund or withdrawal request may need to be submitted within a specific statutory or discretionary period.",
        },
        {
          type: "paragraph",
          text: "Where Paddle processes the purchase, Paddle may consider discretionary refund requests submitted within 14 days of the transaction date. Paddle may approve a full refund, approve a partial refund, or decline the request depending on the circumstances and applicable rules.",
        },
        {
          type: "paragraph",
          text: "Some countries or regions may provide mandatory withdrawal rights or consumer protection rules. Those rights apply where required by law.",
        },
      ],
    },
    {
      title: "6. Technical Issues or Product Defects",
      blocks: [
        {
          type: "paragraph",
          text: "If you experience a persistent technical issue that prevents you from accessing the Nevora features included in your plan, please contact us first so we can try to resolve the issue.",
        },
        { type: "paragraph", text: "Contact:" },
        {
          type: "contact",
          lines: [{ label: "Email", value: "nevorahq@gmail.com" }],
        },
        { type: "paragraph", text: "Please include:" },
        {
          type: "bullets",
          items: [
            "your account email;",
            "organization/workspace name;",
            "plan name;",
            "payment or Paddle receipt reference, if available;",
            "description of the issue;",
            "screenshots or error messages, if relevant;",
            "steps to reproduce the problem.",
          ],
        },
        {
          type: "paragraph",
          text: "If the issue cannot be resolved and there is evidence of a material defect, a refund may be considered according to applicable law and Paddle's refund process.",
        },
      ],
    },
    {
      title: "7. Non-Refundable Situations",
      blocks: [
        {
          type: "paragraph",
          text: "Unless required by law or approved by Paddle, refunds are generally not provided for:",
        },
        {
          type: "bullets",
          items: [
            "unused time in an active billing period after cancellation;",
            "failure to cancel before renewal;",
            "partial use of a billing period;",
            "lack of use after purchase;",
            "change of mind after extensive product use;",
            "violation of Nevora's Terms of Service;",
            "account suspension due to abuse, fraud, security risk, or prohibited use;",
            "requests involving refund abuse or manipulative behaviour;",
            "business decisions made using exported or user-entered data.",
          ],
        },
        {
          type: "paragraph",
          text: "This does not limit mandatory rights under applicable consumer protection laws.",
        },
      ],
    },
    {
      title: "8. Refund Effect on Product Access",
      blocks: [
        {
          type: "paragraph",
          text: "If a refund is approved, access to the refunded product, plan, or subscription may end.",
        },
        { type: "paragraph", text: "This may result in:" },
        {
          type: "bullets",
          items: [
            "downgrade to a free or trial state;",
            "loss of access to paid features;",
            "reduced storage or usage limits;",
            "disabled AI-assisted workflows;",
            "disabled developer access;",
            "restricted team/member features;",
            "read-only or limited workspace state.",
          ],
        },
        {
          type: "paragraph",
          text: "You are responsible for exporting or saving any information you need before cancellation, downgrade, or account closure, where export functionality is available.",
        },
      ],
    },
    {
      title: "9. Billing Events and Money Records",
      blocks: [
        {
          type: "paragraph",
          text: "Nevora's billing system is separate from the Money module inside the product.",
        },
        {
          type: "paragraph",
          text: "A Paddle payment, refund, chargeback, cancellation, or subscription event does not automatically create, update, or delete a Money transaction in your workspace.",
        },
        {
          type: "paragraph",
          text: "Refund or cancellation changes only SaaS access, billing state, entitlements, limits, support, and account administration. It does not create, update, delete, mark paid, or otherwise mutate Money transactions inside your workspace.",
        },
        {
          type: "paragraph",
          text: "Money records inside Nevora are operational records created, imported, or confirmed by users. Billing provider events are used only for subscription access, plan status, entitlements, limits, and account administration.",
        },
      ],
    },
    {
      title: "10. Chargebacks and Payment Disputes",
      blocks: [
        {
          type: "paragraph",
          text: "If you believe a charge was made in error, please contact Paddle or Nevora before opening a chargeback or payment dispute with your bank or card provider.",
        },
        {
          type: "paragraph",
          text: "Opening a chargeback or payment dispute may temporarily suspend access to the relevant subscription while the matter is reviewed.",
        },
        {
          type: "paragraph",
          text: "This does not limit any lawful rights you may have under card scheme rules, payment provider rules, or applicable consumer law.",
        },
      ],
    },
    {
      title: "11. Taxes",
      blocks: [
        {
          type: "paragraph",
          text: "If your purchase includes VAT, GST, sales tax, or similar taxes, tax handling may be managed by Paddle where Paddle is the Merchant of Record.",
        },
        {
          type: "paragraph",
          text: "Business customers that were charged tax but are tax-exempt may need to request a tax refund directly through Paddle and provide valid tax registration or exemption documentation where applicable.",
        },
      ],
    },
    {
      title: "12. How to Request Help",
      blocks: [
        { type: "paragraph", text: "For product-related issues, contact Nevora:" },
        {
          type: "contact",
          lines: [
            { label: "NEVORA SRL" },
            { label: "Email", value: "nevorahq@gmail.com" },
            { label: "Registered address", value: "[NEVORA SRL registered address]" },
            { label: "Registration number / IDNO", value: "[NEVORA SRL registration number]" },
          ],
        },
        {
          type: "paragraph",
          text: "For Paddle-processed payments, you may also use the Paddle receipt, subscription management link, or Paddle buyer support.",
        },
      ],
    },
    {
      title: "13. Changes to This Policy",
      blocks: [
        {
          type: "paragraph",
          text: "We may update this Refund Policy from time to time.",
        },
        {
          type: "paragraph",
          text: "The version in effect at the time of your transaction will generally apply to that transaction, unless applicable law requires otherwise.",
        },
        {
          type: "paragraph",
          text: 'If we make material changes, we may update the "Last updated" date or notify users through the product, website, or email.',
        },
      ],
    },
  ],
};

export const refundsLegalDocuments = {
  en: refundsEn,
  ro: refundsEn,
  ru: refundsEn,
} satisfies Record<LegalLocale, LegalDocument>;
