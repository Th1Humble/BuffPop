import { defaultExportPreset, type ExportPreset } from "./exportPreset";
import {
  applyStatusDelta,
  cloneStatuses,
  getStatusIconStep,
  getStatusLevel,
  type StatusEvent,
  type StatusItem,
} from "./stateEngine";

export type ExportFrame = {
  index: number;
  progress: number;
  timeMs: number;
};

export type ExportPlan = {
  preset: ExportPreset;
  statuses: StatusItem[];
  event: StatusEvent;
  events: StatusEvent[];
  frames: ExportFrame[];
};

export type ExportCopy = {
  statusLabels: Record<string, string>;
};

export type ExportResult = {
  blob: Blob;
  filename: string;
  mimeType: string;
  savedPath?: string;
};

export type ExportScope = "single" | "all";
export type ExportSource = "current" | "recording";
export type AvatarMood = "happy" | "calm" | "tired" | "hungry";
export type QuestExportState = "start" | "active" | "completed" | "failed";

export type QuestExportConfig = {
  title: string;
  label: string;
  state: QuestExportState;
  holdSeconds: number;
};

export type AvatarExportConfig = {
  mood: AvatarMood;
  size: number;
  label: string;
  tagline?: string;
  imageSrc?: string;
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
};

type ExportFetcher = typeof fetch;
type LoadedAvatarImage = CanvasImageSource & {
  naturalWidth?: number;
  naturalHeight?: number;
  videoWidth?: number;
  videoHeight?: number;
  width?: number;
  height?: number;
};
type AvatarImageLoader = (src: string) => Promise<LoadedAvatarImage>;

const exportPreset: ExportPreset = defaultExportPreset;
const singleExportPreset: ExportPreset = {
  ...defaultExportPreset,
  height: 420,
};
const allExportPreset: ExportPreset = {
  ...defaultExportPreset,
  height: 960,
};
const avatarExportPreset = {
  width: 1080,
  height: 960,
};
const questExportPreset: ExportPreset = {
  ...defaultExportPreset,
  height: 360,
  durationMs: 1800,
  leadInMs: 0,
};
const avatarMoodMap: Record<AvatarMood, { symbol: string; color: string; accent: string }> = {
  happy: { symbol: "😄", color: "#ffcf70", accent: "#ff4f92" },
  calm: { symbol: "🙂", color: "#8ddfc7", accent: "#2f9f83" },
  tired: { symbol: "😴", color: "#b6bcff", accent: "#6f7dff" },
  hungry: { symbol: "😋", color: "#f4a62a", accent: "#d66c28" },
};

const webmMimeTypes = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function clampProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 1);
}

export function buildExportFrames({
  fps,
  durationMs,
}: Pick<ExportPreset, "fps" | "durationMs">): ExportFrame[] {
  const frameCount = Math.round((fps * durationMs) / 1000);

  return Array.from({ length: frameCount + 1 }, (_, index) => ({
    index,
    progress: frameCount === 0 ? 1 : index / frameCount,
    timeMs: Math.round((index / fps) * 1000),
  }));
}

export function presetForExportScope(scope: ExportScope): ExportPreset {
  return scope === "single" ? singleExportPreset : allExportPreset;
}

export function getFrameStatusValue(event: StatusEvent, progress: number): number {
  const clampedProgress = clampProgress(progress);
  return event.from + (event.to - event.from) * clampedProgress;
}

export function formatDeltaBadge(delta: number): string {
  if (delta === 0) {
    return "";
  }

  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function createExportPlan({
  statuses,
  statusId,
  deltaInput,
  event,
  now = Date.now(),
}: {
  statuses: StatusItem[];
  statusId: string;
  deltaInput: string | number;
  event?: StatusEvent;
  now?: number;
}): ExportPlan {
  if (event) {
    return {
      preset: exportPreset,
      statuses: cloneStatuses(statuses),
      event: { ...event },
      events: [{ ...event }],
      frames: buildExportFrames(exportPreset),
    };
  }

  const result = applyStatusDelta(statuses, statusId, deltaInput, now);

  return {
    preset: exportPreset,
    statuses: cloneStatuses(result.statuses),
    event: result.event,
    events: [{ ...result.event }],
    frames: buildExportFrames(exportPreset),
  };
}

export function chooseWebmMimeType(isSupported = MediaRecorder.isTypeSupported): string {
  return webmMimeTypes.find((mimeType) => isSupported(mimeType)) ?? "video/webm";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalizedHex = hex.replace("#", "");
  const value = Number.parseInt(normalizedHex, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDisplayLabel(copy: ExportCopy, status: StatusItem): string {
  return status.customLabel?.trim() || copy.statusLabels[status.id] || status.label;
}

function getRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function renderStatusBar({
  context,
  status,
  copy,
  x,
  y,
  width,
  height,
}: {
  context: CanvasRenderingContext2D;
  status: StatusItem;
  copy: ExportCopy;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const level = getStatusLevel(status);
  const ratio = status.max > 0 ? status.value / status.max : 0;
  const fillWidth = Math.max(0, Math.min(width - 132, (width - 132) * ratio));
  const iconStep = getStatusIconStep(status).maxPercent;

  context.save();
  context.shadowColor = colorWithAlpha(status.color, level === "full" ? 0.62 : 0.28);
  context.shadowBlur = level === "empty" ? 0 : 24;
  getRoundedRectPath(context, x, y, width, height, 22);
  context.fillStyle = "rgba(18, 18, 18, 0.76)";
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle =
    level === "empty" ? "rgba(255,255,255,0.14)" : colorWithAlpha(status.color, 0.72);
  context.lineWidth = 3;
  context.stroke();

  getRoundedRectPath(context, x + 24, y + 20, 86, 86, 18);
  context.fillStyle = colorWithAlpha(status.color, level === "empty" ? 0.34 : 0.9);
  context.fill();
  context.fillStyle = "#151515";
  context.font = "700 34px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${iconStep}`, x + 67, y + 63);

  context.textAlign = "left";
  context.fillStyle = "rgba(255, 250, 242, 0.94)";
  context.font = "800 32px Inter, system-ui, sans-serif";
  context.fillText(getDisplayLabel(copy, status), x + 134, y + 44);

  context.textAlign = "right";
  context.fillStyle = "#fff2d6";
  context.font = "800 28px Inter, system-ui, sans-serif";
  context.fillText(`${status.value}/${status.max}`, x + width - 26, y + 44);

  const trackX = x + 134;
  const trackY = y + 72;
  const trackWidth = width - 162;
  const trackHeight = 22;

  getRoundedRectPath(context, trackX, trackY, trackWidth, trackHeight, 11);
  context.fillStyle = "rgba(255,255,255,0.12)";
  context.fill();

  if (fillWidth > 0) {
    getRoundedRectPath(context, trackX, trackY, fillWidth, trackHeight, 11);
    context.fillStyle = status.color;
    context.fill();
  }

  if (level === "empty") {
    context.globalAlpha = 0.45;
  }

  context.restore();
}

export function renderExportFrame({
  canvas,
  plan,
  frame,
  copy,
}: {
  canvas: HTMLCanvasElement;
  plan: ExportPlan;
  frame: ExportFrame;
  copy: ExportCopy;
}) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const { width, height } = plan.preset;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);

  const frameStatuses = plan.statuses.map((status) =>
    status.id === plan.event.statusId
      ? { ...status, value: Math.round(getFrameStatusValue(plan.event, frame.progress)) }
      : status,
  );

  frameStatuses.forEach((status, index) => {
    renderStatusBar({
      context,
      status,
      copy,
      x: 72,
      y: 128 + index * 148,
      width: width - 144,
      height: 112,
    });
  });
}

function fillCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fillStyle: string | CanvasGradient,
) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = fillStyle;
  context.fill();
}

function loadAvatarImage(src: string): Promise<LoadedAvatarImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Avatar image failed to load."));
    image.src = src;
  });
}

function getAvatarImageSize(image: LoadedAvatarImage): { width: number; height: number } {
  const width =
    image.naturalWidth || image.videoWidth || (typeof image.width === "number" ? image.width : 0);
  const height =
    image.naturalHeight ||
    image.videoHeight ||
    (typeof image.height === "number" ? image.height : 0);

  return {
    width: width > 0 ? width : 1,
    height: height > 0 ? height : 1,
  };
}

function drawCoverImage({
  context,
  image,
  x,
  y,
  width,
  height,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
}: {
  context: CanvasRenderingContext2D;
  image: LoadedAvatarImage;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}) {
  const source = getAvatarImageSize(image);
  const coverScale = Math.max(width / source.width, height / source.height);
  const sourceWidth = width / coverScale;
  const sourceHeight = height / coverScale;
  const sourceX = (source.width - sourceWidth) / 2;
  const sourceY = (source.height - sourceHeight) / 2;
  const imageScale = Math.min(Math.max(scale, 1), 2.4);
  const scaledWidth = width * imageScale;
  const scaledHeight = height * imageScale;
  const destinationX = x - (scaledWidth - width) / 2 + (width * offsetX) / 100;
  const destinationY = y - (scaledHeight - height) / 2 + (height * offsetY) / 100;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destinationX,
    destinationY,
    scaledWidth,
    scaledHeight,
  );
}

export async function exportAvatarToPng({
  canvas,
  config,
  imageLoader = loadAvatarImage,
}: {
  canvas: HTMLCanvasElement;
  config: AvatarExportConfig;
  imageLoader?: AvatarImageLoader;
}): Promise<ExportResult> {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const mood = avatarMoodMap[config.mood] ?? avatarMoodMap.happy;
  const { width, height } = avatarExportPreset;
  const portraitSize = Math.min(Math.max(Math.round(config.size), 160), 320);
  const panelWidth = 936;
  const panelHeight = 190;
  const panelX = 72;
  const panelY = 650;
  const portraitX = panelX + 34;
  const portraitY = panelY + 28;
  const portraitCenterX = portraitX + 62;
  const portraitCenterY = portraitY + 62;

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.save();

  const glow = context.createRadialGradient(
    portraitCenterX,
    portraitCenterY,
    18,
    portraitCenterX,
    portraitCenterY,
    portraitSize * 0.58,
  );
  glow.addColorStop(0, `${mood.color}ee`);
  glow.addColorStop(1, `${mood.accent}00`);
  fillCircle(context, portraitCenterX, portraitCenterY, portraitSize * 0.44, glow);

  getRoundedRectPath(context, panelX, panelY, panelWidth, panelHeight, 22);
  context.fillStyle = "rgba(16,16,17,0.82)";
  context.fill();
  context.strokeStyle = mood.accent;
  context.lineWidth = 3;
  context.stroke();

  getRoundedRectPath(context, portraitX, portraitY, 124, 124, 18);
  context.fillStyle = mood.color;
  context.fill();

  if (config.imageSrc) {
    const image = await imageLoader(config.imageSrc);

    context.save();
    getRoundedRectPath(context, portraitX, portraitY, 124, 124, 18);
    context.clip();
    drawCoverImage({
      context,
      image,
      x: portraitX,
      y: portraitY,
      width: 124,
      height: 124,
      scale: config.imageScale,
      offsetX: config.imageOffsetX,
      offsetY: config.imageOffsetY,
    });
    context.restore();
  } else {
    context.fillStyle = "#171514";
    context.font = "64px \"Apple Color Emoji\", \"Segoe UI Emoji\", sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(mood.symbol, portraitCenterX, portraitCenterY + 2);
  }

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "rgba(255, 250, 242, 0.94)";
  context.font = "900 42px Inter, system-ui, sans-serif";
  context.fillText(config.label.trim() || "角色", 218, 726);

  const tagline = config.tagline?.trim() || "PLAYER HUD";

  if (tagline.length > 0) {
    context.fillStyle = "rgba(255, 250, 242, 0.62)";
    context.font = "800 18px Inter, system-ui, sans-serif";
    context.fillText(tagline, 218, 786);
  }

  context.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error("Avatar PNG export failed."));
        return;
      }

      resolve(nextBlob);
    }, "image/png");
  });

  return {
    blob,
    filename: "buffpop-avatar.png",
    mimeType: blob.type || "image/png",
  };
}

function waitForTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function filenameForFormat(format: ExportPreset["format"]): string {
  if (format === "mov-prores-alpha") {
    return "buffpop-overlay.mov";
  }

  if (format === "webm-alpha") {
    return "buffpop-overlay.webm";
  }

  return "buffpop-overlay.zip";
}

function fallbackMimeTypeForFormat(format: ExportPreset["format"]): string {
  return format === "mov-prores-alpha" ? "video/quicktime" : "video/webm";
}

function getSavedPathFromResponse(response: Response): string | undefined {
  const encodedPath = response.headers.get("x-buffpop-saved-path");

  if (!encodedPath) {
    return undefined;
  }

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

function questDurationMs(holdSeconds: number): number {
  return Math.round(Math.min(Math.max(holdSeconds, 0.6), 5) * 1000);
}

export async function exportQuestToVideo({
  config,
  fetcher = fetch,
}: {
  config: QuestExportConfig;
  fetcher?: ExportFetcher;
}): Promise<ExportResult> {
  const preset = {
    ...questExportPreset,
    durationMs: questDurationMs(config.holdSeconds),
  };

  const response = await fetcher("http://127.0.0.1:5190/export/video", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      kind: "quest",
      quest: {
        title: config.title,
        label: config.label,
        state: config.state,
      },
      preset,
    }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorPayload?.message ?? "Quest video export failed.");
  }

  const blob = await response.blob();

  return {
    blob,
    filename: preset.format === "mov-prores-alpha" ? "buffpop-quest.mov" : "buffpop-quest.webm",
    mimeType: blob.type || fallbackMimeTypeForFormat(preset.format),
    savedPath: getSavedPathFromResponse(response),
  };
}

export async function exportPlanToVideo({
  plan,
  copy: _copy,
  scope = "all",
  source = "current",
  events = plan.events,
  fetcher = fetch,
}: {
  plan: ExportPlan;
  copy: ExportCopy;
  scope?: ExportScope;
  source?: ExportSource;
  events?: StatusEvent[];
  fetcher?: ExportFetcher;
}): Promise<ExportResult> {
  const preset = presetForExportScope(scope);
  const exportEvents = events.length > 0 ? events : plan.events;

  const response = await fetcher("http://127.0.0.1:5190/export/video", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      statuses: plan.statuses.map((status) => ({
        id: status.id,
        label: status.label,
        customLabel: status.customLabel,
        icon: status.icon,
        iconSteps: status.iconSteps,
        value: status.id === plan.event.statusId ? plan.event.from : status.value,
        max: status.max,
        color: status.color,
      })),
      statusId: plan.event.statusId,
      delta: plan.event.requestedDelta,
      scope,
      source,
      events: exportEvents.map((event) => ({
        statusId: event.statusId,
        from: event.from,
        to: event.to,
        delta: event.appliedDelta,
        deltaLabel: formatDeltaBadge(event.appliedDelta),
      })),
      preset,
    }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorPayload?.message ?? "Video export failed.");
  }

  const blob = await response.blob();

  return {
    blob,
    filename: filenameForFormat(preset.format),
    mimeType: blob.type || fallbackMimeTypeForFormat(preset.format),
    savedPath: getSavedPathFromResponse(response),
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function shouldUseBrowserDownload(result: ExportResult): boolean {
  return !result.savedPath;
}
