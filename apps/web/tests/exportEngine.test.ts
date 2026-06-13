import { describe, expect, it } from "vitest";
import {
  buildExportFrames,
  chooseWebmMimeType,
  createExportPlan,
  exportPlanToVideo,
  getFrameStatusValue,
  presetForExportScope,
} from "../src/exportEngine";
import { applyStatusDelta, cloneStatuses, initialStatuses } from "../src/stateEngine";

describe("exportEngine", () => {
  it("creates a transparent vertical MOV export plan", () => {
    const plan = createExportPlan({
      statuses: cloneStatuses(initialStatuses),
      statusId: "mood",
      deltaInput: "+5",
      now: 1000,
    });

    expect(plan.preset).toEqual({
      width: 1080,
      height: 1920,
      fps: 60,
      durationMs: 1600,
      format: "mov-prores-alpha",
    });
    expect(plan.event).toMatchObject({
      statusId: "mood",
      from: 80,
      to: 85,
    });
    expect(plan.frames).toHaveLength(97);
  });

  it("calculates linear frame values from the event", () => {
    const plan = createExportPlan({
      statuses: cloneStatuses(initialStatuses),
      statusId: "mood",
      deltaInput: "+10",
      now: 1000,
    });

    expect(getFrameStatusValue(plan.event, 0)).toBe(80);
    expect(getFrameStatusValue(plan.event, 0.5)).toBe(85);
    expect(getFrameStatusValue(plan.event, 1)).toBe(90);

    const smallDeltaPlan = createExportPlan({
      statuses: cloneStatuses(initialStatuses),
      statusId: "mood",
      deltaInput: "+5",
      now: 1000,
    });

    expect(getFrameStatusValue(smallDeltaPlan.event, 0.5)).toBe(82.5);
  });

  it("reuses a preview event without applying the delta again", () => {
    const preview = applyStatusDelta(cloneStatuses(initialStatuses), "mood", "+5", 1000);
    const plan = createExportPlan({
      statuses: preview.statuses,
      statusId: "mood",
      deltaInput: "+5",
      event: preview.event,
      now: 2000,
    });

    expect(plan.event).toMatchObject({
      statusId: "mood",
      from: 80,
      to: 85,
    });
    expect(plan.statuses.find((status) => status.id === "mood")?.value).toBe(85);
  });

  it("builds frames from 0 to 1 progress", () => {
    const frames = buildExportFrames({ fps: 10, durationMs: 1000 });

    expect(frames).toHaveLength(11);
    expect(frames[0]).toEqual({ index: 0, progress: 0, timeMs: 0 });
    expect(frames[5]).toEqual({ index: 5, progress: 0.5, timeMs: 500 });
    expect(frames[10]).toEqual({ index: 10, progress: 1, timeMs: 1000 });
  });

  it("chooses a browser-supported WebM mime type", () => {
    expect(chooseWebmMimeType((mimeType) => mimeType === "video/webm;codecs=vp9")).toBe(
      "video/webm;codecs=vp9",
    );
    expect(chooseWebmMimeType(() => false)).toBe("video/webm");
  });

  it("sends the requested export scope to the API", async () => {
    const plan = createExportPlan({
      statuses: cloneStatuses(initialStatuses),
      statusId: "hunger",
      deltaInput: "+5",
      now: 1000,
    });
    const fetchCalls: unknown[] = [];
    const fetchStub = async (...args: unknown[]) => {
      fetchCalls.push(args);

      return new Response(new Blob(["video"], { type: "video/quicktime" }), {
        status: 200,
      });
    };

    await exportPlanToVideo({
      plan,
      copy: { statusLabels: {} },
      scope: "single",
      fetcher: fetchStub,
    });

    const [, options] = fetchCalls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toMatchObject({
      statusId: "hunger",
      delta: 5,
      scope: "single",
      preset: {
        width: 1080,
        height: 260,
      },
    });
    expect(JSON.parse(options.body).statuses[0].iconSteps[0]).toMatchObject({
      maxPercent: 0,
      icon: expect.stringContaining("openmoji"),
    });
  });

  it("uses a compact canvas for full-HUD exports with three statuses", async () => {
    const plan = createExportPlan({
      statuses: cloneStatuses(initialStatuses),
      statusId: "mood",
      deltaInput: "+5",
      now: 1000,
    });
    const fetchCalls: unknown[] = [];
    const fetchStub = async (...args: unknown[]) => {
      fetchCalls.push(args);

      return new Response(new Blob(["video"], { type: "video/quicktime" }), {
        status: 200,
      });
    };

    await exportPlanToVideo({
      plan,
      copy: { statusLabels: {} },
      scope: "all",
      fetcher: fetchStub,
    });

    const [, options] = fetchCalls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toMatchObject({
      scope: "all",
      preset: {
        width: 1080,
        height: 640,
      },
    });
  });

  it("sends recorded status events to the API", async () => {
    const statuses = cloneStatuses(initialStatuses);
    const moodResult = applyStatusDelta(statuses, "mood", "+5", 1000);
    const fatigueResult = applyStatusDelta(moodResult.statuses, "fatigue", "+5", 2000);
    const plan = createExportPlan({
      statuses: fatigueResult.statuses,
      statusId: "fatigue",
      deltaInput: "+5",
      event: fatigueResult.event,
    });
    const fetchCalls: unknown[] = [];
    const fetchStub = async (...args: unknown[]) => {
      fetchCalls.push(args);

      return new Response(new Blob(["video"], { type: "video/quicktime" }), {
        status: 200,
      });
    };

    await exportPlanToVideo({
      plan,
      copy: { statusLabels: {} },
      scope: "all",
      source: "recording",
      events: [moodResult.event, fatigueResult.event],
      fetcher: fetchStub,
    });

    const [, options] = fetchCalls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toMatchObject({
      source: "recording",
      events: [
        { statusId: "mood", from: 80, to: 85, delta: 5 },
        { statusId: "fatigue", from: 25, to: 30, delta: 5 },
      ],
    });
  });

  it("maps export scopes to compact overlay presets", () => {
    expect(presetForExportScope("single")).toMatchObject({ width: 1080, height: 260 });
    expect(presetForExportScope("all")).toMatchObject({ width: 1080, height: 640 });
  });
});
