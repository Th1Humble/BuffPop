export type Language = "zh-CN" | "en-US";

export type LanguageOption = {
  id: Language;
  label: string;
};

export type AppCopy = {
  appTitle: string;
  canvasSize: string;
  languageLabel: string;
  previewLabel: string;
  controlsLabel: string;
  operationEyebrow: string;
  operationTitle: string;
  statusItemLabel: string;
  customLabelLabel: string;
  customLabelHint: string;
  defaultValueLabel: string;
  currentLabel: string;
  deltaLabel: string;
  deltaHint: string;
  generateButton: string;
  currentValuesTitle: string;
  resetButton: string;
  exportTitle: string;
  exportHint: string;
  exportScopeLabel: string;
  exportScopeSingle: string;
  exportScopeSingleHint: string;
  exportScopeAll: string;
  exportScopeAllHint: string;
  exportSourceLabel: string;
  exportSourceCurrent: string;
  exportSourceCurrentHint: string;
  exportSourceRecording: string;
  exportSourceRecordingHint: string;
  startRecordingButton: string;
  confirmRecordingButton: string;
  cancelRecordingButton: string;
  recordingActiveLabel: string;
  recordingReadyLabel: string;
  recordingEmptyLabel: string;
  exportButton: string;
  exportingLabel: string;
  exportReadyLabel: string;
  historyTitle: string;
  emptyHistory: string;
  statusLabels: Record<string, string>;
  errors: {
    generic: string;
    wholeNumber: string;
    nonZeroDelta: string;
    unknownStatus: string;
  };
};

export const defaultLanguage: Language = "zh-CN";

export const languages: LanguageOption[] = [
  { id: "zh-CN", label: "中文" },
  { id: "en-US", label: "English" },
];

const copies: Record<Language, AppCopy> = {
  "zh-CN": {
    appTitle: "状态叠层生成器",
    canvasSize: "1080 x 1920",
    languageLabel: "语言",
    previewLabel: "动画预览",
    controlsLabel: "状态控制",
    operationEyebrow: "操作",
    operationTitle: "生成状态变化",
    statusItemLabel: "状态项目",
    customLabelLabel: "自定义文案",
    customLabelHint: "留空会使用当前语言的默认文案。",
    defaultValueLabel: "默认数值",
    currentLabel: "当前",
    deltaLabel: "变化值",
    deltaHint: "输入带符号的数值，比如 +5、-20 或 35。BuffPop 会计算下一段数值，并限制在状态范围内。",
    generateButton: "生成动画",
    currentValuesTitle: "当前数值",
    resetButton: "重置",
    exportTitle: "导出视频",
    exportHint: "导出透明 MOV ProRes 4444 叠层，适合放到剪辑软件里作为上层素材使用。",
    exportScopeLabel: "导出范围",
    exportScopeSingle: "单条",
    exportScopeSingleHint: "只导出当前选择项的加减点动画。",
    exportScopeAll: "全部状态",
    exportScopeAllHint: "导出完整 HUD，只有当前选择项发生变化。",
    exportSourceLabel: "变化来源",
    exportSourceCurrent: "当前输入",
    exportSourceCurrentHint: "使用当前选择项和变化值生成一次动画。",
    exportSourceRecording: "操作记录",
    exportSourceRecordingHint: "导出确认记录里的所有状态变化。",
    startRecordingButton: "开始记录",
    confirmRecordingButton: "确认记录",
    cancelRecordingButton: "取消记录",
    recordingActiveLabel: "记录中，继续操作后点确认。",
    recordingReadyLabel: "已确认记录片段",
    recordingEmptyLabel: "还没有确认的记录片段。",
    exportButton: "导出 MOV",
    exportingLabel: "正在导出...",
    exportReadyLabel: "已生成 buffpop-overlay.mov",
    historyTitle: "动画记录",
    emptyHistory: "还没有记录。",
    statusLabels: {
      mood: "心情",
      fatigue: "疲劳",
      hunger: "饥饿",
    },
    errors: {
      generic: "暂时无法生成动画。",
      wholeNumber: "请输入整数，比如 +5 或 -20。",
      nonZeroDelta: "变化值不能为 0。",
      unknownStatus: "找不到这个状态项目。",
    },
  },
  "en-US": {
    appTitle: "Status overlay builder",
    canvasSize: "1080 x 1920",
    languageLabel: "Language",
    previewLabel: "Animation preview",
    controlsLabel: "Status controls",
    operationEyebrow: "Operation",
    operationTitle: "Pop a status change",
    statusItemLabel: "Status item",
    customLabelLabel: "Custom label",
    customLabelHint: "Leave blank to use the default label for the current language.",
    defaultValueLabel: "Default value",
    currentLabel: "Current",
    deltaLabel: "Change amount",
    deltaHint:
      "Use signed values like +5, -20, or 35. BuffPop calculates the next value and clamps it to the selected status range.",
    generateButton: "Generate Animation",
    currentValuesTitle: "Current values",
    resetButton: "Reset",
    exportTitle: "Export video",
    exportHint:
      "Exports a transparent MOV ProRes 4444 overlay for use as an upper layer in editing software.",
    exportScopeLabel: "Export scope",
    exportScopeSingle: "Single row",
    exportScopeSingleHint: "Export only the selected status change.",
    exportScopeAll: "Full HUD",
    exportScopeAllHint: "Export every status while only the selected row changes.",
    exportSourceLabel: "Change source",
    exportSourceCurrent: "Current input",
    exportSourceCurrentHint: "Use the selected status and current change value.",
    exportSourceRecording: "Recorded segment",
    exportSourceRecordingHint: "Export every confirmed status change in the segment.",
    startRecordingButton: "Start recording",
    confirmRecordingButton: "Confirm segment",
    cancelRecordingButton: "Cancel recording",
    recordingActiveLabel: "Recording. Apply changes, then confirm.",
    recordingReadyLabel: "Confirmed recorded segment",
    recordingEmptyLabel: "No confirmed recorded segment yet.",
    exportButton: "Export MOV",
    exportingLabel: "Exporting...",
    exportReadyLabel: "Generated buffpop-overlay.mov",
    historyTitle: "Animation events",
    emptyHistory: "No events yet.",
    statusLabels: {
      mood: "Mood",
      fatigue: "Fatigue",
      hunger: "Hunger",
    },
    errors: {
      generic: "Could not generate animation.",
      wholeNumber: "Enter a whole number such as +5 or -20.",
      nonZeroDelta: "Delta cannot be 0.",
      unknownStatus: "Unknown status item.",
    },
  },
};

export function getCopy(language: Language): AppCopy {
  return copies[language] ?? copies[defaultLanguage];
}

export function getStatusLabel(
  copy: AppCopy,
  statusId: string,
  fallback: string,
  customLabel = "",
): string {
  const normalizedCustomLabel = customLabel.trim();

  if (normalizedCustomLabel.length > 0) {
    return normalizedCustomLabel;
  }

  return copy.statusLabels[statusId] ?? fallback;
}

export function getEngineErrorMessage(copy: AppCopy, messageKey: string): string {
  const errorKey = messageKey.replace(/^errors\./, "") as keyof AppCopy["errors"];
  return copy.errors[errorKey] ?? copy.errors.generic;
}
