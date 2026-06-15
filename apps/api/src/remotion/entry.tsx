import React from "react";
import {
  AbsoluteFill,
  Composition,
  Img,
  interpolate,
  registerRoot,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  buffPopCompositionId,
  buffPopQuestCompositionId,
  defaultRemotionHudProps,
  defaultRemotionQuestProps,
  getRemotionDurationInFrames,
  type RemotionHudProps,
  type RemotionHudStatus,
  type RemotionQuestProps,
} from "../remotionHudTypes.js";

const hudStyles = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    background: transparent;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif;
  }

  .stage {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: #fffaf2;
    padding: 64px;
  }

  .stack {
    display: grid;
    gap: 38px;
    width: 100%;
    min-height: 0;
  }

  .hud {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 28px;
    align-items: center;
    min-height: 118px;
    border: 3px solid color-mix(in srgb, var(--c), white 10%);
    border-radius: 8px;
    padding: 16px 24px;
    background:
      linear-gradient(135deg, var(--soft), transparent 58%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.11), transparent 48%),
      rgba(16, 16, 17, 0.78);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -1px 0 rgba(0, 0, 0, 0.34),
      0 14px 36px rgba(0, 0, 0, 0.28);
  }

  .hud.is-high,
  .hud.is-full {
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--c), transparent 34%),
      0 0 26px color-mix(in srgb, var(--c), transparent 60%),
      0 12px 34px rgba(0, 0, 0, 0.26);
  }

  .hud.is-empty {
    filter: saturate(0.72);
    opacity: 0.78;
  }

  .hud.is-full {
    border-color: color-mix(in srgb, var(--c), white 32%);
  }

  .badge {
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    border-radius: 8px;
    background:
      radial-gradient(circle at 34% 24%, rgba(255,255,255,.92), transparent 31%),
      linear-gradient(145deg, color-mix(in srgb, var(--c), white 16%), var(--c));
    box-shadow:
      inset 0 -12px 18px rgba(0, 0, 0, 0.16),
      0 0 20px color-mix(in srgb, var(--c), transparent 60%);
  }

  .badge img {
    display: block;
    width: 58px;
    height: 58px;
    object-fit: contain;
  }

  .badge span {
    display: block;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
    font-size: 44px;
    line-height: 1;
    transform: translateY(1px);
  }

  .meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 22px;
    align-items: baseline;
    margin-bottom: 18px;
  }

  .label {
    overflow: hidden;
    color: rgba(255, 250, 242, 0.96);
    font-size: 34px;
    font-weight: 800;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #fff2d6;
    font-size: 32px;
    font-weight: 850;
    line-height: 1;
    text-shadow: 0 2px 7px rgba(0, 0, 0, 0.3);
  }

  .value-wrap {
    position: relative;
    display: grid;
    justify-items: end;
  }

  .delta-pop {
    position: absolute;
    right: -18px;
    top: -34px;
    min-width: 76px;
    border: 2px solid color-mix(in srgb, var(--c), white 42%);
    border-radius: 999px;
    padding: 8px 16px;
    color: #151515;
    font-size: 30px;
    font-weight: 900;
    line-height: 1;
    text-align: center;
    background:
      radial-gradient(circle at 30% 20%, rgba(255,255,255,.96), transparent 32%),
      linear-gradient(135deg, color-mix(in srgb, var(--c), white 52%), color-mix(in srgb, var(--c), white 16%));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.5),
      0 0 28px color-mix(in srgb, var(--c), transparent 38%),
      0 10px 26px rgba(0, 0, 0, 0.28);
    transform: translateY(var(--pop-y)) scale(var(--pop-scale));
    opacity: var(--pop-opacity);
  }

  .delta-pop::before,
  .delta-pop::after {
    position: absolute;
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #fff7d6;
    box-shadow: 0 0 14px color-mix(in srgb, var(--c), white 12%);
    content: "";
    opacity: var(--spark-opacity);
    transform: translate(var(--spark-x), var(--spark-y)) scale(var(--spark-scale));
  }

  .delta-pop::before {
    top: -5px;
    left: -11px;
  }

  .delta-pop::after {
    right: -11px;
    bottom: -4px;
  }

  .track {
    position: relative;
    height: 24px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background:
      linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06)),
      rgba(255, 255, 255, 0.1);
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.22);
  }

  .hud.is-empty .track {
    background:
      repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 7px, rgba(255,255,255,.02) 7px 14px),
      rgba(255,255,255,.06);
  }

  .fill {
    width: var(--fill);
    height: 100%;
    border-radius: inherit;
    background:
      linear-gradient(90deg, var(--c), color-mix(in srgb, var(--c), white 28%));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.4),
      0 0 18px color-mix(in srgb, var(--c), transparent 48%);
  }

  .shine {
    position: absolute;
    inset: 0;
    opacity: 0.18;
    background: linear-gradient(110deg, transparent 0 48%, rgba(255,255,255,.8) 52%, transparent 58% 100%);
  }

  .hud.is-full .shine {
    opacity: 0.42;
  }
`;

const questStyles = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    background: transparent;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif;
  }

  .quest-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: #fffaf2;
    padding: 48px 72px;
  }

  .quest-notice {
    --quest-accent: #ffcf70;
    position: relative;
    display: grid;
    gap: 10px;
    width: 100%;
    overflow: hidden;
    border-left: 6px solid var(--quest-accent);
    border-radius: 0 12px 12px 0;
    padding: 28px 34px 30px 38px;
    background: linear-gradient(90deg, rgba(10, 10, 11, 0.88), rgba(10, 10, 11, 0.56) 62%, transparent);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.18);
    opacity: var(--quest-opacity);
    transform: translateX(var(--quest-x)) scale(var(--quest-scale));
  }

  .quest-notice::before {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--quest-accent), transparent 72%), transparent 44%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 52%);
    content: "";
    pointer-events: none;
  }

  .quest-notice--active {
    --quest-accent: #8ddfc7;
  }

  .quest-notice--completed {
    --quest-accent: #ffd98d;
  }

  .quest-notice--failed {
    --quest-accent: #ff7070;
  }

  .quest-label {
    position: relative;
    color: var(--quest-accent);
    font-size: 28px;
    font-weight: 950;
    line-height: 1;
    text-shadow: 0 2px 12px color-mix(in srgb, var(--quest-accent), transparent 52%);
  }

  .quest-title {
    position: relative;
    overflow: hidden;
    color: rgba(255, 250, 242, 0.96);
    font-size: 58px;
    font-weight: 950;
    line-height: 1.08;
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.42);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function displayLabel(status: RemotionHudStatus): string {
  return status.customLabel?.trim() || status.label;
}

function renderValueOf(status: RemotionHudStatus): number {
  return status.renderValue ?? status.value;
}

function logBrowserEvent(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      event,
      service: "buffpop-remotion-browser",
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

function getStatusIcon(status: RemotionHudStatus): string | undefined {
  const steps = status.iconSteps ?? [];
  const percent = status.max > 0 ? (renderValueOf(status) / status.max) * 100 : 0;
  const clampedPercent = clamp(percent, 0, 100);
  const stepPercent = clampedPercent === 0 ? 0 : Math.ceil(clampedPercent / 10) * 10;

  return (
    steps.find((step) => step.maxPercent >= stepPercent) ??
    steps[steps.length - 1]
  )?.icon;
}

function statusLevelClass(status: RemotionHudStatus): string {
  const value = renderValueOf(status);
  const ratio = status.max > 0 ? value / status.max : 0;

  if (value <= 0) {
    return "is-empty";
  }

  if (value >= status.max) {
    return "is-full";
  }

  if (ratio < 0.25) {
    return "is-low";
  }

  if (ratio >= 0.75) {
    return "is-high";
  }

  return "is-normal";
}

function buildFrameStatuses(props: RemotionHudProps, progress: number): RemotionHudStatus[] {
  const clampedProgress = clamp(progress, 0, 1);
  const eventsByStatusId = new Map(
    (props.events?.length ? props.events : [props.event]).map((event) => [
      event.statusId,
      event,
    ]),
  );

  return props.statuses.map((status) => {
    const event = eventsByStatusId.get(status.id);

    if (!event) {
      return { ...status };
    }

    const renderValue = event.from + (event.to - event.from) * clampedProgress;
    const value = Math.round(renderValue);

    return { ...status, value, renderValue };
  });
}

function deltaPopState(progress: number) {
  const clampedProgress = clamp(progress, 0, 1);
  const opacity =
    clampedProgress < 0.72
      ? 1
      : interpolate(clampedProgress, [0.72, 1], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const y = interpolate(clampedProgress, [0, 0.32, 1], [8, -10, -32], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(clampedProgress, [0, 0.18, 1], [0.74, 1.16, 0.96], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sparkOpacity = interpolate(clampedProgress, [0, 0.14, 0.3, 1], [0, 0, 0.95, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sparkX = interpolate(clampedProgress, [0, 1], [0, -14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sparkY = interpolate(clampedProgress, [0, 1], [0, -22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sparkScale = interpolate(clampedProgress, [0, 0.28, 1], [0.5, 1, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return { opacity, y, scale, sparkOpacity, sparkX, sparkY, sparkScale };
}

function getAnimationProgress({
  frame,
  fps,
  durationMs,
  leadInMs = 0,
}: {
  frame: number;
  fps: number;
  durationMs: number;
  leadInMs?: number;
}) {
  const elapsedMs = (frame / fps) * 1000;
  return clamp((elapsedMs - leadInMs) / durationMs, 0, 1);
}

function getQuestMotion(progress: number) {
  const clampedProgress = clamp(progress, 0, 1);
  const x = interpolate(
    clampedProgress,
    [0, 0.18, 0.78, 1],
    [-42, 0, 0, -48],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const opacity = interpolate(
    clampedProgress,
    [0, 0.18, 0.78, 1],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const scale = interpolate(
    clampedProgress,
    [0, 0.18, 0.78, 1],
    [0.96, 1, 1, 0.98],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return { x, opacity, scale };
}

function HudRow({
  status,
  event,
  progress,
}: {
  status: RemotionHudStatus;
  event?: RemotionHudProps["event"];
  progress: number;
}) {
  const ratio = status.max > 0 ? clamp(renderValueOf(status) / status.max, 0, 1) : 0;
  const color = status.color;
  const popState = deltaPopState(progress);
  const deltaLabel = event?.statusId === status.id && progress > 0 ? event.deltaLabel : "";
  const icon = getStatusIcon(status);

  return (
    <article
      className={`hud ${statusLevelClass(status)}`}
      style={
        {
          "--c": color,
          "--soft": `${color}2e`,
          "--fill": `${Math.round(ratio * 1000) / 10}%`,
          "--pop-opacity": popState.opacity,
          "--pop-y": `${popState.y}px`,
          "--pop-scale": popState.scale,
          "--spark-opacity": popState.sparkOpacity,
          "--spark-x": `${popState.sparkX}px`,
          "--spark-y": `${popState.sparkY}px`,
          "--spark-scale": popState.sparkScale,
        } as React.CSSProperties
      }
    >
      <div className="badge">
        {icon ? (
          <Img
            src={icon}
            alt=""
            onLoad={() => {
              logBrowserEvent("remotion:icon:load", {
                statusId: status.id,
                icon,
              });
            }}
            onError={() => {
              logBrowserEvent("remotion:icon:error", {
                statusId: status.id,
                icon,
              });
            }}
          />
        ) : (
          <span>{status.icon ?? "•"}</span>
        )}
      </div>
      <div className="body">
        <div className="meta">
          <span className="label">{displayLabel(status)}</span>
          <div className="value-wrap">
            {deltaLabel ? <span className="delta-pop">{deltaLabel}</span> : null}
            <strong>
              {status.value}/{status.max}
            </strong>
          </div>
        </div>
        <div className="track">
          <div className="fill" />
          <div className="shine" />
        </div>
      </div>
    </article>
  );
}

function BuffPopOverlay(props: RemotionHudProps) {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const progress = getAnimationProgress({
    frame,
    fps: config.fps,
    durationMs: props.preset.durationMs,
    leadInMs: props.preset.leadInMs,
  });
  const frameStatuses = buildFrameStatuses(props, progress);
  const eventsByStatusId = new Map(
    (props.events?.length ? props.events : [props.event]).map((event) => [
      event.statusId,
      event,
    ]),
  );
  const visibleStatuses =
    props.scope === "single"
      ? frameStatuses.filter((status) => status.id === props.event.statusId)
      : frameStatuses;

  return (
    <AbsoluteFill className={`stage stage--${props.scope}`}>
      <style>{hudStyles}</style>
      <div className="stack">
        {visibleStatuses.map((status) => (
          <HudRow
            key={status.id}
            status={status}
            event={eventsByStatusId.get(status.id)}
            progress={progress}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}

function BuffPopQuestOverlay(props: RemotionQuestProps) {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const progress = getAnimationProgress({
    frame,
    fps: config.fps,
    durationMs: props.preset.durationMs,
    leadInMs: props.preset.leadInMs,
  });
  const motion = getQuestMotion(progress);

  return (
    <AbsoluteFill className="quest-stage">
      <style>{questStyles}</style>
      <section
        className={`quest-notice quest-notice--${props.quest.state}`}
        style={
          {
            "--quest-x": `${motion.x}px`,
            "--quest-opacity": motion.opacity,
            "--quest-scale": motion.scale,
          } as React.CSSProperties
        }
      >
        <span className="quest-label">{props.quest.label}</span>
        <strong className="quest-title">{props.quest.title}</strong>
      </section>
    </AbsoluteFill>
  );
}

function RemotionRoot() {
  return (
    <>
      <Composition
        id={buffPopCompositionId}
        component={BuffPopOverlay}
        defaultProps={defaultRemotionHudProps}
        calculateMetadata={({ props }) => ({
          width: props.preset.width,
          height: props.preset.height,
          fps: props.preset.fps,
          durationInFrames: getRemotionDurationInFrames(props.preset),
        })}
      />
      <Composition
        id={buffPopQuestCompositionId}
        component={BuffPopQuestOverlay}
        defaultProps={defaultRemotionQuestProps}
        calculateMetadata={({ props }) => ({
          width: props.preset.width,
          height: props.preset.height,
          fps: props.preset.fps,
          durationInFrames: getRemotionDurationInFrames(props.preset),
        })}
      />
    </>
  );
}

registerRoot(RemotionRoot);
