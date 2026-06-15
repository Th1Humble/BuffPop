import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiServer, createHealthPayload, type ApiServerDependencies } from "../src/server.js";
import type { NormalizedExportRequest } from "../src/exportWebm.js";

const openServers: ReturnType<typeof createApiServer>[] = [];

function listen(server: ReturnType<typeof createApiServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
    ),
  );
});

describe("api health", () => {
  it("documents that the backend is Node.js with TypeScript", () => {
    expect(createHealthPayload()).toMatchObject({
      service: "BuffPop API",
      status: "ok",
      runtime: "Node.js + TypeScript",
      role: "local render backend",
      renderer: "Remotion video renderer",
    });
  });

  it("serves the health payload over HTTP", async () => {
    const server = createApiServer();
    openServers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      service: "BuffPop API",
      runtime: "Node.js + TypeScript",
      status: "ok",
    });
  });

  it("saves rendered quest videos to a local downloads directory and reports the path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "buffpop-api-downloads-"));
    const renderedBuffer = Buffer.from("quest-video");
    const renderVideo = vi.fn(async (_request: NormalizedExportRequest) => renderedBuffer);
    const dependencies: ApiServerDependencies = {
      downloadsDirectory: directory,
      renderVideo,
    };
    const server = createApiServer(dependencies);
    openServers.push(server);
    const port = await listen(server);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/export/video`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "quest",
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
            format: "mov-prores-alpha",
          },
        }),
      });

      const savedPath = decodeURIComponent(response.headers.get("x-buffpop-saved-path") ?? "");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toContain("buffpop-quest.mov");
      expect(savedPath).toBe(join(directory, "buffpop-quest.mov"));
      expect(Buffer.from(await response.arrayBuffer())).toEqual(renderedBuffer);
      expect(await readFile(savedPath ?? "")).toEqual(renderedBuffer);
      expect(renderVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "quest",
          preset: expect.objectContaining({ format: "mov-prores-alpha" }),
        }),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing exported videos", async () => {
    const directory = await mkdtemp(join(tmpdir(), "buffpop-api-downloads-"));
    const originalBuffer = Buffer.from("existing-video");
    const renderedBuffer = Buffer.from("new-video");
    const renderVideo = vi.fn(async (_request: NormalizedExportRequest) => renderedBuffer);
    const dependencies: ApiServerDependencies = {
      downloadsDirectory: directory,
      renderVideo,
    };
    const server = createApiServer(dependencies);
    openServers.push(server);
    const port = await listen(server);
    const originalPath = join(directory, "buffpop-quest.mov");

    try {
      await writeFile(originalPath, originalBuffer);

      const response = await fetch(`http://127.0.0.1:${port}/export/video`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "quest",
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
            format: "mov-prores-alpha",
          },
        }),
      });

      const savedPath = decodeURIComponent(response.headers.get("x-buffpop-saved-path") ?? "");

      expect(response.status).toBe(200);
      expect(savedPath).toBe(join(directory, "buffpop-quest-1.mov"));
      expect(await readFile(originalPath)).toEqual(originalBuffer);
      expect(await readFile(savedPath)).toEqual(renderedBuffer);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
