import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AutomationHandler } from "./automation-handler.types";

/**
 * dispatchDomainEvent — ядро движка. Проверяем три гарантии без БД:
 *   1. нет подписчиков → ничего не логируем;
 *   2. успешный/skip хендлер → пишем его статус в лог;
 *   3. падающий хендлер изолирован: dispatch не бросает, статус 'failed'
 *      логируется, остальные хендлеры продолжают работать.
 *
 * Реестр и запись лога замоканы, поэтому реальные supabase/RLS не грузятся.
 */

const getHandlersForEvent = vi.fn<(e: string) => AutomationHandler[]>();
const createAutomationLog =
  vi.fn<(input: Record<string, unknown>) => Promise<string>>();

vi.mock("./automation-registry", () => ({
  getHandlersForEvent: (e: string) => getHandlersForEvent(e),
}));
vi.mock("../logs/create-automation-log", () => ({
  createAutomationLog: (input: Record<string, unknown>) =>
    createAutomationLog(input),
}));

const { dispatchDomainEvent } = await import("./dispatch-domain-event");

const ORG = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const AGG = "33333333-3333-4333-8333-333333333333";

const baseInput = {
  organizationId: ORG,
  workspaceId: null,
  eventId: EVENT,
  eventName: "document.created" as const,
  aggregateType: "document" as const,
  aggregateId: AGG,
  payload: {},
};

beforeEach(() => {
  getHandlersForEvent.mockReset();
  createAutomationLog.mockClear();
});

describe("dispatchDomainEvent", () => {
  it("ничего не логирует, когда нет подписанных хендлеров", async () => {
    getHandlersForEvent.mockReturnValue([]);
    await dispatchDomainEvent(baseInput);
    expect(createAutomationLog).not.toHaveBeenCalled();
  });

  it("логирует статус успешного хендлера", async () => {
    getHandlersForEvent.mockReturnValue([
      { name: "h-ok", eventName: "document.created", run: async () => ({ status: "executed" }) },
    ]);
    await dispatchDomainEvent(baseInput);
    expect(createAutomationLog).toHaveBeenCalledTimes(1);
    expect(createAutomationLog.mock.calls[0][0]).toMatchObject({
      automationName: "h-ok",
      status: "executed",
      triggerEventId: EVENT,
    });
  });

  it("падающий хендлер изолирован: dispatch не бросает, пишет status=failed", async () => {
    getHandlersForEvent.mockReturnValue([
      {
        name: "h-boom",
        eventName: "document.created",
        run: async () => {
          throw new Error("kaboom");
        },
      },
      { name: "h-after", eventName: "document.created", run: async () => ({ status: "executed" }) },
    ]);

    await expect(dispatchDomainEvent(baseInput)).resolves.toBeUndefined();

    // Оба хендлера отработали и залогированы — ошибка первого не сломала второй
    expect(createAutomationLog).toHaveBeenCalledTimes(2);
    expect(createAutomationLog.mock.calls[0][0]).toMatchObject({
      automationName: "h-boom",
      status: "failed",
      errorMessage: "kaboom",
    });
    expect(createAutomationLog.mock.calls[1][0]).toMatchObject({
      automationName: "h-after",
      status: "executed",
    });
  });

  it("игнорирует невалидный вход (битый UUID) без запуска хендлеров", async () => {
    getHandlersForEvent.mockReturnValue([
      { name: "h", eventName: "document.created", run: async () => ({ status: "executed" }) },
    ]);
    await dispatchDomainEvent({ ...baseInput, organizationId: "not-uuid" });
    expect(getHandlersForEvent).not.toHaveBeenCalled();
    expect(createAutomationLog).not.toHaveBeenCalled();
  });
});
