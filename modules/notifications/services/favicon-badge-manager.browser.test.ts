// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FaviconBadgeManager } from "./favicon-badge-manager";

class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
}

describe("FaviconBadgeManager", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("badges, follows an externally replaced icon, and restores it", async () => {
    vi.stubGlobal("Image", LoadedImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      fillStyle: "", lineWidth: 0, strokeStyle: "",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,badged");
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "/favicon.ico";
    document.head.append(link);
    const manager = new FaviconBadgeManager(document);

    await manager.apply(1);
    expect(link.href).toBe("data:image/png;base64,badged");
    link.href = "/route-icon.png";
    await manager.apply(1);
    expect(link.href).toBe("data:image/png;base64,badged");
    manager.restore();
    expect(link.href).toContain("/route-icon.png");
  });
});
