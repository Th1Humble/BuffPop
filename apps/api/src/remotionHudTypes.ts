export const buffPopCompositionId = "BuffPopOverlay";
export const buffPopQuestCompositionId = "BuffPopQuestOverlay";

export type RemotionHudStatus = {
  id: string;
  label: string;
  customLabel?: string;
  icon?: string;
  iconSteps?: {
    maxPercent: number;
    icon: string;
  }[];
  value: number;
  renderValue?: number;
  max: number;
  color: string;
};

export type RemotionHudPreset = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  leadInMs?: number;
};

export type RemotionQuestState = "start" | "active" | "completed" | "failed";

export type RemotionQuestProps = Record<string, unknown> & {
  quest: {
    title: string;
    label: string;
    state: RemotionQuestState;
  };
  preset: RemotionHudPreset;
};

export type RemotionHudEvent = {
  statusId: string;
  from: number;
  to: number;
  delta: number;
  deltaLabel?: string;
};

export type RemotionHudProps = Record<string, unknown> & {
  statuses: RemotionHudStatus[];
  scope: "single" | "all";
  event: RemotionHudEvent;
  events: RemotionHudEvent[];
  preset: RemotionHudPreset;
};

export function getRemotionDurationInFrames(
  preset: Pick<RemotionHudPreset, "fps" | "durationMs" | "leadInMs">,
) {
  return Math.max(1, Math.round((preset.fps * (preset.durationMs + (preset.leadInMs ?? 0))) / 1000));
}

export const defaultRemotionHudProps: RemotionHudProps = {
  statuses: [
    {
      id: "mood",
      label: "心情",
      icon: "😊",
      iconSteps: [
        {
          maxPercent: 0,
          icon: "https://cdn.jsdelivr.net/npm/openmoji@17.0.0/color/svg/1F62D.svg",
        },
      ],
      value: 80,
      max: 100,
      color: "#ff4f8b",
    },
  ],
  scope: "single",
  event: {
    statusId: "mood",
    from: 80,
    to: 85,
    delta: 5,
    deltaLabel: "+5",
  },
  events: [
    {
      statusId: "mood",
      from: 80,
      to: 85,
      delta: 5,
      deltaLabel: "+5",
    },
  ],
  preset: {
    width: 1080,
    height: 1920,
    fps: 60,
    durationMs: 1600,
    leadInMs: 220,
  },
};

export const defaultRemotionQuestProps: RemotionQuestProps = {
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
  },
};
