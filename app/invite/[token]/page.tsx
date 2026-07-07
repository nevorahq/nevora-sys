import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getInviteInfo } from "@/modules/members/queries/get-invite-info";
import { AcceptInviteButton } from "@/features/members/components/accept-invite-button";
import { ROUTES } from "@/shared/config/routes";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const info = await getInviteInfo(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="soft-card-lg w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-6 inline-flex h-12 w-12 items-center justify-center rounded-(--neu-radius-md) bg-text-primary text-base font-bold text-text-inverse shadow-neu-control">
          N
        </div>

        {!info || !info.valid ? (
          <>
            <h1 className="text-xl font-semibold text-text-primary">
              Invite not available
            </h1>
            <p className="mt-3 text-sm text-text-secondary">
              Это приглашение сейчас недоступно. Организация должна активировать
              платный план или обновить доступ.
            </p>
            <Link
              href={ROUTES.home}
              className="mt-6 inline-flex rounded-(--neu-radius-pill) px-5 py-2.5 text-sm font-semibold text-text-secondary hover:text-text-primary"
            >
              Go to homepage
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-text-primary">
              You&apos;re invited to {info.organizationName}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Join as <span className="font-medium capitalize">{info.role}</span>{" "}
              in Nevora Business OS.
            </p>

            <div className="mt-6">
              {user ? (
                <AcceptInviteButton token={token} />
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-text-secondary">
                    Log in or create an account, then open this link again to
                    join.
                  </p>
                  <div className="flex justify-center gap-3">
                    <Link
                      href={ROUTES.login}
                      className="inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-6 py-2.5 text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:scale-[0.98]"
                    >
                      Log in
                    </Link>
                    <Link
                      href={ROUTES.register}
                      className="inline-flex items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface px-6 py-2.5 text-sm font-semibold text-text-primary shadow-neu-control transition-all hover:border-border-strong hover:shadow-neu-card active:scale-[0.98]"
                    >
                      Sign up
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
