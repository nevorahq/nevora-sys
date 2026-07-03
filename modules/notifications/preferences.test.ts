import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES, isCategoryEnabled, isWithinQuietHours, shouldPlaySound, soundModeAllows, timeInTimezone } from "./preferences";

const enabled = { ...DEFAULT_NOTIFICATION_PREFERENCES, inAppSoundEnabled: true };

describe("notification preference filtering", () => {
  it("filters sound mode and priority", () => {
    expect(soundModeAllows("important", "normal")).toBe(false);
    expect(soundModeAllows("important", "high")).toBe(true);
    expect(soundModeAllows("all", "low")).toBe(true);
    expect(soundModeAllows("off", "critical")).toBe(false);
  });

  it("filters disabled categories", () => {
    expect(isCategoryEnabled({ ...enabled, paymentRemindersEnabled: false }, "payment")).toBe(false);
    expect(shouldPlaySound({ ...enabled, paymentRemindersEnabled: false, soundMode: "all" }, "payment", "high")).toBe(false);
  });

  it("handles normal and overnight quiet-hour ranges", () => {
    const daytime = { ...enabled, quietHoursEnabled: true, quietHoursStart: "09:00", quietHoursEnd: "17:00", timezone: "UTC" };
    expect(isWithinQuietHours(new Date("2026-07-02T12:00:00Z"), daytime)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-07-02T18:00:00Z"), daytime)).toBe(false);

    const overnight = { ...daytime, quietHoursStart: "22:00", quietHoursEnd: "08:00" };
    expect(isWithinQuietHours(new Date("2026-07-02T23:00:00Z"), overnight)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-07-02T07:59:00Z"), overnight)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-07-02T12:00:00Z"), overnight)).toBe(false);
  });

  it("converts the current time using an IANA timezone", () => {
    expect(timeInTimezone(new Date("2026-01-02T12:00:00Z"), "Europe/Chisinau")).toBe("14:00");
  });
});
