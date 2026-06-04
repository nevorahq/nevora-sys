"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions/login.action";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface LoginFormProps {
  dict: Dictionary;
}

export function LoginForm({ dict }: LoginFormProps) {
  const t = dict.auth.login;
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    loginAction,
    {},
  );

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
          autoComplete="current-password"
          error={state.fieldErrors?.password?.[0]}
        />

        <Button type="submit" className="mt-2 w-full" isLoading={isPending}>
          {isPending ? dict.common.loading : t.submitButton}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-text-secondary">
        {t.noAccount}{" "}
        <Link
          href={ROUTES.register}
          className="font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {t.registerLink}
        </Link>
      </p>
    </Card>
  );
}
