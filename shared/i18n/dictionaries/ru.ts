import type { Dictionary } from "./en";

export const ru: Dictionary = {
  common: {
    loading: "Загрузка…",
    appName: "TaskFlow",
  },
  nav: {
    logout: "Выйти",
  },
  theme: {
    toggleLight: "Светлая тема",
    toggleDark: "Тёмная тема",
  },
  home: {
    subtitle: "Простой планировщик задач",
    loginButton: "Войти",
    registerButton: "Регистрация",
  },
  auth: {
    login: {
      title: "Вход в TaskFlow",
      subtitle: "Введите email и пароль",
      emailLabel: "Email",
      emailPlaceholder: "your@email.com",
      passwordLabel: "Пароль",
      passwordPlaceholder: "Минимум 6 символов",
      submitButton: "Войти",
      noAccount: "Нет аккаунта?",
      registerLink: "Зарегистрироваться",
    },
    register: {
      title: "Регистрация",
      subtitle: "Создайте аккаунт в TaskFlow",
      nameLabel: "Имя",
      namePlaceholder: "Как вас зовут?",
      emailLabel: "Email",
      emailPlaceholder: "your@email.com",
      passwordLabel: "Пароль",
      passwordPlaceholder: "Минимум 6 символов",
      confirmPasswordLabel: "Подтвердите пароль",
      confirmPasswordPlaceholder: "Повторите пароль",
      submitButton: "Зарегистрироваться",
      hasAccount: "Уже есть аккаунт?",
      loginLink: "Войти",
    },
    errors: {
      invalidCredentials: "Неверный email или пароль",
      serverError: "Произошла ошибка. Попробуйте позже.",
      emailRequired: "Email обязателен",
      emailInvalid: "Некорректный формат email",
      passwordRequired: "Пароль обязателен",
      passwordMin: "Минимум 6 символов",
      nameRequired: "Имя обязательно",
      nameMax: "Максимум 50 символов",
      confirmPasswordRequired: "Подтвердите пароль",
      passwordsMismatch: "Пароли не совпадают",
    },
  },
  dashboard: {
    title: "Мои задачи",
    placeholder: "Здесь будут задачи — Phase 4-5",
  },
};
