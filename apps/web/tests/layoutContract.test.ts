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
});
