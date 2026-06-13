import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultExportPreset } from "./exportPreset";
import {
  createExportPlan,
  downloadBlob,
  exportPlanToVideo,
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

type DisplayStatusItem = StatusItem & {
  renderValue?: number;
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
}: {
  status: DisplayStatusItem;
  isActive: boolean;
  copy: AppCopy;
}) {
  const level = getStatusLevel(status);
  const barStyle = { "--bar-color": status.color } as CSSProperties & {
    "--bar-color": string;
  };
  const label = getStatusLabel(copy, status.id, status.label, status.customLabel);

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
          <strong>
            {status.value}/{status.max}
          </strong>
        </div>
        <div className="meter-track" aria-hidden="true">
          <div className="meter-fill" style={{ width: `${percentFor(status)}%` }} />
          {level === "full" ? <div className="meter-sheen" /> : null}
        </div>
      </div>
    </article>
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

    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = easeLinear((now - startedAt) / animationDurationMs);
      const renderValue = event.from + (event.to - event.from) * progress;
      setDisplayStatuses(applyDisplayValue(nextStatuses, event.statusId, renderValue));

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      animationFrameRef.current = null;
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
      downloadBlob(result.blob, result.filename);
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

    const resetStatuses = cloneStatuses(initialStatuses);
    setStatuses(resetStatuses);
    setDisplayStatuses(cloneStatuses(resetStatuses));
    setEvents([]);
    setSelectedStatusId(initialStatuses[0].id);
    setDeltaInput("+5");
    setExportScope("single");
    setExportSource("current");
    setRecordingStartStatuses(null);
    setRecordingEvents([]);
    setConfirmedRecordingEvents([]);
    setError("");
    setExportError("");
    setExportResult(null);
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
            <div className="canvas-size">1080 x 640</div>
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
              />
            ))}
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
