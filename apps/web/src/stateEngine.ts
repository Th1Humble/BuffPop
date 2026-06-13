export type StatusItem = {
  id: string;
  label: string;
  customLabel?: string;
  icon: string;
  iconSteps: StatusIconStep[];
  value: number;
  max: number;
  color: string;
};

export type StatusLevel = "empty" | "low" | "normal" | "high" | "full";

export type StatusIconStep = {
  maxPercent: number;
  icon: string;
};

export type StatusEngineErrorKey =
  | "errors.wholeNumber"
  | "errors.nonZeroDelta"
  | "errors.unknownStatus";

export class StatusEngineError extends Error {
  readonly messageKey: StatusEngineErrorKey;

  constructor(messageKey: StatusEngineErrorKey, message: string) {
    super(message);
    this.name = "StatusEngineError";
    this.messageKey = messageKey;
  }
}

const openMojiBaseUrl = "https://cdn.jsdelivr.net/npm/openmoji@17.0.0/color/svg";

function openMoji(codepoint: string): string {
  return `${openMojiBaseUrl}/${codepoint}.svg`;
}

function iconSteps(codepoints: string[]): StatusIconStep[] {
  return codepoints.map((codepoint, index) => ({
    maxPercent: index * 10,
    icon: openMoji(codepoint),
  }));
}

export type StatusEvent = {
  id: string;
  statusId: string;
  label: string;
  customLabel?: string;
  color: string;
  from: number;
  to: number;
  requestedDelta: number;
  appliedDelta: number;
  max: number;
  createdAt: number;
};

export const initialStatuses: StatusItem[] = [
  {
    id: "mood",
    label: "心情",
    icon: "😊",
    iconSteps: iconSteps([
      "1F62D",
      "1F622",
      "1F61F",
      "1F641",
      "1F610",
      "1F642",
      "1F60A",
      "1F604",
      "1F601",
      "1F929",
      "1F973",
    ]),
    value: 80,
    max: 100,
    color: "#ff4f92",
  },
  {
    id: "fatigue",
    label: "疲劳",
    icon: "😴",
    iconSteps: iconSteps([
      "1F929",
      "1F642",
      "1F610",
      "1F62C",
      "1F611",
      "1F971",
      "1F634",
      "1F62A",
      "1F62B",
      "1F635",
      "1F480",
    ]),
    value: 25,
    max: 100,
    color: "#6f7dff",
  },
  {
    id: "hunger",
    label: "饥饿",
    icon: "🍜",
    iconSteps: iconSteps([
      "1F60B",
      "1F642",
      "1F610",
      "1F914",
      "1F924",
      "1F615",
      "1F625",
      "1F62B",
      "1F974",
      "1F975",
      "1F635",
    ]),
    value: 60,
    max: 100,
    color: "#f4a62a",
  },
];

export function cloneStatuses(statuses: StatusItem[] = initialStatuses): StatusItem[] {
  return statuses.map((status) => ({ ...status }));
}

export function setStatusCustomLabel(
  statuses: StatusItem[],
  statusId: string,
  customLabel: string,
): StatusItem[] {
  const statusIndex = statuses.findIndex((status) => status.id === statusId);

  if (statusIndex === -1) {
    throw new StatusEngineError("errors.unknownStatus", `Unknown status: ${statusId}`);
  }

  const normalizedLabel = customLabel.trim();

  return statuses.map((status, index) => {
    if (index !== statusIndex) {
      return { ...status };
    }

    if (normalizedLabel.length === 0) {
      const { customLabel: _customLabel, ...nextStatus } = status;
      return { ...nextStatus };
    }

    return { ...status, customLabel: normalizedLabel };
  });
}

export function setStatusValue(
  statuses: StatusItem[],
  statusId: string,
  valueInput: string | number,
): StatusItem[] {
  const statusIndex = statuses.findIndex((status) => status.id === statusId);

  if (statusIndex === -1) {
    throw new StatusEngineError("errors.unknownStatus", `Unknown status: ${statusId}`);
  }

  const value =
    typeof valueInput === "number" ? valueInput : Number.parseInt(valueInput.trim(), 10);

  if (!Number.isFinite(value)) {
    throw new StatusEngineError("errors.wholeNumber", "Enter a whole number.");
  }

  return statuses.map((status, index) =>
    index === statusIndex
      ? { ...status, value: clampValue(value, 0, status.max) }
      : { ...status },
  );
}

export function parseDelta(input: string): number {
  const value = input.trim();

  if (!/^[+-]?\d+$/.test(value)) {
    throw new StatusEngineError(
      "errors.wholeNumber",
      "Enter a whole number such as +5 or -20.",
    );
  }

  const delta = Number.parseInt(value, 10);

  if (!Number.isFinite(delta) || delta === 0) {
    throw new StatusEngineError("errors.nonZeroDelta", "Delta cannot be 0.");
  }

  return delta;
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getStatusLevel(status: StatusItem): StatusLevel {
  const ratio = status.max > 0 ? status.value / status.max : 0;

  if (status.value <= 0) {
    return "empty";
  }

  if (status.value >= status.max) {
    return "full";
  }

  if (ratio < 0.25) {
    return "low";
  }

  if (ratio >= 0.75) {
    return "high";
  }

  return "normal";
}

export function getStatusIcon(status: StatusItem): string {
  return getStatusIconStep(status).icon;
}

export function getStatusIconStep(status: StatusItem): StatusIconStep {
  const percent = status.max > 0 ? (status.value / status.max) * 100 : 0;
  const clampedPercent = clampValue(percent, 0, 100);
  const stepPercent = clampedPercent === 0 ? 0 : Math.ceil(clampedPercent / 10) * 10;
  return (
    status.iconSteps.find((step) => step.maxPercent >= stepPercent) ??
    status.iconSteps[status.iconSteps.length - 1]
  );
}

export function applyStatusDelta(
  statuses: StatusItem[],
  statusId: string,
  deltaInput: string | number,
  now = Date.now(),
): { statuses: StatusItem[]; event: StatusEvent } {
  const delta = typeof deltaInput === "number" ? deltaInput : parseDelta(deltaInput);
  const statusIndex = statuses.findIndex((status) => status.id === statusId);

  if (statusIndex === -1) {
    throw new StatusEngineError("errors.unknownStatus", `Unknown status: ${statusId}`);
  }

  const previous = statuses[statusIndex];
  const eventLabel = previous.customLabel?.trim() || previous.label;
  const nextValue = clampValue(previous.value + delta, 0, previous.max);
  const nextStatuses = statuses.map((status, index) =>
    index === statusIndex ? { ...status, value: nextValue } : { ...status },
  );
  const appliedDelta = nextValue - previous.value;

  return {
    statuses: nextStatuses,
    event: {
      id: `${statusId}-${now}`,
      statusId,
      label: eventLabel,
      customLabel: previous.customLabel,
      color: previous.color,
      from: previous.value,
      to: nextValue,
      requestedDelta: delta,
      appliedDelta,
      max: previous.max,
      createdAt: now,
    },
  };
}

export function buildRecordedStatusEvents({
  startStatuses,
  endStatuses,
  events,
  now = Date.now(),
}: {
  startStatuses: StatusItem[];
  endStatuses: StatusItem[];
  events: StatusEvent[];
  now?: number;
}): StatusEvent[] {
  const eventStatusIds = new Set(events.map((event) => event.statusId));

  return startStatuses.flatMap((startStatus) => {
    if (!eventStatusIds.has(startStatus.id)) {
      return [];
    }

    const endStatus = endStatuses.find((status) => status.id === startStatus.id);

    if (!endStatus || endStatus.value === startStatus.value) {
      return [];
    }

    const appliedDelta = endStatus.value - startStatus.value;
    const label = startStatus.customLabel?.trim() || startStatus.label;

    return [
      {
        id: `${startStatus.id}-recording-${now}`,
        statusId: startStatus.id,
        label,
        customLabel: startStatus.customLabel,
        color: startStatus.color,
        from: startStatus.value,
        to: endStatus.value,
        requestedDelta: appliedDelta,
        appliedDelta,
        max: startStatus.max,
        createdAt: now,
      },
    ];
  });
}

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}
