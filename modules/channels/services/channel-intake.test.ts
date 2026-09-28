import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/planner/services/process-planner-entry", () => ({ processPlannerEntry: vi.fn() }));
vi.mock("@/modules/planner/services/capture-inbox-document", () => ({ captureInboxDocument: vi.fn() }));
vi.mock("@/modules/documents/services/document-extraction-service", () => ({ runDocumentExtraction: vi.fn() }));

import { channelCaptureId } from "./channel-intake";

describe("channelCaptureId", () => {
  it("is a stable UUID per org + channel + message, so a redelivery reuses the capture", () => {
    const id = channelCaptureId("org-1", "telegram", "42:55");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(channelCaptureId("org-1", "telegram", "42:55")).toBe(id);
  });

  it("differs across messages, channels and organizations", () => {
    const id = channelCaptureId("org-1", "telegram", "42:55");
    expect(channelCaptureId("org-1", "telegram", "42:56")).not.toBe(id);
    expect(channelCaptureId("org-1", "slack", "42:55")).not.toBe(id);
    expect(channelCaptureId("org-2", "telegram", "42:55")).not.toBe(id);
  });
});
