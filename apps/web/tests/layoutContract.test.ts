import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("layout contract", () => {
  it("keeps the preview header visible while the page scrolls", async () => {
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(css).toContain(".preview-panel");
    expect(css).toContain("position: sticky");
    expect(css).toContain("top: 0");
    expect(css).toContain("height: 100vh");
  });

  it("keeps animation controls beside the HUD instead of in the export rail", async () => {
    const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    const previewStart = appSource.indexOf('<section className="preview-panel"');
    const hudForm = appSource.indexOf('className="delta-form hud-action-form"');
    const railStart = appSource.indexOf('<aside className="control-panel"');

    expect(previewStart).toBeGreaterThanOrEqual(0);
    expect(hudForm).toBeGreaterThan(previewStart);
    expect(hudForm).toBeLessThan(railStart);
  });

  it("keeps the empty history placeholder on one normal row", async () => {
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(css).toContain(".history-list .empty-history");
    expect(css).toContain("grid-template-columns: 1fr");
  });

  it("keeps the delta pop badge anchored beside the numeric value", async () => {
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(css).toContain(".hud-value-wrap");
    expect(css).toContain("top: -18px");
    expect(css).toContain("right: -10px");
    expect(css).toContain(".delta-pop::before");
    expect(css).toContain(".delta-pop::after");
  });

  it("keeps the preview status stack above the separate avatar layer", async () => {
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(css).toContain(".hud-stack");
    expect(css).toContain("aspect-ratio: 1080 / 960");
    expect(css).toContain("top: 5%");
    expect(css).toContain("max-height: 46%");
    expect(css).toContain(".avatar-layer");
    expect(css).toContain(".quest-layer");
  });

  it("keeps the Remotion HUD stack centered in the export canvas", async () => {
    const remotionSource = await readFile(
      new URL("../../api/src/remotion/entry.tsx", import.meta.url),
      "utf8",
    );

    expect(remotionSource).toContain(".stage {");
    expect(remotionSource).toContain("align-items: center");
    expect(remotionSource).toContain("justify-content: center");
    expect(remotionSource).toContain("min-height: 0");
  });

  it("mounts the preview delta pop after the lead-in delay", async () => {
    const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(appSource).toContain("activePopEventId");
    expect(appSource).toContain("setActivePopEventId(event.id)");
    expect(appSource).toContain("elapsedMs >= animationLeadInMs");
  });

  it("keeps avatar material controls and avatar HUD on the current page", async () => {
    const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(appSource).toContain("avatar-panel");
    expect(appSource).toContain("avatar-hud-panel");
    expect(appSource).toContain("handleAvatarExport");
    expect(appSource).toContain("readAvatarImageFile");
    expect(appSource).toContain("handleAvatarDrop");
    expect(appSource).toContain("handleAvatarPaste");
    expect(appSource).toContain("handleAvatarDragOver");
    expect(appSource).toContain("onDrop={handleAvatarDrop}");
    expect(appSource).toContain("onPaste={handleAvatarPaste}");
    expect(appSource).toContain("onDragOver={handleAvatarDragOver}");
    expect(appSource).toContain("avatar-upload-field");
    expect(appSource).not.toContain('type="file"');
    expect(appSource).not.toContain("openAvatarFilePicker");
    expect(appSource).toContain("avatarImageName");
    expect(appSource).toContain("avatar-layer");
    expect(appSource).toContain("avatar-layer-title");
    expect(appSource).toContain("avatarScale");
    expect(appSource).toContain("avatarOffsetX");
    expect(appSource).toContain("avatarOffsetY");
    expect(appSource).toContain("avatar-tagline");
    expect(appSource).toContain("tagline");
    expect(appSource).toContain("imageSrc");
    expect(appSource).not.toContain("<strong>{mood.label}</strong>");
    const hudStackStart = appSource.indexOf('<div className="hud-stack">');
    const avatarLayerStart = appSource.indexOf('<div className="avatar-layer">');
    const avatarPanelUse = appSource.indexOf("<AvatarHudPanel config={avatarConfig} />");

    expect(hudStackStart).toBeGreaterThanOrEqual(0);
    expect(avatarLayerStart).toBeGreaterThan(hudStackStart);
    expect(avatarPanelUse).toBeGreaterThan(avatarLayerStart);
    expect(css).toContain(".avatar-hud-panel");
    expect(css).toContain(".avatar-layer");
    expect(css).toContain(".avatar-layer-title");
    expect(css).toContain(".avatar-hud-portrait img");
    expect(css).toContain("transform: translate(var(--avatar-x), var(--avatar-y)) scale(var(--avatar-scale))");
    expect(css).toContain("object-fit: cover");
    expect(css).toContain(".avatar-panel");
    expect(css).toContain(".avatar-upload-field");
    expect(css).toContain(".avatar-upload-field:focus-visible");
    expect(css).not.toContain(".avatar-preview");
  });

  it("keeps the quest HUD as a separate overlay and editable on the current page", async () => {
    const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(appSource).toContain("QuestHudPanel");
    expect(appSource).toContain("quest-layer");
    expect(appSource).toContain("quest-hud-panel");
    expect(appSource).toContain("quest-panel");
    expect(appSource).toContain("quest-title");
    expect(appSource).toContain("quest-hold-seconds");
    expect(appSource).toContain("exportQuestToVideo");
    expect(appSource).toContain("handleQuestExport");
    expect(appSource).toContain("questResult.savedPath");
    expect(appSource).toContain("shouldUseBrowserDownload(result)");
    expect(appSource).not.toContain("quest-detail");
    expect(appSource).not.toContain("quest-reward");
    expect(appSource).not.toContain("quest-progress");
    expect(appSource).toContain("replayQuestNotice");
    expect(appSource).toContain("播放任务动画");
    expect(appSource).toContain("导出视频");
    expect(appSource).toContain("questDurationSeconds");
    expect(appSource).toContain("--quest-duration");
    expect(appSource).toContain('start: { label: "MISSION START" }');
    expect(appSource).toContain('active: { label: "MISSION ACTIVE" }');
    expect(appSource).toContain('completed: { label: "MISSION COMPLETE" }');
    expect(appSource).toContain('failed: { label: "MISSION FAILED" }');
    expect(appSource).not.toContain('state: "completed"');

    const hudStackStart = appSource.indexOf('<div className="hud-stack">');
    const avatarLayerStart = appSource.indexOf('<div className="avatar-layer">');
    const avatarPanelUse = appSource.indexOf("<AvatarHudPanel config={avatarConfig} />");
    const questLayerStart = appSource.indexOf('<div className="quest-layer">');

    expect(hudStackStart).toBeGreaterThanOrEqual(0);
    expect(avatarLayerStart).toBeGreaterThan(hudStackStart);
    expect(questLayerStart).toBeGreaterThan(avatarPanelUse);
    const questPanelStyleStart = css.indexOf(".quest-hud-panel {");
    const questPanelStyleEnd = css.indexOf(".quest-hud-panel::before");
    const questPanelStyle = css.slice(questPanelStyleStart, questPanelStyleEnd);
    const questNoticeStart = css.indexOf("@keyframes quest-notice");
    const questNoticeEnd = css.indexOf("@media", questNoticeStart);
    const questNoticeKeyframes = css.slice(questNoticeStart, questNoticeEnd);

    expect(questPanelStyleStart).toBeGreaterThanOrEqual(0);
    expect(questPanelStyleEnd).toBeGreaterThan(questPanelStyleStart);
    expect(questNoticeStart).toBeGreaterThanOrEqual(0);
    expect(questNoticeEnd).toBeGreaterThan(questNoticeStart);
    expect(css).toContain(".quest-layer");
    expect(css).toContain(".quest-hud-panel");
    expect(css).toContain("--quest-accent");
    expect(css).toContain(".quest-hud-panel::before");
    expect(css).toContain("linear-gradient(90deg");
    expect(css).toContain("border-left");
    expect(css).toContain("var(--quest-duration");
    expect(questPanelStyle).not.toContain("border: 1px solid");
    expect(questPanelStyle).not.toContain("0 16px 42px rgba(0, 0, 0, 0.3)");
    expect(questNoticeKeyframes).toContain("transform: translateX(-42px) scale(0.96)");
    expect(questNoticeKeyframes).toContain("transform: translateX(-48px) scale(0.98)");
    expect(questNoticeKeyframes).not.toContain("transform: translateX(42px) scale(0.98)");
    expect(css).not.toContain(".quest-hud-mark");
    expect(css).not.toContain(".quest-progress-fill");
    expect(css).toContain(".quest-panel");
    expect(css).toContain(".export-result span");
  });
});
