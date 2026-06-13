export const exportFormats = ["png-sequence", "mov-prores-alpha", "webm-alpha"] as const;

export type ExportFormat = (typeof exportFormats)[number];

export type ExportPreset = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  format: ExportFormat;
};

export const defaultExportPreset: ExportPreset = {
  width: 1080,
  height: 1920,
  fps: 60,
  durationMs: 1600,
  format: "mov-prores-alpha",
};
