import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApiServer, createHealthPayload } from "../src/server.js";

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
});
