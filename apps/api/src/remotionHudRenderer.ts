import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle as remotionBundle } from "@remotion/bundler";
import { renderMedia as remotionRenderMedia, type RenderMediaOptions } from "@remotion/renderer";
import type { VideoConfig } from "remotion/no-react";
import {
  buffPopCompositionId,
  buffPopQuestCompositionId,
  getRemotionDurationInFrames,
  type RemotionHudProps,
  type RemotionQuestProps,
} from "./remotionHudTypes.js";
import type { NormalizedExportRequest } from "./exportWebm.js";

type BundleOptions = Parameters<typeof remotionBundle>[0];

export type RemotionRenderDependencies = {
  bundle?: (options: BundleOptions) => Promise<string>;
  renderMedia?: (options: RenderMediaOptions) => Promise<{
    buffer: Buffer | null;
    contentType: string;
    slowestFrames: unknown[];
  }>;
};

function sourceDirectory(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function getRemotionEntryPoint(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const entryFilename = currentFile.endsWith(".ts") ? "entry.tsx" : "entry.js";

  return join(sourceDirectory(), `remotion/${entryFilename}`);
}

export function toRemotionHudProps(request: NormalizedExportRequest): RemotionHudProps {
  return {
    statuses: request.statuses,
    scope: request.scope,
    event: request.event,
    events: request.events,
    preset: {
      width: request.preset.width,
      height: request.preset.height,
      fps: request.preset.fps,
      durationMs: request.preset.durationMs,
      leadInMs: request.preset.leadInMs,
    },
  };
}

export function toRemotionQuestProps(request: NormalizedExportRequest): RemotionQuestProps {
  return {
    quest: request.quest ?? {
      title: "未命名任务",
      label: "MISSION START",
      state: "start",
    },
    preset: {
      width: request.preset.width,
      height: request.preset.height,
      fps: request.preset.fps,
      durationMs: request.preset.durationMs,
      leadInMs: request.preset.leadInMs,
    },
  };
}

function inputPropsForRequest(request: NormalizedExportRequest): RemotionHudProps | RemotionQuestProps {
  return request.kind === "quest" ? toRemotionQuestProps(request) : toRemotionHudProps(request);
}

export function buildRemotionComposition(request: NormalizedExportRequest): VideoConfig {
  const props = inputPropsForRequest(request);

  return {
    id: request.kind === "quest" ? buffPopQuestCompositionId : buffPopCompositionId,
    width: request.preset.width,
    height: request.preset.height,
    fps: request.preset.fps,
    durationInFrames: getRemotionDurationInFrames(request.preset),
    defaultProps: props,
    props,
    defaultCodec: null,
    defaultOutName: null,
    defaultVideoImageFormat: null,
    defaultPixelFormat: null,
    defaultProResProfile: null,
    defaultSampleRate: null,
  };
}

export function buildRemotionRenderOptions({
  request,
  serveUrl,
  outputLocation,
}: {
  request: NormalizedExportRequest;
  serveUrl: string;
  outputLocation: string;
}): RenderMediaOptions {
  const baseOptions = {
    composition: buildRemotionComposition(request),
    inputProps: inputPropsForRequest(request),
    imageFormat: "png" as const,
    logLevel: "warn" as const,
    muted: true,
    outputLocation,
    overwrite: true,
    serveUrl,
  };

  if (request.preset.format === "mov-prores-alpha") {
    return {
      ...baseOptions,
      codec: "prores",
      pixelFormat: "yuva444p10le",
      proResProfile: "4444",
    };
  }

  return {
    ...baseOptions,
    codec: "vp9",
    pixelFormat: "yuva420p",
    preferLossless: true,
  };
}

export function buildRemotionBundleOptions(): BundleOptions {
  return {
    entryPoint: getRemotionEntryPoint(),
    onProgress: () => undefined,
    webpackOverride: (currentConfiguration) => ({
      ...currentConfiguration,
      resolve: {
        ...currentConfiguration.resolve,
        extensionAlias: {
          ...currentConfiguration.resolve?.extensionAlias,
          ".js": [".js", ".ts", ".tsx"],
          ".jsx": [".jsx", ".tsx"],
        },
      },
    }),
  };
}

function remotionExportFilename(
  format: NormalizedExportRequest["preset"]["format"],
  kind: NormalizedExportRequest["kind"],
): string {
  const basename = kind === "quest" ? "buffpop-quest" : "buffpop-overlay";
  return format === "mov-prores-alpha" ? `${basename}.mov` : `${basename}.webm`;
}

export async function renderWithRemotion(
  request: NormalizedExportRequest,
  dependencies: RemotionRenderDependencies = {},
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "buffpop-remotion-"));
  const outputLocation = join(directory, remotionExportFilename(request.preset.format, request.kind));
  const bundle = dependencies.bundle ?? remotionBundle;
  const renderMedia = dependencies.renderMedia ?? remotionRenderMedia;

  try {
    const serveUrl = await bundle(buildRemotionBundleOptions());
    const result = await renderMedia(
      buildRemotionRenderOptions({
        request,
        serveUrl,
        outputLocation,
      }),
    );

    return result.buffer ?? (await readFile(outputLocation));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
