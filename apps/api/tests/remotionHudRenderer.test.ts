import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRemotionComposition,
  buildRemotionBundleOptions,
  buildRemotionRenderOptions,
  renderWithRemotion,
  type RemotionRenderDependencies,
} from "../src/remotionHudRenderer.js";
import { normalizeExportRequest, type ExportRequestPayload } from "../src/exportWebm.js";

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
  ],
  statusId: "mood",
  delta: 5,
  scope: "single",
  preset: {
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 1200,
    leadInMs: 220,
    format: "mov-prores-alpha",
  },
};

describe("Remotion HUD renderer", () => {
  it("builds composition metadata from the export preset", () => {
    const request = normalizeExportRequest(payload);
    const composition = buildRemotionComposition(request);

    expect(composition).toMatchObject({
      id: "BuffPopOverlay",
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 43,
    });
  });

  it("builds quest composition metadata from a quest export request", () => {
    const request = normalizeExportRequest({
      kind: "quest",
      quest: {
        title: "剪完昨晚 Vlog",
        label: "MISSION START",
        state: "start",
      },
      preset: {
        width: 1080,
        height: 360,
        fps: 60,
        durationMs: 1800,
        leadInMs: 0,
        format: "mov-prores-alpha",
      },
    });
    const composition = buildRemotionComposition(request);

    expect(composition).toMatchObject({
      id: "BuffPopQuestOverlay",
      width: 1080,
      height: 360,
      fps: 60,
      durationInFrames: 108,
    });
  });

  it("uses ProRes 4444 settings for MOV alpha export", () => {
    const request = normalizeExportRequest(payload);
    const options = buildRemotionRenderOptions({
      request,
      serveUrl: "http://127.0.0.1:3000",
      outputLocation: "/tmp/buffpop-overlay.mov",
    });

    expect(options).toMatchObject({
      codec: "prores",
      proResProfile: "4444",
      pixelFormat: "yuva444p10le",
      outputLocation: "/tmp/buffpop-overlay.mov",
      serveUrl: "http://127.0.0.1:3000",
      overwrite: true,
    });
    expect(options.composition.id).toBe("BuffPopOverlay");
    expect(options.inputProps?.event).toMatchObject({ from: 80, to: 85 });
    expect(options.inputProps?.events).toEqual([
      { statusId: "mood", from: 80, to: 85, delta: 5, deltaLabel: "+5" },
    ]);
    expect(options.inputProps?.statuses[0]?.iconSteps?.[0]).toMatchObject({
      maxPercent: 0,
      icon: expect.stringContaining("openmoji"),
    });
  });

  it("uses quest input props for quest video exports", () => {
    const request = normalizeExportRequest({
      kind: "quest",
      quest: {
        title: "剪完昨晚 Vlog",
        label: "MISSION START",
        state: "start",
      },
      preset: {
        width: 1080,
        height: 360,
        fps: 60,
        durationMs: 1800,
        leadInMs: 0,
        format: "mov-prores-alpha",
      },
    });
    const options = buildRemotionRenderOptions({
      request,
      serveUrl: "http://127.0.0.1:3000",
      outputLocation: "/tmp/buffpop-quest.mov",
    });

    expect(options.composition.id).toBe("BuffPopQuestOverlay");
    expect(options.inputProps?.quest).toMatchObject({
      title: "剪完昨晚 Vlog",
      label: "MISSION START",
      state: "start",
    });
  });

  it("uses VP9 settings for WebM alpha export", () => {
    const request = normalizeExportRequest({
      ...payload,
      preset: {
        ...payload.preset,
        format: "webm-alpha",
      },
    });
    const options = buildRemotionRenderOptions({
      request,
      serveUrl: "http://127.0.0.1:3000",
      outputLocation: "/tmp/buffpop-overlay.webm",
    });

    expect(options).toMatchObject({
      codec: "vp9",
      pixelFormat: "yuva420p",
      outputLocation: "/tmp/buffpop-overlay.webm",
    });
  });

  it("maps NodeNext .js imports back to TypeScript files for Remotion bundling", async () => {
    const options = buildRemotionBundleOptions();
    const webpackConfig = await options.webpackOverride?.({
      resolve: {
        extensionAlias: {
          ".mjs": [".mjs"],
        },
      },
    });

    expect(webpackConfig?.resolve?.extensionAlias).toMatchObject({
      ".js": [".js", ".ts", ".tsx"],
      ".jsx": [".jsx", ".tsx"],
      ".mjs": [".mjs"],
    });
  });

  it("returns the video buffer produced by Remotion", async () => {
    const request = normalizeExportRequest(payload);
    const directory = await mkdtemp(join(tmpdir(), "buffpop-remotion-test-"));
    const outputLocation = join(directory, "buffpop-overlay.mov");
    const expectedBuffer = Buffer.from("rendered-video");
    const calls: string[] = [];
    const dependencies: RemotionRenderDependencies = {
      bundle: async ({ entryPoint }) => {
        calls.push(`bundle:${entryPoint}`);
        return "http://127.0.0.1:3000";
      },
      renderMedia: async ({ outputLocation: renderedOutputLocation }) => {
        calls.push(`render:${renderedOutputLocation}`);
        await writeFile(renderedOutputLocation ?? outputLocation, expectedBuffer);
        return {
          buffer: null,
          contentType: "video/quicktime",
          slowestFrames: [],
        };
      },
    };

    try {
      const buffer = await renderWithRemotion(request, dependencies);

      expect(buffer).toEqual(expectedBuffer);
      expect(calls[0]).toContain("remotion/entry.tsx");
      expect(calls[1]).toContain("buffpop-overlay.mov");
      expect(await readFile(outputLocation).catch(() => null)).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
