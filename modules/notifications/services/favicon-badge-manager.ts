import { logger } from "@/lib/observability/logger";

export type FaviconMarkerState = "default" | "badged";

export function faviconMarkerState(unreadCount: number): FaviconMarkerState {
  return Number.isFinite(unreadCount) && unreadCount > 0 ? "badged" : "default";
}

export class FaviconBadgeManager {
  private readonly originals = new Map<HTMLLinkElement, string>();
  private readonly generated = new Map<string, string>();
  private generation = 0;
  private state: FaviconMarkerState | null = null;

  constructor(private readonly documentRef: Document) {}

  async apply(unreadCount: number): Promise<void> {
    const nextState = faviconMarkerState(unreadCount);
    const links = this.iconLinks();
    if (links.length === 0) return;
    for (const link of links) {
      const original = this.originals.get(link);
      const currentBadge = original ? this.generated.get(original) : undefined;
      if (original && link.href !== original && link.href !== currentBadge) {
        this.originals.set(link, link.href);
      }
    }
    const alreadyApplied = links.every((link) => {
      const original = this.originals.get(link);
      return nextState === "default"
        ? !original || link.href === original
        : Boolean(original && this.generated.get(original) === link.href);
    });
    if (nextState === this.state && alreadyApplied) return;
    if (nextState === "default") {
      this.restore();
      this.state = nextState;
      return;
    }

    const generation = ++this.generation;
    await Promise.all(links.map(async (link) => {
      const original = this.originals.get(link) ?? link.href;
      this.originals.set(link, original);
      try {
        const badged = this.generated.get(original) ?? await drawBadge(this.documentRef, original);
        this.generated.set(original, badged);
        if (generation === this.generation && link.isConnected && link.href !== badged) link.href = badged;
      } catch (error) {
        logger.warn("notification.favicon_badge_failed", {
          reason: error instanceof Error ? error.name : "unknown",
        });
      }
    }));
    if (generation === this.generation) this.state = nextState;
  }

  restore(): void {
    this.generation += 1;
    for (const [link, original] of this.originals) {
      if (link.isConnected && link.href !== original) link.href = original;
    }
    this.state = "default";
  }

  private iconLinks(): HTMLLinkElement[] {
    return Array.from(this.documentRef.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  }
}

function drawBadge(documentRef: Document, source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = documentRef.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(image, 0, 0, 32, 32);
        context.beginPath();
        context.arc(25, 7, 6, 0, Math.PI * 2);
        context.fillStyle = "#dc2626";
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = "#ffffff";
        context.stroke();
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Favicon image failed to load"));
    image.src = source;
  });
}
