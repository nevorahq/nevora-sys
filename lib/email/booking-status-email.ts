import "server-only";

type BookingDecision = "accepted" | "rejected";

export interface BookingStatusEmailInput {
  to: string;
  clientName: string;
  status: BookingDecision;
  serviceName: string;
  hostName: string;
  requestedStartAt: string;
  timezone: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}

function formatBookingTime(value: string, timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone || "Europe/Chisinau",
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString("ru-RU");
  }
}

export function buildBookingStatusEmail(input: BookingStatusEmailInput) {
  const name = escapeHtml(input.clientName);
  const service = escapeHtml(input.serviceName);
  const host = escapeHtml(input.hostName);
  const dateTime = escapeHtml(formatBookingTime(input.requestedStartAt, input.timezone));
  const accepted = input.status === "accepted";

  const subject = accepted
    ? `Заявка подтверждена: ${input.serviceName}`
    : `Обновление по заявке: ${input.serviceName}`;

  const headline = accepted ? "Ваша заявка подтверждена" : "Ваша заявка не принята";
  const message = accepted
    ? "Менеджер подтвердил вашу заявку. Ниже — детали записи."
    : "К сожалению, менеджер не смог подтвердить вашу заявку. Пожалуйста, свяжитесь с компанией, чтобы выбрать другое время.";

  return {
    subject,
    html: `<!doctype html>
<html lang="ru"><body style="margin:0;background:#f6f7f8;font-family:Arial,sans-serif;color:#20242a">
  <main style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;padding:32px">
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280">Nevora Business OS</p>
    <h1 style="margin:0 0 16px;font-size:24px">${headline}</h1>
    <p style="margin:0 0 24px;line-height:1.5">Здравствуйте, ${name}! ${message}</p>
    ${accepted ? `<section style="background:#f3f8f4;border-radius:12px;padding:20px">
      <p style="margin:0 0 8px"><strong>Услуга:</strong> ${service}</p>
      <p style="margin:0 0 8px"><strong>Специалист:</strong> ${host}</p>
      <p style="margin:0"><strong>Дата и время:</strong> ${dateTime}</p>
    </section>` : ""}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280">Это автоматическое уведомление. Не отвечайте на это письмо.</p>
  </main>
</body></html>`,
  };
}
