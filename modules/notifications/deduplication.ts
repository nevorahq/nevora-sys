export class NotificationDeduplicator {
  private readonly processed = new Set<string>();

  process(id: string): boolean {
    if (this.processed.has(id)) return false;
    this.processed.add(id);
    return true;
  }
}
