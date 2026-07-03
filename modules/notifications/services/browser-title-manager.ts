const NOTIFICATION_PREFIX = /^\(\d+\+?!?\)\s+/;

export function stripNotificationPrefix(title: string): string {
  return title.replace(NOTIFICATION_PREFIX, "");
}

export function formatBrowserTitle(unreadCount: number, baseTitle: string, urgentCount = 0): string {
  const count = Math.max(0, Math.floor(Number.isFinite(unreadCount) ? unreadCount : 0));
  const urgent = Math.max(0, Math.floor(Number.isFinite(urgentCount) ? urgentCount : 0));
  const cleanBase = stripNotificationPrefix(baseTitle).trim() || "Nevora Business OS";
  if (urgent > 0) return `(${urgent > 99 ? "99+" : urgent}!) ${cleanBase}`;
  if (count === 0) return cleanBase;
  return `(${count > 99 ? "99+" : count}) ${cleanBase}`;
}

export class BrowserTitleManager {
  private baseTitle: string;
  private renderedTitle: string | null = null;

  constructor(private readonly documentRef: Document) {
    this.baseTitle = stripNotificationPrefix(documentRef.title).trim() || "Nevora Business OS";
  }

  apply(unreadCount: number, urgentCount = 0): void {
    const current = this.documentRef.title;
    if (current !== this.renderedTitle) {
      const routeTitle = stripNotificationPrefix(current).trim();
      if (routeTitle) this.baseTitle = routeTitle;
    }
    const next = formatBrowserTitle(unreadCount, this.baseTitle, urgentCount);
    if (current !== next) this.documentRef.title = next;
    this.renderedTitle = next;
  }

  restore(): void {
    const currentBase = stripNotificationPrefix(this.documentRef.title).trim();
    this.documentRef.title = currentBase || this.baseTitle;
    this.renderedTitle = null;
  }
}
