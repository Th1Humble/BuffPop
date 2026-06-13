import { describe, expect, it } from "vitest";
import {
  applyStatusDelta,
  buildRecordedStatusEvents,
  cloneStatuses,
  formatDelta,
  getStatusIconStep,
  getStatusIcon,
  getStatusLevel,
  initialStatuses,
  parseDelta,
  setStatusCustomLabel,
  setStatusValue,
  StatusEngineError,
} from "../src/stateEngine";

describe("stateEngine", () => {
  it("uses Chinese labels by default", () => {
    expect(initialStatuses.map((status) => status.label)).toEqual([
      "心情",
      "疲劳",
      "饥饿",
    ]);
    expect(initialStatuses.map((status) => status.id)).toEqual(["mood", "fatigue", "hunger"]);
  });

  it("applies a positive delta to the selected status", () => {
    const statuses = cloneStatuses(initialStatuses);

    const result = applyStatusDelta(statuses, "mood", "+5", 1000);

    expect(result.statuses.find((status) => status.id === "mood")?.value).toBe(85);
    expect({
      from: result.event.from,
      to: result.event.to,
      requestedDelta: result.event.requestedDelta,
      appliedDelta: result.event.appliedDelta,
    }).toEqual({
      from: 80,
      to: 85,
      requestedDelta: 5,
      appliedDelta: 5,
    });
  });

  it("merges recorded operations into one event per changed status", () => {
    const statuses = cloneStatuses(initialStatuses);
    const moodResult = applyStatusDelta(statuses, "mood", "+5", 1000);
    const fatigueResult = applyStatusDelta(moodResult.statuses, "fatigue", "+5", 2000);
    const hungerResult = applyStatusDelta(fatigueResult.statuses, "hunger", "+5", 3000);
    const moodAgainResult = applyStatusDelta(hungerResult.statuses, "mood", "-2", 4000);

    const recordedEvents = buildRecordedStatusEvents({
      startStatuses: statuses,
      endStatuses: moodAgainResult.statuses,
      events: [
        moodResult.event,
        fatigueResult.event,
        hungerResult.event,
        moodAgainResult.event,
      ],
      now: 5000,
    });

    expect(recordedEvents.map((event) => event.statusId)).toEqual([
      "mood",
      "fatigue",
      "hunger",
    ]);
    expect(recordedEvents.map(({ statusId, from, to, requestedDelta, appliedDelta }) => ({
      statusId,
      from,
      to,
      requestedDelta,
      appliedDelta,
    }))).toEqual([
      { statusId: "mood", from: 80, to: 83, requestedDelta: 3, appliedDelta: 3 },
      { statusId: "fatigue", from: 25, to: 30, requestedDelta: 5, appliedDelta: 5 },
      { statusId: "hunger", from: 60, to: 65, requestedDelta: 5, appliedDelta: 5 },
    ]);
  });

  it("stores a custom status label without changing the status value", () => {
    const statuses = cloneStatuses(initialStatuses);

    const result = setStatusCustomLabel(statuses, "mood", " 快乐值 ");
    const mood = result.find((status) => status.id === "mood");

    expect(mood?.customLabel).toBe("快乐值");
    expect(mood?.value).toBe(80);
    expect(statuses.find((status) => status.id === "mood")?.customLabel).toBeUndefined();
  });

  it("sets a status value directly without mutating other statuses", () => {
    const statuses = cloneStatuses(initialStatuses);

    const result = setStatusValue(statuses, "mood", "42");

    expect(result.find((status) => status.id === "mood")?.value).toBe(42);
    expect(result.find((status) => status.id === "fatigue")?.value).toBe(25);
    expect(statuses.find((status) => status.id === "mood")?.value).toBe(80);
  });

  it("clamps a direct status value to the status range", () => {
    const statuses = cloneStatuses(initialStatuses);

    expect(setStatusValue(statuses, "mood", "120").find((status) => status.id === "mood")?.value).toBe(100);
    expect(setStatusValue(statuses, "mood", "-10").find((status) => status.id === "mood")?.value).toBe(0);
  });

  it("clears a custom status label with blank input", () => {
    const statuses = setStatusCustomLabel(cloneStatuses(initialStatuses), "mood", "快乐值");

    const result = setStatusCustomLabel(statuses, "mood", "   ");

    expect(result.find((status) => status.id === "mood")?.customLabel).toBeUndefined();
  });

  it("uses the custom status label when recording an animation event", () => {
    const statuses = setStatusCustomLabel(cloneStatuses(initialStatuses), "mood", "快乐值");

    const result = applyStatusDelta(statuses, "mood", "+5", 1000);

    expect(result.event.label).toBe("快乐值");
  });

  it("clamps a status update at its maximum value", () => {
    const statuses = cloneStatuses(initialStatuses);

    const result = applyStatusDelta(statuses, "mood", "+50", 1000);

    expect(result.statuses.find((status) => status.id === "mood")?.value).toBe(100);
    expect(result.event.appliedDelta).toBe(20);
  });

  it("clamps a status update at zero", () => {
    const statuses = cloneStatuses(initialStatuses);

    const result = applyStatusDelta(statuses, "fatigue", "-50", 1000);

    expect(result.statuses.find((status) => status.id === "fatigue")?.value).toBe(0);
    expect(result.event.appliedDelta).toBe(-25);
  });

  it("rejects non-whole-number delta input with translatable error keys", () => {
    expect(() => parseDelta("5.5")).toThrow(StatusEngineError);
    expect(() => parseDelta("abc")).toThrow(StatusEngineError);
    expect(() => parseDelta("0")).toThrow(StatusEngineError);

    try {
      parseDelta("5.5");
    } catch (error) {
      expect(error).toBeInstanceOf(StatusEngineError);
      expect((error as StatusEngineError).messageKey).toBe("errors.wholeNumber");
    }

    try {
      parseDelta("0");
    } catch (error) {
      expect(error).toBeInstanceOf(StatusEngineError);
      expect((error as StatusEngineError).messageKey).toBe("errors.nonZeroDelta");
    }
  });

  it("formats positive deltas with a plus sign", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(-20)).toBe("-20");
  });

  it("classifies five status levels across the value range", () => {
    const [mood] = cloneStatuses(initialStatuses);

    expect(getStatusLevel({ ...mood, value: 0 })).toBe("empty");
    expect(getStatusLevel({ ...mood, value: 10 })).toBe("low");
    expect(getStatusLevel({ ...mood, value: 50 })).toBe("normal");
    expect(getStatusLevel({ ...mood, value: 85 })).toBe("high");
    expect(getStatusLevel({ ...mood, value: mood.max })).toBe("full");
  });

  it("uses 10-point status icon steps", () => {
    const [mood] = cloneStatuses(initialStatuses);

    expect(getStatusIconStep({ ...mood, value: 0 }).maxPercent).toBe(0);
    expect(getStatusIconStep({ ...mood, value: 10 }).maxPercent).toBe(10);
    expect(getStatusIconStep({ ...mood, value: 11 }).maxPercent).toBe(20);
    expect(getStatusIconStep({ ...mood, value: 85 }).maxPercent).toBe(90);
    expect(getStatusIconStep({ ...mood, value: mood.max }).maxPercent).toBe(100);
    expect(getStatusIcon({ ...mood, value: 85 })).toBe(mood.iconSteps[9].icon);
  });

  it("uses face-based icon steps for hunger", () => {
    const hunger = cloneStatuses(initialStatuses).find((status) => status.id === "hunger");

    expect(hunger?.iconSteps.map((step) => step.icon)).toEqual([
      expect.stringContaining("1F60B"),
      expect.stringContaining("1F642"),
      expect.stringContaining("1F610"),
      expect.stringContaining("1F914"),
      expect.stringContaining("1F924"),
      expect.stringContaining("1F615"),
      expect.stringContaining("1F625"),
      expect.stringContaining("1F62B"),
      expect.stringContaining("1F974"),
      expect.stringContaining("1F975"),
      expect.stringContaining("1F635"),
    ]);
  });
});
