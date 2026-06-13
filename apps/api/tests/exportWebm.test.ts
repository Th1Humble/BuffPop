import { describe, expect, it } from "vitest";
import {
  exportFilename,
  exportMimeType,
  normalizeExportRequest,
  type ExportRequestPayload,
} from "../src/exportWebm.js";

const payload: ExportRequestPayload = {
  statuses: [
    {
      id: "mood",
      label: "心情",
      customLabel: "快乐值",
      value: 80,
      max: 100,
      color: "#ff4f8b",
      iconSteps: [
        {
          maxPercent: 0,
          icon: "https://cdn.jsdelivr.net/npm/openmoji@17.0.0/color/svg/1F62D.svg",
        },
      ],
    },
    {
      id: "fatigue",
      label: "疲劳",
      value: 25,
      max: 100,
      color: "#7c5cff",
    },
  ],
  statusId: "mood",
  delta: 5,
  preset: {
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 1200,
    format: "webm-alpha",
  },
};

describe("webm export", () => {
  it("normalizes export request values", () => {
    const request = normalizeExportRequest(payload);

    expect(request.event).toMatchObject({
      from: 80,
      to: 85,
      statusId: "mood",
    });
    expect(request.scope).toBe("all");
    expect(request.statuses[0]?.customLabel).toBe("快乐值");
    expect(request.statuses[0]?.iconSteps?.[0]).toMatchObject({
      maxPercent: 0,
      icon: expect.stringContaining("openmoji"),
    });
    expect(request.preset.format).toBe("webm-alpha");
  });

  it("normalizes single status export scope", () => {
    const request = normalizeExportRequest({
      ...payload,
      scope: "single",
    });

    expect(request.scope).toBe("single");
  });

  it("normalizes recorded events for simultaneous status changes", () => {
    const request = normalizeExportRequest({
      ...payload,
      events: [
        { statusId: "mood", from: 80, to: 85, delta: 5 },
        { statusId: "fatigue", from: 25, to: 30, delta: 5 },
      ],
    });

    expect(request.events).toEqual([
      { statusId: "mood", from: 80, to: 85, delta: 5 },
      { statusId: "fatigue", from: 25, to: 30, delta: 5 },
    ]);
    expect(request.event).toMatchObject({ statusId: "mood", from: 80, to: 85 });
  });

  it("returns export names and MIME types for Remotion outputs", () => {
    expect(exportFilename("mov-prores-alpha")).toBe("buffpop-overlay.mov");
    expect(exportMimeType("mov-prores-alpha")).toBe("video/quicktime");
    expect(exportFilename("webm-alpha")).toBe("buffpop-overlay.webm");
    expect(exportMimeType("webm-alpha")).toBe("video/webm");
  });

  it("rejects an unknown status id", () => {
    expect(() =>
      normalizeExportRequest({
        ...payload,
        statusId: "missing",
      }),
    ).toThrow(/Unknown status/);
  });

  it("rejects an unsupported export scope", () => {
    expect(() =>
      normalizeExportRequest({
        ...payload,
        scope: "selected",
      } as unknown as ExportRequestPayload),
    ).toThrow(/Unsupported export scope/);
  });
});
