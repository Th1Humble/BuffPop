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
  defaultRemotionHudProps,
  getRemotionDurationInFrames,
  type RemotionHudProps,
  type RemotionHudStatus,
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
    background: transparent;
    color: #fffaf2;
    padding: 42px 64px 0;
  }

  .stage--single {
    padding: 52px 64px 0;
  }

  .stack {
    display: grid;
    gap: 38px;
    width: 100%;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function displayLabel(status: RemotionHudStatus): string {
  return status.customLabel?.trim() || status.label;
}

function renderValueOf(status: RemotionHudStatus): number {
  return status.renderValue ?? status.value;
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

function HudRow({ status }: { status: RemotionHudStatus }) {
  const ratio = status.max > 0 ? clamp(renderValueOf(status) / status.max, 0, 1) : 0;
  const color = status.color;

  return (
    <article
      className={`hud ${statusLevelClass(status)}`}
      style={
        {
          "--c": color,
          "--soft": `${color}2e`,
          "--fill": `${Math.round(ratio * 1000) / 10}%`,
        } as React.CSSProperties
      }
    >
      <div className="badge">
        {getStatusIcon(status) ? (
          <Img src={getStatusIcon(status) ?? ""} alt="" />
        ) : (
          <span>{status.icon ?? "•"}</span>
        )}
      </div>
      <div className="body">
        <div className="meta">
          <span className="label">{displayLabel(status)}</span>
          <strong>
            {status.value}/{status.max}
          </strong>
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
  const lastFrame = Math.max(1, config.durationInFrames - 1);
  const progress = interpolate(frame, [0, lastFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const frameStatuses = buildFrameStatuses(props, progress);
  const visibleStatuses =
    props.scope === "single"
      ? frameStatuses.filter((status) => status.id === props.event.statusId)
      : frameStatuses;

  return (
    <AbsoluteFill className={`stage stage--${props.scope}`}>
      <style>{hudStyles}</style>
      <div className="stack">
        {visibleStatuses.map((status) => (
          <HudRow key={status.id} status={status} />
        ))}
      </div>
    </AbsoluteFill>
  );
}

function RemotionRoot() {
  return (
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
  );
}

registerRoot(RemotionRoot);
