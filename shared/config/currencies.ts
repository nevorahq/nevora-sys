/**
 * Валюты организации (base_currency).
 *
 * Используется при онбординге: гео-определение страны → валюта по умолчанию,
 * которую пользователь может изменить. Базовая валюта — основа будущего
 * FX-слоя (exchange_rates + fn_get_exchange_rate), к ней приводятся
 * кросс-валютные агрегаты.
 *
 * ВАЖНО: список SUPPORTED_CURRENCIES должен совпадать с CHECK-констрейнтом
 * `organizations_base_currency_check` в миграции 049. Меняешь здесь — меняй там.
 */

/** Валюта при невозможности определить страну (локалка, нет гео-заголовка). */
export const DEFAULT_BASE_CURRENCY = "EUR" as const;

/** Поддерживаемые базовые валюты (ISO 4217). */
export const SUPPORTED_CURRENCIES = [
  "EUR", "USD", "GBP", "MDL", "RON", "UAH", "RUB", "PLN", "CZK", "HUF",
  "BGN", "SEK", "DKK", "NOK", "CHF", "TRY", "CAD", "AUD", "NZD", "JPY",
  "CNY", "INR", "BRL", "MXN", "ZAR", "AED", "ILS", "SGD", "HKD", "KRW",
  "GEL", "AMD", "AZN", "KZT", "RSD",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_CURRENCIES);

export function isSupportedCurrency(value: string): value is Currency {
  return SUPPORTED_SET.has(value);
}

/** Человекочитаемые названия для UI: «EUR — Euro». */
export const CURRENCY_NAMES: Record<Currency, string> = {
  EUR: "Euro",
  USD: "US Dollar",
  GBP: "British Pound",
  MDL: "Moldovan Leu",
  RON: "Romanian Leu",
  UAH: "Ukrainian Hryvnia",
  RUB: "Russian Ruble",
  PLN: "Polish Zloty",
  CZK: "Czech Koruna",
  HUF: "Hungarian Forint",
  BGN: "Bulgarian Lev",
  SEK: "Swedish Krona",
  DKK: "Danish Krone",
  NOK: "Norwegian Krone",
  CHF: "Swiss Franc",
  TRY: "Turkish Lira",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
  NZD: "New Zealand Dollar",
  JPY: "Japanese Yen",
  CNY: "Chinese Yuan",
  INR: "Indian Rupee",
  BRL: "Brazilian Real",
  MXN: "Mexican Peso",
  ZAR: "South African Rand",
  AED: "UAE Dirham",
  ILS: "Israeli Shekel",
  SGD: "Singapore Dollar",
  HKD: "Hong Kong Dollar",
  KRW: "South Korean Won",
  GEL: "Georgian Lari",
  AMD: "Armenian Dram",
  AZN: "Azerbaijani Manat",
  KZT: "Kazakhstani Tenge",
  RSD: "Serbian Dinar",
};

/**
 * Страна (ISO 3166-1 alpha-2) → валюта.
 *
 * Не 1:1: вся еврозона → EUR. Карта неполная — для неизвестной страны
 * возвращается DEFAULT_BASE_CURRENCY. Расширяй по мере необходимости.
 */
const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  // Eurozone + EUR-using
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR",
  FR: "EUR", DE: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR",
  LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR",
  SI: "EUR", ES: "EUR", AD: "EUR", MC: "EUR", ME: "EUR", SM: "EUR",
  VA: "EUR", XK: "EUR",
  // Rest of Europe
  GB: "GBP", MD: "MDL", RO: "RON", UA: "UAH", RU: "RUB", PL: "PLN",
  CZ: "CZK", HU: "HUF", BG: "BGN", SE: "SEK", DK: "DKK", NO: "NOK",
  CH: "CHF", LI: "CHF", TR: "TRY", RS: "RSD", GE: "GEL", AM: "AMD",
  AZ: "AZN", KZ: "KZT",
  // Americas
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL",
  // APAC
  AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", IN: "INR", SG: "SGD",
  HK: "HKD", KR: "KRW",
  // MEA
  ZA: "ZAR", AE: "AED", IL: "ILS",
};

/**
 * Валюта по коду страны. `null`/неизвестная страна → DEFAULT_BASE_CURRENCY.
 *
 * Это лишь ПОДСКАЗКА для предзаполнения формы — пользователь подтверждает
 * или меняет значение. Базовая валюта практически иммутабельна, поэтому
 * не фиксируется молча по IP.
 */
export function currencyForCountry(countryCode: string | null | undefined): Currency {
  if (!countryCode) return DEFAULT_BASE_CURRENCY;
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? DEFAULT_BASE_CURRENCY;
}
