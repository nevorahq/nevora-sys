import { z } from "zod";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

type AuthErrors = Dictionary["auth"]["errors"];

export function getAuthSchemas(e: AuthErrors) {
  const loginSchema = z.object({
    email: z
      .string()
      .min(1, e.emailRequired)
      .check(z.email({ error: e.emailInvalid })),
    password: z
      .string()
      .min(1, e.passwordRequired)
      .min(6, e.passwordMin),
  });

  const registerSchema = z
    .object({
      displayName: z
        .string()
        .min(1, e.nameRequired)
        .max(50, e.nameMax),
      email: z
        .string()
        .min(1, e.emailRequired)
        .check(z.email({ error: e.emailInvalid })),
      password: z
        .string()
        .min(1, e.passwordRequired)
        .min(6, e.passwordMin),
      confirmPassword: z
        .string()
        .min(1, e.confirmPasswordRequired),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: e.passwordsMismatch,
      path: ["confirmPassword"],
    });

  return { loginSchema, registerSchema };
}

export type LoginData = z.infer<ReturnType<typeof getAuthSchemas>["loginSchema"]>;
export type RegisterData = z.infer<ReturnType<typeof getAuthSchemas>["registerSchema"]>;
