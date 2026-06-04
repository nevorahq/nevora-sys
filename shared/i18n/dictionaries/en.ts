export const en = {
  common: {
    loading: "Loading…",
    appName: "TaskFlow",
  },
  nav: {
    logout: "Sign Out",
  },
  theme: {
    toggleLight: "Switch to light mode",
    toggleDark: "Switch to dark mode",
  },
  home: {
    subtitle: "Simple task planner",
    loginButton: "Sign In",
    registerButton: "Sign Up",
  },
  auth: {
    login: {
      title: "Welcome back",
      subtitle: "Enter your email and password",
      emailLabel: "Email",
      emailPlaceholder: "your@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "At least 6 characters",
      submitButton: "Sign In",
      noAccount: "Don't have an account?",
      registerLink: "Sign Up",
    },
    register: {
      title: "Create account",
      subtitle: "Join TaskFlow today",
      nameLabel: "Name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "your@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "At least 6 characters",
      confirmPasswordLabel: "Confirm Password",
      confirmPasswordPlaceholder: "Repeat password",
      submitButton: "Create Account",
      hasAccount: "Already have an account?",
      loginLink: "Sign In",
    },
    errors: {
      invalidCredentials: "Invalid email or password",
      serverError: "Something went wrong. Please try again.",
      emailRequired: "Email is required",
      emailInvalid: "Invalid email format",
      passwordRequired: "Password is required",
      passwordMin: "At least 6 characters",
      nameRequired: "Name is required",
      nameMax: "Maximum 50 characters",
      confirmPasswordRequired: "Please confirm your password",
      passwordsMismatch: "Passwords do not match",
    },
  },
  dashboard: {
    title: "My Tasks",
    placeholder: "Tasks coming soon — Phase 4-5",
  },
} as const;

/* Recursively widens all leaf values to `string` so other locales
   can assign any string while still being structurally checked. */
type DeepString<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown> ? DeepString<T[K]> : string;
};

export type Dictionary = DeepString<typeof en>;
