// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROUTES } from "@/shared/config/routes";
import { LandingAppMenu } from "./landing-app-menu";

afterEach(cleanup);

describe("LandingAppMenu", () => {
  it("показывает в хедере только иконку и открывает три приложения", async () => {
    const user = userEvent.setup();
    render(<LandingAppMenu locale="ru" />);

    const trigger = screen.getByRole("button", { name: "Выбрать приложение" });
    expect(trigger.textContent).toBe("");

    await user.click(trigger);

    expect(screen.getByRole("menuitem", { name: "Задачи" }).getAttribute("href")).toBe(
      ROUTES.tasks,
    );
    expect(screen.getByRole("menuitem", { name: "Финансы" }).getAttribute("href")).toBe(
      ROUTES.money,
    );
    expect(screen.getByRole("menuitem", { name: "Подписки" }).getAttribute("href")).toBe(
      ROUTES.subscriptions,
    );
  });
});
