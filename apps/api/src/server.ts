import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  exportFilename,
  exportMimeType,
  normalizeExportRequest,
  renderVideo,
  renderWebm,
  type ExportRequestPayload,
} from "./exportWebm.js";

export type HealthPayload = {
  service: string;
  status: "ok";
  runtime: string;
  role: string;
  renderer: string;
};

export function createHealthPayload(): HealthPayload {
  return {
    service: "BuffPop API",
    status: "ok",
    runtime: "Node.js + TypeScript",
    role: "local render backend",
    renderer: "Remotion video renderer",
  };
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "http://127.0.0.1:5188",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function writeVideo(response: ServerResponse, buffer: Buffer, format: ExportRequestPayload["preset"]["format"]) {
  response.writeHead(200, {
    "access-control-allow-origin": "http://127.0.0.1:5188",
    "content-disposition": `attachment; filename="${exportFilename(format)}"`,
    "content-length": buffer.byteLength,
    "content-type": exportMimeType(format),
  });
  response.end(buffer);
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, createHealthPayload());
    return;
  }

  if (request.method === "POST" && url.pathname === "/export/webm") {
    try {
      const payload = (await readJsonBody(request)) as ExportRequestPayload;
      const buffer = await renderWebm(payload);
      writeVideo(response, buffer, "webm-alpha");
    } catch (error) {
      writeJson(response, 400, {
        error: "export_failed",
        message: error instanceof Error ? error.message : "Could not export WebM.",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/export/video") {
    try {
      const payload = (await readJsonBody(request)) as ExportRequestPayload;
      const requestPayload = normalizeExportRequest(payload);
      const buffer = await renderVideo(requestPayload);
      writeVideo(response, buffer, requestPayload.preset.format);
    } catch (error) {
      writeJson(response, 400, {
        error: "export_failed",
        message: error instanceof Error ? error.message : "Could not export video.",
      });
    }
    return;
  }

  writeJson(response, 404, {
    error: "not_found",
    message: "Route not found.",
  });
}

export function createApiServer(): Server {
  return createServer(handleRequest);
}

export function startApiServer(port = Number(process.env.PORT ?? 5190)): Server {
  const server = createApiServer();

  server.listen(port, "127.0.0.1", () => {
    console.log(`BuffPop API listening on http://127.0.0.1:${port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startApiServer();
}
