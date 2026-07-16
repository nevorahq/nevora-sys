import { z } from "zod";
import { normalizeLocalizedRate } from "../utils/rate-convention";

export function getExchangeRateSchema(errors: {
  currencyRequired: string;
  ratePositive: string;
  invalidDate: string;
}) {
  return z.object({
    quote_currency: z.string().trim()
      .regex(/^[A-Za-z]{3}$/, errors.currencyRequired)
      .transform((value) => value.toUpperCase()),
    rate: z.preprocess(
      (value) => typeof value === "string" ? normalizeLocalizedRate(value) : value,
      z.string().trim()
        .min(1, errors.ratePositive)
        .regex(/^\d+(?:\.\d{1,10})?$/, errors.ratePositive)
        .refine((value) => Number(value) > 0, errors.ratePositive),
    ),
    effective_date: z.string().date(errors.invalidDate),
    confirm_correction: z.enum(["yes", "no"]).default("no"),
    confirm_unusual: z.enum(["yes", "no"]).default("no"),
  });
}
