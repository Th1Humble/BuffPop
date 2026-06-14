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
    expect(css).toContain("bottom: 7%");
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
});
