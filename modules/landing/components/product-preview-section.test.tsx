// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getLandingContent } from "../constants/landing-content";
import { ProductPreviewSection } from "./product-preview-section";

afterEach(cleanup);

const stateLabels = {
  detected: "Обнаружено",
  needs_review: "Требует проверки",
  planned: "Запланировано",
  due: "К оплате",
  paid: "Оплачено",
  cancelled: "Отменено",
} as const;

describe("ProductPreviewSection", () => {
  it("переключает разделы и сохраняет выбранный маршрут в ссылке входа", async () => {
    const user = userEvent.setup();
    render(
      <ProductPreviewSection content={getLandingContent("ru").preview} stateLabels={stateLabels} />,
    );

    expect(screen.getByRole("heading", { name: "Входящие" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Открыть Входящие" }).getAttribute("href")).toBe(
      "/login?next=%2Fdashboard%2Finbox",
    );

    await user.click(screen.getByRole("tab", { name: "Задачи" }));
    expect(screen.getByRole("heading", { name: "Задачи" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Открыть Задачи" }).getAttribute("href")).toBe(
      "/login?next=%2Ftasks",
    );

    await user.click(screen.getByRole("tab", { name: "Финансы" }));
    expect(screen.getByRole("heading", { name: "Финансы" })).toBeTruthy();
    // Строки финансов подписаны каноническими состояниями из словаря.
    expect(screen.getByText("Требует проверки")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Открыть Финансы" }).getAttribute("href")).toBe(
      "/login?next=%2Ffinance",
    );

    await user.click(screen.getByRole("tab", { name: "Подписки" }));
    expect(screen.getByRole("link", { name: "Открыть Подписки" }).getAttribute("href")).toBe(
      "/login?next=%2Fsubscriptions",
    );
  });
});
