import { describe, expect, it } from "vitest";
import {
  buildExportFrames,
  chooseWebmMimeType,
  createExportPlan,
  exportAvatarToPng,
  exportPlanToVideo,
  formatDeltaBadge,
  getFrameStatusValue,
  presetForExportScope,
  type AvatarExportConfig,
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
      leadInMs: 220,
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

  it("formats the applied delta for the pop badge", () => {
    expect(formatDeltaBadge(5)).toBe("+5");
    expect(formatDeltaBadge(-12)).toBe("-12");
    expect(formatDeltaBadge(0)).toBe("");
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
        height: 420,
        leadInMs: 220,
      },
    });
    expect(JSON.parse(options.body).events[0]).toMatchObject({
      delta: 5,
      deltaLabel: "+5",
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
        height: 960,
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
        { statusId: "mood", from: 80, to: 85, delta: 5, deltaLabel: "+5" },
        { statusId: "fatigue", from: 25, to: 30, delta: 5, deltaLabel: "+5" },
      ],
    });
  });

  it("maps export scopes to compact overlay presets", () => {
    expect(presetForExportScope("single")).toMatchObject({ width: 1080, height: 420 });
    expect(presetForExportScope("all")).toMatchObject({ width: 1080, height: 960 });
  });

  it("exports the avatar as a transparent PNG canvas", async () => {
    const drawCalls: unknown[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: (...args: unknown[]) => drawCalls.push(["clearRect", ...args]),
        beginPath: () => drawCalls.push(["beginPath"]),
        moveTo: (...args: unknown[]) => drawCalls.push(["moveTo", ...args]),
        lineTo: (...args: unknown[]) => drawCalls.push(["lineTo", ...args]),
        quadraticCurveTo: (...args: unknown[]) => drawCalls.push(["quadraticCurveTo", ...args]),
        closePath: () => drawCalls.push(["closePath"]),
        stroke: () => drawCalls.push(["stroke"]),
        arc: (...args: unknown[]) => drawCalls.push(["arc", ...args]),
        fill: () => drawCalls.push(["fill"]),
        fillText: (...args: unknown[]) => drawCalls.push(["fillText", ...args]),
        save: () => drawCalls.push(["save"]),
        restore: () => drawCalls.push(["restore"]),
        createRadialGradient: () => ({
          addColorStop: (...args: unknown[]) => drawCalls.push(["addColorStop", ...args]),
        }),
      }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) =>
        callback(new Blob(["avatar"], { type })),
    } as unknown as HTMLCanvasElement;
    const config: AvatarExportConfig = {
      mood: "happy",
      size: 220,
      label: "阿年",
      tagline: "主播状态",
    };

    const result = await exportAvatarToPng({ canvas, config });

    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(960);
    expect(result.filename).toBe("buffpop-avatar.png");
    expect(result.mimeType).toBe("image/png");
    expect(drawCalls).toContainEqual(["fillText", "阿年", 218, 726]);
    expect(drawCalls).toContainEqual(["fillText", "主播状态", 218, 786]);
    expect(drawCalls).not.toContainEqual(["fillText", "😄", 218, 786]);
    expect(drawCalls).not.toContainEqual(["fillText", "HAPPY", 270, 786]);
    expect(drawCalls).not.toContainEqual(["fillText", "PLAYER HUD", 218, 786]);
  });

  it("draws the uploaded avatar image into the PNG portrait", async () => {
    const drawCalls: unknown[] = [];
    const uploadedImage = { width: 320, height: 180 };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: (...args: unknown[]) => drawCalls.push(["clearRect", ...args]),
        beginPath: () => drawCalls.push(["beginPath"]),
        moveTo: (...args: unknown[]) => drawCalls.push(["moveTo", ...args]),
        lineTo: (...args: unknown[]) => drawCalls.push(["lineTo", ...args]),
        quadraticCurveTo: (...args: unknown[]) => drawCalls.push(["quadraticCurveTo", ...args]),
        closePath: () => drawCalls.push(["closePath"]),
        stroke: () => drawCalls.push(["stroke"]),
        arc: (...args: unknown[]) => drawCalls.push(["arc", ...args]),
        fill: () => drawCalls.push(["fill"]),
        fillText: (...args: unknown[]) => drawCalls.push(["fillText", ...args]),
        drawImage: (...args: unknown[]) => drawCalls.push(["drawImage", ...args]),
        clip: () => drawCalls.push(["clip"]),
        save: () => drawCalls.push(["save"]),
        restore: () => drawCalls.push(["restore"]),
        createRadialGradient: () => ({
          addColorStop: (...args: unknown[]) => drawCalls.push(["addColorStop", ...args]),
        }),
      }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) =>
        callback(new Blob(["avatar"], { type })),
    } as unknown as HTMLCanvasElement;
    const config: AvatarExportConfig = {
      mood: "happy",
      size: 220,
      label: "阿年",
      imageSrc: "data:image/png;base64,avatar",
      imageScale: 1,
      imageOffsetX: 0,
      imageOffsetY: 0,
    };

    await exportAvatarToPng({
      canvas,
      config,
      imageLoader: async () => uploadedImage as CanvasImageSource,
    });

    expect(drawCalls).toContainEqual([
      "drawImage",
      uploadedImage,
      70,
      0,
      180,
      180,
      106,
      678,
      124,
      124,
    ]);
    expect(drawCalls).toContainEqual(["clip"]);
    expect(drawCalls).not.toContainEqual(["fillText", "😄", 168, 742]);
  });

  it("applies avatar crop scale and offsets during PNG export", async () => {
    const drawCalls: unknown[] = [];
    const uploadedImage = { width: 320, height: 180 };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: (...args: unknown[]) => drawCalls.push(["clearRect", ...args]),
        beginPath: () => drawCalls.push(["beginPath"]),
        moveTo: (...args: unknown[]) => drawCalls.push(["moveTo", ...args]),
        lineTo: (...args: unknown[]) => drawCalls.push(["lineTo", ...args]),
        quadraticCurveTo: (...args: unknown[]) => drawCalls.push(["quadraticCurveTo", ...args]),
        closePath: () => drawCalls.push(["closePath"]),
        stroke: () => drawCalls.push(["stroke"]),
        arc: (...args: unknown[]) => drawCalls.push(["arc", ...args]),
        fill: () => drawCalls.push(["fill"]),
        fillText: (...args: unknown[]) => drawCalls.push(["fillText", ...args]),
        drawImage: (...args: unknown[]) => drawCalls.push(["drawImage", ...args]),
        clip: () => drawCalls.push(["clip"]),
        save: () => drawCalls.push(["save"]),
        restore: () => drawCalls.push(["restore"]),
        createRadialGradient: () => ({
          addColorStop: (...args: unknown[]) => drawCalls.push(["addColorStop", ...args]),
        }),
      }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) =>
        callback(new Blob(["avatar"], { type })),
    } as unknown as HTMLCanvasElement;

    await exportAvatarToPng({
      canvas,
      config: {
        mood: "calm",
        size: 220,
        label: "阿年",
        imageSrc: "data:image/png;base64,avatar",
        imageScale: 1.5,
        imageOffsetX: 10,
        imageOffsetY: -8,
      },
      imageLoader: async () => uploadedImage as CanvasImageSource,
    });

    expect(drawCalls).toContainEqual([
      "drawImage",
      uploadedImage,
      70,
      0,
      180,
      180,
      87.4,
      637.08,
      186,
      186,
    ]);
  });
});
