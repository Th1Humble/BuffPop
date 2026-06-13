import { renderWithRemotion } from "./remotionHudRenderer.js";

type SupportedExportFormat = "mov-prores-alpha" | "webm-alpha";
type ExportScope = "single" | "all";
type ExportSource = "current" | "recording";

export type ExportStatusIconStep = {
  maxPercent: number;
  icon: string;
};

export type ExportStatus = {
  id: string;
  label: string;
  customLabel?: string;
  icon?: string;
  iconSteps?: ExportStatusIconStep[];
  value: number;
  max: number;
  color: string;
};

export type ExportRequestPayload = {
  statuses: ExportStatus[];
  statusId: string;
  delta: number;
  scope?: ExportScope;
  source?: ExportSource;
  events?: ExportEventPayload[];
  preset: {
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    format: SupportedExportFormat;
  };
};

export type ExportEventPayload = {
  statusId: string;
  from: number;
  to: number;
  delta: number;
};

export type NormalizedExportRequest = ExportRequestPayload & {
  scope: ExportScope;
  source: ExportSource;
  event: {
    statusId: string;
    from: number;
    to: number;
    delta: number;
  };
  events: ExportEventPayload[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function exportExtension(format: SupportedExportFormat): "mov" | "webm" {
  return format === "mov-prores-alpha" ? "mov" : "webm";
}

export function exportMimeType(format: SupportedExportFormat): "video/quicktime" | "video/webm" {
  return format === "mov-prores-alpha" ? "video/quicktime" : "video/webm";
}

export function exportFilename(format: SupportedExportFormat): string {
  return `buffpop-overlay.${exportExtension(format)}`;
}

export function normalizeExportRequest(payload: ExportRequestPayload): NormalizedExportRequest {
  if (!Array.isArray(payload.statuses) || payload.statuses.length === 0) {
    throw new Error("statuses must contain at least one status.");
  }

  assertFiniteNumber(payload.delta, "delta");
  assertFiniteNumber(payload.preset.width, "width");
  assertFiniteNumber(payload.preset.height, "height");
  assertFiniteNumber(payload.preset.fps, "fps");
  assertFiniteNumber(payload.preset.durationMs, "durationMs");

  if (payload.preset.format !== "webm-alpha" && payload.preset.format !== "mov-prores-alpha") {
    throw new Error("Only MOV ProRes alpha and WebM alpha export are supported.");
  }

  const scope = payload.scope ?? "all";
  const source = payload.source ?? "current";

  if (scope !== "single" && scope !== "all") {
    throw new Error("Unsupported export scope.");
  }

  if (source !== "current" && source !== "recording") {
    throw new Error("Unsupported export source.");
  }

  const statuses = payload.statuses.map((status) => {
    assertFiniteNumber(status.value, `${status.id}.value`);
    assertFiniteNumber(status.max, `${status.id}.max`);
    const iconSteps = Array.isArray(status.iconSteps)
      ? status.iconSteps
          .map((step) => {
            assertFiniteNumber(step.maxPercent, `${status.id}.iconSteps.maxPercent`);

            return {
              maxPercent: clamp(Math.round(step.maxPercent), 0, 100),
              icon: String(step.icon ?? ""),
            };
          })
          .filter((step) => step.icon.length > 0)
      : undefined;

    return {
      ...status,
      ...(iconSteps ? { iconSteps } : {}),
      value: clamp(Math.round(status.value), 0, Math.max(1, Math.round(status.max))),
      max: Math.max(1, Math.round(status.max)),
    };
  });
  const targetStatus = statuses.find((status) => status.id === payload.statusId);

  if (!targetStatus) {
    throw new Error(`Unknown status: ${payload.statusId}`);
  }

  const from = targetStatus.value;
  const to = clamp(from + Math.round(payload.delta), 0, targetStatus.max);
  const fallbackEvent = {
    statusId: payload.statusId,
    from,
    to,
    delta: to - from,
  };
  const events = Array.isArray(payload.events) && payload.events.length > 0
    ? payload.events.map((event) => {
        const status = statuses.find((candidate) => candidate.id === event.statusId);

        if (!status) {
          throw new Error(`Unknown status: ${event.statusId}`);
        }

        assertFiniteNumber(event.from, `${event.statusId}.from`);
        assertFiniteNumber(event.to, `${event.statusId}.to`);
        assertFiniteNumber(event.delta, `${event.statusId}.delta`);

        const fromValue = clamp(Math.round(event.from), 0, status.max);
        const toValue = clamp(Math.round(event.to), 0, status.max);

        return {
          statusId: event.statusId,
          from: fromValue,
          to: toValue,
          delta: toValue - fromValue,
        };
      })
    : [fallbackEvent];

  return {
    ...payload,
    statuses,
    delta: Math.round(payload.delta),
    scope,
    source,
    events,
    preset: {
      ...payload.preset,
      width: Math.round(payload.preset.width),
      height: Math.round(payload.preset.height),
      fps: Math.round(payload.preset.fps),
      durationMs: Math.round(payload.preset.durationMs),
    },
    event: events[0] ?? fallbackEvent,
  };
}

export async function renderVideo(payload: ExportRequestPayload): Promise<Buffer> {
  const request = normalizeExportRequest(payload);
  return renderWithRemotion(request);
}

export async function renderWebm(payload: ExportRequestPayload): Promise<Buffer> {
  return renderVideo({
    ...payload,
    preset: {
      ...payload.preset,
      format: "webm-alpha",
    },
  });
}
