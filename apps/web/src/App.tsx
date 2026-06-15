import type { ClipboardEvent, CSSProperties, DragEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultExportPreset } from "./exportPreset";
import {
  type AvatarExportConfig,
  type AvatarMood,
  createExportPlan,
  downloadBlob,
  exportAvatarToPng,
  exportPlanToVideo,
  exportQuestToVideo,
  formatDeltaBadge,
  shouldUseBrowserDownload,
  type ExportSource,
  type ExportScope,
  type ExportResult,
} from "./exportEngine";
import {
  defaultLanguage,
  getCopy,
  getEngineErrorMessage,
  getStatusLabel,
  languages,
  type AppCopy,
  type Language,
} from "./i18n";
import {
  applyStatusDelta,
  buildRecordedStatusEvents,
  cloneStatuses,
  formatDelta,
  getStatusIcon,
  getStatusLevel,
  initialStatuses,
  parseDelta,
  setStatusCustomLabel,
  setStatusValue,
  StatusEngineError,
  StatusEvent,
  StatusItem,
} from "./stateEngine";

const animationDurationMs = defaultExportPreset.durationMs;
const animationLeadInMs = defaultExportPreset.leadInMs;
const avatarMoodOptions: Array<{ id: AvatarMood; label: string; symbol: string }> = [
  { id: "happy", label: "开心", symbol: "😄" },
  { id: "calm", label: "平静", symbol: "🙂" },
  { id: "tired", label: "疲惫", symbol: "😴" },
  { id: "hungry", label: "饥饿", symbol: "😋" },
];
type DisplayStatusItem = StatusItem & {
  renderValue?: number;
};
type QuestState = "start" | "active" | "completed" | "failed";

type QuestConfig = {
  title: string;
  state: QuestState;
  holdSeconds: number;
};

const questStateCopy: Record<QuestState, { label: string }> = {
  start: { label: "MISSION START" },
  active: { label: "MISSION ACTIVE" },
  completed: { label: "MISSION COMPLETE" },
  failed: { label: "MISSION FAILED" },
};

function renderValueOf(status: DisplayStatusItem): number {
  return status.renderValue ?? status.value;
}

function percentFor(status: DisplayStatusItem): number {
  return (renderValueOf(status) / status.max) * 100;
}

function HudBar({
  status,
  isActive,
  copy,
  activeEvent,
  activePopEventId,
}: {
  status: DisplayStatusItem;
  isActive: boolean;
  copy: AppCopy;
  activeEvent?: StatusEvent;
  activePopEventId?: string | null;
}) {
  const level = getStatusLevel(status);
  const barStyle = { "--bar-color": status.color } as CSSProperties & {
    "--bar-color": string;
  };
  const label = getStatusLabel(copy, status.id, status.label, status.customLabel);
  const deltaLabel =
    activeEvent?.statusId === status.id && activeEvent.id === activePopEventId
      ? formatDeltaBadge(activeEvent.appliedDelta)
      : "";

  return (
    <article
      className={`hud-bar hud-bar--${level} ${isActive ? "is-active" : ""}`}
      style={barStyle}
    >
      <div className="hud-icon">
        <img src={getStatusIcon(status)} alt="" aria-hidden="true" />
        <span>{status.icon}</span>
      </div>
      <div className="hud-content">
        <div className="hud-meta">
          <span>{label}</span>
          <div className="hud-value-wrap">
            {deltaLabel && activeEvent ? (
              <span className="delta-pop" key={activeEvent.id}>
                {deltaLabel}
              </span>
            ) : null}
            <strong>
              {status.value}/{status.max}
            </strong>
          </div>
        </div>
        <div className="meter-track" aria-hidden="true">
          <div className="meter-fill" style={{ width: `${percentFor(status)}%` }} />
          {level === "full" ? <div className="meter-sheen" /> : null}
        </div>
      </div>
    </article>
  );
}

function AvatarHudPanel({ config }: { config: AvatarExportConfig }) {
  const mood = avatarMoodOptions.find((option) => option.id === config.mood) ?? avatarMoodOptions[0];
  const tagline = config.tagline?.trim() || "PLAYER HUD";
  const taglineParts = tagline.split(/\s+/).slice(0, 3);
  const panelStyle = {
    "--avatar-size": `${config.size}px`,
    "--avatar-scale": `${config.imageScale ?? 1}`,
    "--avatar-x": `${config.imageOffsetX ?? 0}%`,
    "--avatar-y": `${config.imageOffsetY ?? 0}%`,
  } as CSSProperties;
  const hasImage = Boolean(config.imageSrc);

  return (
    <section
      className={`avatar-hud-panel avatar-hud-panel--${config.mood}`}
      style={panelStyle}
      aria-label="头像 HUD"
    >
      <div className={`avatar-hud-portrait ${hasImage ? "has-image" : ""}`}>
        {config.imageSrc ? (
          <img src={config.imageSrc} alt="" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">{mood.symbol}</span>
        )}
      </div>
      <div className="avatar-hud-body">
        <div className="avatar-hud-meta">
          <span>{config.label.trim() || "角色"}</span>
        </div>
        <div className="avatar-hud-tags" aria-hidden="true">
          {taglineParts.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuestHudPanel({
  config,
  animationKey,
}: {
  config: QuestConfig;
  animationKey: number;
}) {
  const state = questStateCopy[config.state];
  const questDurationSeconds = Math.min(Math.max(config.holdSeconds, 0.6), 5);
  const questStyle = {
    "--quest-duration": `${questDurationSeconds}s`,
  } as CSSProperties;

  return (
    <section
      className={`quest-hud-panel quest-hud-panel--${config.state}`}
      key={animationKey}
      style={questStyle}
      aria-label="任务 HUD"
    >
      <span>{state.label}</span>
      <strong>{config.title.trim() || "未命名任务"}</strong>
    </section>
  );
}

function applyDisplayValue(
  statuses: StatusItem[],
  statusId: string,
  renderValue: number,
): StatusItem[] {
  const value = Math.round(renderValue);

  return statuses.map((status) =>
    status.id === statusId ? { ...status, value, renderValue } : status,
  );
}

function easeLinear(progress: number): number {
  return Math.min(Math.max(progress, 0), 1);
}

function App() {
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [statuses, setStatuses] = useState(() => cloneStatuses(initialStatuses));
  const [displayStatuses, setDisplayStatuses] = useState(() => cloneStatuses(initialStatuses));
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [selectedStatusId, setSelectedStatusId] = useState(initialStatuses[0].id);
  const [deltaInput, setDeltaInput] = useState("+5");
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportScope, setExportScope] = useState<ExportScope>("single");
  const [exportSource, setExportSource] = useState<ExportSource>("current");
  const [recordingStartStatuses, setRecordingStartStatuses] = useState<StatusItem[] | null>(null);
  const [recordingEvents, setRecordingEvents] = useState<StatusEvent[]>([]);
  const [confirmedRecordingEvents, setConfirmedRecordingEvents] = useState<StatusEvent[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [activePopEventId, setActivePopEventId] = useState<string | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarExportConfig>({
    mood: "happy",
    size: 220,
    label: "阿年",
    tagline: "PLAYER HUD",
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0,
  });
  const [avatarImageName, setAvatarImageName] = useState("");
  const [avatarResult, setAvatarResult] = useState<ExportResult | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [questResult, setQuestResult] = useState<ExportResult | null>(null);
  const [questError, setQuestError] = useState("");
  const [isQuestExporting, setIsQuestExporting] = useState(false);
  const [questConfig, setQuestConfig] = useState<QuestConfig>({
    title: "剪完昨晚 Vlog",
    state: "start",
    holdSeconds: 1.8,
  });
  const [questAnimationKey, setQuestAnimationKey] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastEvent = events[0];
  const copy = useMemo(() => getCopy(language), [language]);
  const selectedStatus = useMemo(
    () => statuses.find((status) => status.id === selectedStatusId) ?? statuses[0],
    [selectedStatusId, statuses],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  function animateStatus(event: StatusEvent, nextStatuses: StatusItem[]) {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setActivePopEventId(null);

    const startedAt = performance.now();
    let hasActivatedPop = false;

    const tick = (now: number) => {
      const elapsedMs = now - startedAt;
      const progress = easeLinear((elapsedMs - animationLeadInMs) / animationDurationMs);
      const renderValue = event.from + (event.to - event.from) * progress;
      setDisplayStatuses(applyDisplayValue(nextStatuses, event.statusId, renderValue));

      if (!hasActivatedPop && elapsedMs >= animationLeadInMs) {
        hasActivatedPop = true;
        setActivePopEventId(event.id);
      }

      if (elapsedMs < animationLeadInMs + animationDurationMs) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      animationFrameRef.current = null;
      setActivePopEventId(null);
      setDisplayStatuses(cloneStatuses(nextStatuses));
    };

    setDisplayStatuses(applyDisplayValue(nextStatuses, event.statusId, event.from));
    animationFrameRef.current = requestAnimationFrame(tick);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const result = applyStatusDelta(statuses, selectedStatusId, deltaInput);
      setStatuses(result.statuses);
      setEvents((currentEvents) => [result.event, ...currentEvents].slice(0, 8));
      if (recordingStartStatuses) {
        setRecordingEvents((currentEvents) => [...currentEvents, result.event]);
      }
      animateStatus(result.event, result.statuses);
    } catch (caught) {
      if (caught instanceof StatusEngineError) {
        setError(getEngineErrorMessage(copy, caught.messageKey));
        return;
      }

      setError(caught instanceof Error ? caught.message : copy.errors.generic);
    }
  }

  function getReusableExportEvent(): StatusEvent | undefined {
    const requestedDelta = parseDelta(deltaInput);

    if (
      lastEvent?.statusId === selectedStatusId &&
      lastEvent.requestedDelta === requestedDelta
    ) {
      return lastEvent;
    }

    return undefined;
  }

  async function handleExport() {
    setExportError("");
    setExportResult(null);
    setIsExporting(true);

    try {
      const sourceEvents =
        exportSource === "recording" ? confirmedRecordingEvents : [];

      if (exportSource === "recording" && sourceEvents.length === 0) {
        setExportError(copy.recordingEmptyLabel);
        return;
      }

      const reusableEvent = getReusableExportEvent();
      const recordingEvent = sourceEvents[0];
      const plan = createExportPlan({
        statuses,
        statusId: recordingEvent?.statusId ?? selectedStatusId,
        deltaInput: recordingEvent?.appliedDelta ?? deltaInput,
        event: recordingEvent ?? reusableEvent,
      });
      const result = await exportPlanToVideo({
        plan,
        copy,
        scope: exportScope,
        source: exportSource,
        events: exportSource === "recording" ? sourceEvents : undefined,
      });
      setExportResult(result);
      if (shouldUseBrowserDownload(result)) {
        downloadBlob(result.blob, result.filename);
      }
    } catch (caught) {
      if (caught instanceof StatusEngineError) {
        setExportError(getEngineErrorMessage(copy, caught.messageKey));
        return;
      }

      setExportError(caught instanceof Error ? caught.message : copy.errors.generic);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleAvatarExport() {
    setAvatarError("");
    setAvatarResult(null);

    try {
      const canvas = document.createElement("canvas");
      const result = await exportAvatarToPng({ canvas, config: avatarConfig });
      setAvatarResult(result);
      downloadBlob(result.blob, result.filename);
    } catch (caught) {
      setAvatarError(caught instanceof Error ? caught.message : copy.errors.generic);
    }
  }

  async function handleQuestExport() {
    setQuestError("");
    setQuestResult(null);
    setIsQuestExporting(true);

    try {
      const result = await exportQuestToVideo({
        config: {
          title: questConfig.title.trim() || "未命名任务",
          label: questStateCopy[questConfig.state].label,
          state: questConfig.state,
          holdSeconds: questConfig.holdSeconds,
        },
      });
      setQuestResult(result);
      if (shouldUseBrowserDownload(result)) {
        downloadBlob(result.blob, result.filename);
      }
    } catch (caught) {
      setQuestError(caught instanceof Error ? caught.message : copy.errors.generic);
    } finally {
      setIsQuestExporting(false);
    }
  }

  function readAvatarImageFile(file?: File | null) {
    if (!file) {
      return;
    }

    setAvatarImageName(file.name);
    setAvatarError("");
    setAvatarResult(null);

    if (!file.type.startsWith("image/")) {
      setAvatarImageName("");
      setAvatarError("请选择图片文件。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setAvatarError("头像图片读取失败。");
        return;
      }

      setAvatarConfig((current) => ({
        ...current,
        imageSrc: reader.result as string,
        imageScale: current.imageScale ?? 1,
        imageOffsetX: current.imageOffsetX ?? 0,
        imageOffsetY: current.imageOffsetY ?? 0,
      }));
    };
    reader.onerror = () => {
      setAvatarError("头像图片读取失败。");
    };
    reader.readAsDataURL(file);
  }

  function handleAvatarDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleAvatarDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    readAvatarImageFile(event.dataTransfer.files[0]);
  }

  function handleAvatarPaste(event: ClipboardEvent<HTMLDivElement>) {
    readAvatarImageFile(
      Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/")),
    );
  }

  function replayQuestNotice() {
    setQuestAnimationKey((current) => current + 1);
  }

  function startRecording() {
    setRecordingStartStatuses(cloneStatuses(statuses));
    setRecordingEvents([]);
    setConfirmedRecordingEvents([]);
    setExportSource("recording");
    setExportError("");
    setExportResult(null);
  }

  function confirmRecording() {
    if (!recordingStartStatuses || recordingEvents.length === 0) {
      setExportError(copy.recordingEmptyLabel);
      return;
    }

    const nextRecordingEvents = buildRecordedStatusEvents({
      startStatuses: recordingStartStatuses,
      endStatuses: statuses,
      events: recordingEvents,
    });

    setConfirmedRecordingEvents(nextRecordingEvents);
    setRecordingStartStatuses(null);
    setRecordingEvents([]);
    setExportSource("recording");
    setExportError(nextRecordingEvents.length === 0 ? copy.recordingEmptyLabel : "");
  }

  function cancelRecording() {
    setRecordingStartStatuses(null);
    setRecordingEvents([]);
    setExportError("");
  }

  function handleCustomLabelChange(statusId: string, customLabel: string) {
    const nextStatuses = setStatusCustomLabel(statuses, statusId, customLabel);
    setStatuses(nextStatuses);
    setDisplayStatuses((currentDisplayStatuses) =>
      setStatusCustomLabel(currentDisplayStatuses, statusId, customLabel),
    );
  }

  function handleDefaultValueChange(statusId: string, value: string) {
    try {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      setActivePopEventId(null);
      const nextStatuses = setStatusValue(statuses, statusId, value);
      setStatuses(nextStatuses);
      setDisplayStatuses(cloneStatuses(nextStatuses));
      setError("");
      setExportResult(null);
    } catch (caught) {
      if (caught instanceof StatusEngineError) {
        setError(getEngineErrorMessage(copy, caught.messageKey));
        return;
      }

      setError(caught instanceof Error ? caught.message : copy.errors.generic);
    }
  }

  function resetWorkspace() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setActivePopEventId(null);
    const resetStatuses = cloneStatuses(initialStatuses);
    setStatuses(resetStatuses);
    setDisplayStatuses(cloneStatuses(resetStatuses));
    setEvents([]);
    setSelectedStatusId(initialStatuses[0].id);
    setDeltaInput("+5");
    setExportScope("single");
    setExportSource("current");
    setAvatarConfig({
      mood: "happy",
      size: 220,
      label: "阿年",
      tagline: "PLAYER HUD",
      imageScale: 1,
      imageOffsetX: 0,
      imageOffsetY: 0,
    });
    setAvatarImageName("");
    setQuestConfig({
      title: "剪完昨晚 Vlog",
      state: "start",
      holdSeconds: 1.8,
    });
    setQuestAnimationKey((current) => current + 1);
    setRecordingStartStatuses(null);
    setRecordingEvents([]);
    setConfirmedRecordingEvents([]);
    setError("");
    setExportError("");
    setExportResult(null);
    setAvatarError("");
    setAvatarResult(null);
    setQuestError("");
    setQuestResult(null);
  }

  return (
    <main className="app-shell">
      <section className="preview-panel" aria-label={copy.previewLabel}>
        <div className="topbar">
          <div>
            <p className="eyebrow">BuffPop</p>
            <h1>{copy.appTitle}</h1>
          </div>
          <div className="topbar-actions">
            <label className="language-switch" htmlFor="language-select">
              <span>{copy.languageLabel}</span>
              <select
                id="language-select"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {languages.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="canvas-size">1080 x 960</div>
          </div>
        </div>

        <div className="phone-stage">
          <div className="stage-grid" aria-hidden="true" />
          <div className="hud-stack">
            {displayStatuses.map((status) => (
              <HudBar
                key={status.id}
                status={status}
                isActive={lastEvent?.statusId === status.id}
                copy={copy}
                activeEvent={lastEvent}
                activePopEventId={activePopEventId}
              />
            ))}
          </div>
          <div className="avatar-layer">
            <div className="avatar-layer-title" aria-hidden="true">
              头像
            </div>
            <AvatarHudPanel config={avatarConfig} />
            <div className="quest-layer">
              <QuestHudPanel config={questConfig} animationKey={questAnimationKey} />
            </div>
          </div>
        </div>

        <form className="delta-form hud-action-form" onSubmit={handleSubmit}>
          <div className="form-header">
            <p className="eyebrow">{copy.operationEyebrow}</p>
            <h2>{copy.operationTitle}</h2>
          </div>

          <label htmlFor="status-select">{copy.statusItemLabel}</label>
          <select
            id="status-select"
            name="status"
            value={selectedStatusId}
            onChange={(event) => setSelectedStatusId(event.target.value)}
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {getStatusLabel(copy, status.id, status.label, status.customLabel)}
              </option>
            ))}
          </select>

          <div className="current-readout">
            <span>{copy.currentLabel}</span>
            <strong>
              {selectedStatus.value}/{selectedStatus.max}
            </strong>
          </div>

          <label htmlFor="delta-input">{copy.deltaLabel}</label>
          <input
            id="delta-input"
            name="delta"
            inputMode="numeric"
            value={deltaInput}
            autoComplete="off"
            onChange={(event) => setDeltaInput(event.target.value)}
          />

          <p className="hint">{copy.deltaHint}</p>

          <button type="submit">{copy.generateButton}</button>
          <p className="form-error" role="alert">
            {error}
          </p>
        </form>
      </section>

      <aside className="control-panel" aria-label={copy.controlsLabel}>
        <section className="status-editor" aria-label={copy.currentValuesTitle}>
          <div className="section-title">
            <h2>{copy.currentValuesTitle}</h2>
            <button className="ghost-button" type="button" onClick={resetWorkspace}>
              {copy.resetButton}
            </button>
          </div>
          <div className="status-list">
            {statuses.map((status) => (
              <div className={`status-row status-row--${getStatusLevel(status)}`} key={status.id}>
                <div className="status-row-main">
                  <span className="status-dot" style={{ background: status.color }} />
                  <span>{getStatusLabel(copy, status.id, status.label, status.customLabel)}</span>
                  <strong>
                    {status.value}/{status.max}
                  </strong>
                </div>
                <label className="custom-label-field" htmlFor={`custom-label-${status.id}`}>
                  <span>{copy.customLabelLabel}</span>
                  <input
                    id={`custom-label-${status.id}`}
                    value={status.customLabel ?? ""}
                    placeholder={getStatusLabel(copy, status.id, status.label)}
                    autoComplete="off"
                    onChange={(event) =>
                      handleCustomLabelChange(status.id, event.target.value)
                    }
                  />
                </label>
                <label className="default-value-field" htmlFor={`default-value-${status.id}`}>
                  <span>{copy.defaultValueLabel}</span>
                  <input
                    id={`default-value-${status.id}`}
                    type="number"
                    min={0}
                    max={status.max}
                    step={1}
                    value={status.value}
                    onChange={(event) =>
                      handleDefaultValueChange(status.id, event.target.value)
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="export-panel" aria-label={copy.exportTitle}>
          <div className="section-title">
            <h2>{copy.exportTitle}</h2>
          </div>
          <p className="hint">{copy.exportHint}</p>
          <div className="export-scope" role="radiogroup" aria-label={copy.exportScopeLabel}>
            <label className={`scope-option ${exportScope === "single" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="export-scope"
                value="single"
                checked={exportScope === "single"}
                onChange={() => setExportScope("single")}
              />
              <span>
                <strong>{copy.exportScopeSingle}</strong>
                <em>{copy.exportScopeSingleHint}</em>
              </span>
            </label>
            <label className={`scope-option ${exportScope === "all" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="export-scope"
                value="all"
                checked={exportScope === "all"}
                onChange={() => setExportScope("all")}
              />
              <span>
                <strong>{copy.exportScopeAll}</strong>
                <em>{copy.exportScopeAllHint}</em>
              </span>
            </label>
          </div>
          <div className="export-scope" role="radiogroup" aria-label={copy.exportSourceLabel}>
            <label className={`scope-option ${exportSource === "current" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="export-source"
                value="current"
                checked={exportSource === "current"}
                onChange={() => setExportSource("current")}
              />
              <span>
                <strong>{copy.exportSourceCurrent}</strong>
                <em>{copy.exportSourceCurrentHint}</em>
              </span>
            </label>
            <label className={`scope-option ${exportSource === "recording" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="export-source"
                value="recording"
                checked={exportSource === "recording"}
                onChange={() => setExportSource("recording")}
              />
              <span>
                <strong>{copy.exportSourceRecording}</strong>
                <em>{copy.exportSourceRecordingHint}</em>
              </span>
            </label>
          </div>
          <div className="recording-controls">
            {recordingStartStatuses ? (
              <>
                <button className="ghost-button" type="button" onClick={confirmRecording}>
                  {copy.confirmRecordingButton}
                </button>
                <button className="ghost-button" type="button" onClick={cancelRecording}>
                  {copy.cancelRecordingButton}
                </button>
              </>
            ) : (
              <button className="ghost-button" type="button" onClick={startRecording}>
                {copy.startRecordingButton}
              </button>
            )}
            <p>
              {recordingStartStatuses
                ? `${copy.recordingActiveLabel} (${recordingEvents.length})`
                : confirmedRecordingEvents.length > 0
                  ? `${copy.recordingReadyLabel} (${confirmedRecordingEvents.length})`
                  : copy.recordingEmptyLabel}
            </p>
          </div>
          <button type="button" onClick={handleExport} disabled={isExporting}>
            {isExporting ? copy.exportingLabel : copy.exportButton}
          </button>
          <p className="form-error" role="alert">
            {exportError}
          </p>
          {exportResult ? (
            <p className="export-result">
              {copy.exportReadyLabel} ({Math.round(exportResult.blob.size / 1024)} KB)
              {exportResult.savedPath ? <span>{exportResult.savedPath}</span> : null}
            </p>
          ) : null}
        </section>

        <section className="quest-panel" aria-label="任务 HUD">
          <div className="section-title">
            <h2>任务 HUD</h2>
          </div>
          <p className="hint">给 vlog 里的某件事做一条任务事件通知。</p>
          <div className="quest-controls">
            <label htmlFor="quest-title">任务名称</label>
            <input
              id="quest-title"
              value={questConfig.title}
              autoComplete="off"
              onChange={(event) =>
                setQuestConfig((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            <label htmlFor="quest-state">状态</label>
            <select
              id="quest-state"
              value={questConfig.state}
              onChange={(event) =>
                setQuestConfig((current) => ({
                  ...current,
                  state: event.target.value as QuestState,
                }))
              }
            >
              <option value="start">任务开始</option>
              <option value="active">进行中</option>
              <option value="completed">任务完成</option>
              <option value="failed">未完成</option>
            </select>
            <label htmlFor="quest-hold-seconds">停留秒数</label>
            <input
              id="quest-hold-seconds"
              type="number"
              min={0.6}
              max={5}
              step={0.1}
              value={questConfig.holdSeconds}
              onChange={(event) =>
                setQuestConfig((current) => ({
                  ...current,
                  holdSeconds: Number(event.target.value),
                }))
              }
            />
            <div className="current-readout">
              <span>动画</span>
              <strong>左入停留右出</strong>
            </div>
          </div>
          <div className="quest-actions">
            <button type="button" onClick={replayQuestNotice}>
              播放任务动画
            </button>
            <button type="button" onClick={handleQuestExport} disabled={isQuestExporting}>
              {isQuestExporting ? "导出中" : "导出视频"}
            </button>
          </div>
          <p className="form-error" role="alert">
            {questError}
          </p>
          {questResult ? (
            <p className="export-result">
              已生成 buffpop-quest.mov ({Math.round(questResult.blob.size / 1024)} KB)
              {questResult.savedPath ? <span>{questResult.savedPath}</span> : null}
            </p>
          ) : null}
        </section>

        <section className="avatar-panel" aria-label="头像素材">
          <div className="section-title">
            <h2>头像素材</h2>
          </div>
          <p className="hint">导出透明 PNG，作为独立图层放到剪辑软件里。</p>
          <div className="avatar-controls">
            <span className="control-label">头像图片</span>
            <div
              className="avatar-upload-field"
              role="button"
              tabIndex={0}
              onDragOver={handleAvatarDragOver}
              onDrop={handleAvatarDrop}
              onPaste={handleAvatarPaste}
            >
              <span>上传头像</span>
              <em>{avatarImageName || "拖拽图片到这里，或聚焦后粘贴图片"}</em>
            </div>
            <label htmlFor="avatar-mood">状态</label>
            <select
              id="avatar-mood"
              value={avatarConfig.mood}
              onChange={(event) =>
                setAvatarConfig((current) => ({
                  ...current,
                  mood: event.target.value as AvatarMood,
                }))
              }
            >
              {avatarMoodOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <label htmlFor="avatar-size">大小</label>
            <input
              id="avatar-size"
              type="range"
              min={160}
              max={320}
              step={10}
              value={avatarConfig.size}
              onChange={(event) =>
                setAvatarConfig((current) => ({
                  ...current,
                  size: Number(event.target.value),
                }))
              }
            />
            <label htmlFor="avatarScale">头像放缩</label>
            <input
              id="avatarScale"
              type="range"
              min={1}
              max={2.4}
              step={0.05}
              value={avatarConfig.imageScale ?? 1}
              onChange={(event) =>
                setAvatarConfig((current) => ({
                  ...current,
                  imageScale: Number(event.target.value),
                }))
              }
            />
            <label htmlFor="avatarOffsetX">左右裁剪</label>
            <input
              id="avatarOffsetX"
              type="range"
              min={-35}
              max={35}
              step={1}
              value={avatarConfig.imageOffsetX ?? 0}
              onChange={(event) =>
                setAvatarConfig((current) => ({
                  ...current,
                  imageOffsetX: Number(event.target.value),
                }))
              }
            />
            <label htmlFor="avatarOffsetY">上下裁剪</label>
            <input
              id="avatarOffsetY"
              type="range"
              min={-35}
              max={35}
              step={1}
              value={avatarConfig.imageOffsetY ?? 0}
              onChange={(event) =>
                setAvatarConfig((current) => ({
                  ...current,
                  imageOffsetY: Number(event.target.value),
                }))
              }
            />
            <label htmlFor="avatar-label">名称</label>
            <input
              id="avatar-label"
              value={avatarConfig.label}
              autoComplete="off"
              onChange={(event) =>
                setAvatarConfig((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
            />
            <label htmlFor="avatar-tagline">标识文字</label>
            <input
              id="avatar-tagline"
              value={avatarConfig.tagline}
              autoComplete="off"
              onChange={(event) =>
                setAvatarConfig((current) => ({
                  ...current,
                  tagline: event.target.value,
                }))
              }
            />
          </div>
          <button type="button" onClick={handleAvatarExport}>
            导出 PNG
          </button>
          <p className="form-error" role="alert">
            {avatarError}
          </p>
          {avatarResult ? (
            <p className="export-result">
              已生成 buffpop-avatar.png ({Math.round(avatarResult.blob.size / 1024)} KB)
            </p>
          ) : null}
        </section>

        <section className="history-panel" aria-label={copy.historyTitle}>
          <div className="section-title">
            <h2>{copy.historyTitle}</h2>
          </div>
          <ol className="history-list">
            {events.length === 0 ? (
              <li className="empty-history">{copy.emptyHistory}</li>
            ) : (
              events.map((event) => (
                <li key={event.id}>
                  <span className="history-badge" style={{ background: event.color }} />
                  <span>
                    {getStatusLabel(copy, event.statusId, event.label, event.customLabel)}
                  </span>
                  <strong>
                    {event.from} -&gt; {event.to}
                  </strong>
                  <em>{formatDelta(event.appliedDelta)}</em>
                </li>
              ))
            )}
          </ol>
        </section>
      </aside>
    </main>
  );
}

export default App;
