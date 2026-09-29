import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const productPlatformRestrictedPaths = [
  {
    name: "@/lib/security",
    message: "Product code must use @/platform/access/server.",
  },
  {
    name: "@/modules/billing",
    message: "Product code must use @/platform/access/server.",
  },
  {
    name: "@/modules/billing/components/access-state",
    message: "Product UI must use @/platform/access/ui.",
  },
];

const moneyTableRestrictions = [
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='from'][arguments.0.value='money_transactions']",
    message: "Ledger access belongs to Money; read it through @/platform/finance/server.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='from'][arguments.0.value='money_accounts']",
    message: "Money-account access belongs to Money; read it through @/platform/finance/server.",
  },
];

const taskTableRestrictions = [
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='from'][arguments.0.value='todos']",
    message: "Task storage belongs to Tasks; use @/platform/task-lifecycle/server.",
  },
];

const subscriptionTableRestrictions = [
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='from'][arguments.0.value='subscriptions']",
    message: "Subscription storage belongs to Subscriptions or a platform read-port.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='from'][arguments.0.value='subscription_payment_cycles']",
    message: "Payment-cycle storage belongs to Subscriptions; use @/platform/subscriptions/server.",
  },
];

// Both RPCs were dropped by migration 115 (Financial Tasks and the obligation
// bridge are gone). The selectors are kept on purpose: a call revived from an
// old branch or a stale doc would only fail at runtime, so lint names it first.
const paymentRpcRestrictions = [
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='rpc'][arguments.0.value='mark_financial_task_paid']",
    message: "mark_financial_task_paid was dropped by migration 115 with Financial Tasks; there is no replacement.",
  },
  {
    selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='rpc'][arguments.0.value='mark_subscription_payment_paid']",
    message: "mark_subscription_payment_paid was dropped by migration 115; mark a cycle paid in Subscriptions (markSubscriptionPaymentAsPaid), which posts nothing to Money.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    "**/.netlify/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Honor the `_`-prefix convention for intentionally unused symbols
  // (e.g. required-but-unused React action-state params). The rule stays
  // active — this is the documented opt-out marker, not a disable.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Product boundaries: callers use explicit public entrypoints instead of
  // coupling themselves to another product's internal file layout. A module's
  // own files keep local deep imports so this rule does not force noisy
  // self-imports through a barrel.
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["modules/tasks/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/modules/tasks/contracts",
              message: "Use the extractable @nevora/tasks-contracts workspace package.",
            },
            {
              name: "@/platform/financial-state/contracts",
              message: "Use @nevora/financial-state/contracts.",
            },
            {
              name: "@/platform/financial-state/ui",
              message: "Use @nevora/financial-state/ui.",
            },
          ],
          patterns: [
            {
              regex: "^@/modules/tasks(?:$|/(?!contracts$|server$|actions$|ui$).+)",
              message: "Use @nevora/tasks-contracts or the Tasks /server, /actions, or /ui entrypoint.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["modules/moneyflow/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/modules/moneyflow/contracts",
              message: "Use the extractable @nevora/finance-contracts workspace package.",
            },
          ],
          patterns: [
            {
              regex: "^@/modules/moneyflow(?:$|/(?!contracts$|server$|actions$|ui$).+)",
              message: "Use @/modules/moneyflow/contracts, /server, /actions, or /ui.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["modules/subtracker/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/modules/subtracker/contracts",
              message: "Use the extractable @nevora/subscriptions-contracts workspace package.",
            },
          ],
          patterns: [
            {
              regex: "^@/modules/subtracker(?:$|/(?!contracts$|server$|actions$|ui$).+)",
              message: "Use @/modules/subtracker/contracts, /server, /actions, or /ui.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "modules/tasks/**/*.{ts,tsx}",
      "modules/moneyflow/**/*.{ts,tsx}",
      "modules/subtracker/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: productPlatformRestrictedPaths,
        },
      ],
    },
  },
  // The three independently extractable products never import each other.
  // Cross-product reads and actions go through the ports in `platform/`, which
  // also holds the shared vocabulary.
  {
    files: ["modules/tasks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: productPlatformRestrictedPaths,
          patterns: [
            {
              regex: "^@/modules/(?:moneyflow|subtracker)(?:$|/)",
              message: "Tasks must not import Money/Subscriptions; go through their @/platform ports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["modules/moneyflow/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: productPlatformRestrictedPaths,
          patterns: [
            {
              regex: "^@/modules/(?:tasks|subtracker)(?:$|/)",
              message: "Money must not import Tasks/Subscriptions; go through their @/platform ports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["modules/subtracker/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: productPlatformRestrictedPaths,
          patterns: [
            {
              regex: "^@/modules/(?:tasks|moneyflow)(?:$|/)",
              message: "Subscriptions must not import Tasks/Money; go through their @/platform ports.",
            },
          ],
        },
      ],
    },
  },
  // Workspace code must compile without reaching back into the root Next.js
  // application. The Tasks runtime may own Supabase, but not root aliases or
  // framework APIs.
  {
    files: [
      "packages/**/*.{ts,tsx,mts}",
      "apps/tasks/src/**/*.{ts,tsx,mts}",
      "apps/subscriptions/src/**/*.{ts,tsx,mts}",
      "apps/finance/src/**/*.{ts,tsx,mts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/",
              message: "Workspace code cannot import the root application's @/ alias.",
            },
            {
              regex: "^next(?:$|/)",
              message: "The current extraction boundary must remain framework-neutral.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/financial-state/**/*.{ts,tsx,mts}",
      "packages/finance-contracts/**/*.{ts,tsx,mts}",
      "packages/finance-api/**/*.{ts,tsx,mts}",
      "packages/subscriptions-contracts/**/*.{ts,tsx,mts}",
      "packages/subscriptions-api/**/*.{ts,tsx,mts}",
      "packages/tasks-api/**/*.{ts,tsx,mts}",
      "packages/tasks-contracts/**/*.{ts,tsx,mts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@supabase(?:$|/)",
              message: "Portable contracts and ports cannot depend on Supabase.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/tasks/app/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/",
              message: "The Tasks deployment cannot import the root application's @/ alias.",
            },
            {
              regex: "^@supabase(?:$|/)",
              message: "Keep database infrastructure in apps/tasks/src, outside Route Handlers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/subscriptions/app/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/",
              message: "The Subscriptions deployment cannot import the root application's @/ alias.",
            },
            {
              regex: "^@supabase(?:$|/)",
              message: "Keep database infrastructure in apps/subscriptions/src, outside Route Handlers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/finance/app/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/",
              message: "The Finance deployment cannot import the root application's @/ alias.",
            },
            {
              regex: "^@supabase(?:$|/)",
              message: "Keep database infrastructure in apps/finance/src, outside Route Handlers.",
            },
          ],
        },
      ],
    },
  },
  // Server ownership guard: each product may query only its own business tables.
  // Cross-product reads/mutations go through platform ports.
  {
    files: ["modules/tasks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...moneyTableRestrictions,
        ...subscriptionTableRestrictions,
        ...paymentRpcRestrictions,
      ],
    },
  },
  {
    files: ["modules/moneyflow/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...taskTableRestrictions,
        ...subscriptionTableRestrictions,
        ...paymentRpcRestrictions,
      ],
    },
  },
  {
    files: ["modules/subtracker/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...moneyTableRestrictions,
        ...taskTableRestrictions,
        ...paymentRpcRestrictions,
      ],
    },
  },
]);

export default eslintConfig;
