"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "../actions/register.action";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface RegisterFormProps {
  dict: Dictionary;
}

export function RegisterForm({ dict }: RegisterFormProps) {
  const t = dict.auth.register;
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    registerAction,
    {},
  );

  if (state.emailConfirmationRequired) {
    return (
      <Card className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-text-primary">
          {t.checkEmailTitle}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{t.checkEmailBody}</p>
        <Link
          href={ROUTES.login}
          className="mt-6 inline-block font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {t.loginLink}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">{t.title}</h1>
        <p className="mt-1.5 text-sm text-text-secondary">{t.subtitle}</p>
      </div>

      {state.error && (
        <div className="mb-4 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <Input
          id="displayName"
          name="displayName"
          type="text"
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          required
          autoComplete="name"
          error={state.fieldErrors?.displayName?.[0]}
        />

        <Input
          id="email"
          name="email"
          type="email"
          label={t.emailLabel}
          placeholder={t.emailPlaceholder}
          required
          autoComplete="email"
          error={state.fieldErrors?.email?.[0]}
        />

        <Input
          id="password"
          name="password"
          type="password"
          label={t.passwordLabel}
          placeholder={t.passwordPlaceholder}
          required
          autoComplete="new-password"
          error={state.fieldErrors?.password?.[0]}
        />

        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          label={t.confirmPasswordLabel}
          placeholder={t.confirmPasswordPlaceholder}
          required
          autoComplete="new-password"
          error={state.fieldErrors?.confirmPassword?.[0]}
        />

        <Button type="submit" className="mt-2 w-full" isLoading={isPending}>
          {isPending ? dict.common.loading : t.submitButton}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-text-secondary">
        {t.hasAccount}{" "}
        <Link
          href={ROUTES.login}
          className="font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {t.loginLink}
        </Link>
      </p>
    </Card>
  );
}
