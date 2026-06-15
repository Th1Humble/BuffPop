import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, basename } from "node:path";
import {
  exportFilename,
  exportMimeType,
  normalizeExportRequest,
  renderVideo,
  type ExportRequestPayload,
  type NormalizedExportRequest,
} from "./exportWebm.js";

export type HealthPayload = {
  service: string;
  status: "ok";
  runtime: string;
  role: string;
  renderer: string;
};

export type ApiServerDependencies = {
  downloadsDirectory?: string;
  renderVideo?: (payload: NormalizedExportRequest) => Promise<Buffer>;
};

function logApiEvent(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      event,
      service: "buffpop-api",
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

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

function getDownloadsDirectory(directory = process.env.BUFFPOP_DOWNLOAD_DIR): string {
  return directory?.trim() || join(homedir(), "Downloads", "BuffPop");
}

function filenameCandidate(filename: string, index: number): string {
  if (index === 0) {
    return filename;
  }

  const extension = extname(filename);
  const name = basename(filename, extension);

  return `${name}-${index}${extension}`;
}

async function saveVideoToDownloads({
  buffer,
  filename,
  downloadsDirectory,
}: {
  buffer: Buffer;
  filename: string;
  downloadsDirectory?: string;
}): Promise<string> {
  const directory = getDownloadsDirectory(downloadsDirectory);

  await mkdir(directory, { recursive: true });

  for (let index = 0; index < 1000; index += 1) {
    const outputPath = join(directory, filenameCandidate(filename, index));

    try {
      await writeFile(outputPath, buffer, { flag: "wx" });

      return outputPath;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Could not find an available filename for ${filename}.`);
}

function writeVideo(
  response: ServerResponse,
  buffer: Buffer,
  format: ExportRequestPayload["preset"]["format"],
  kind: ExportRequestPayload["kind"] = "status",
  savedPath?: string,
) {
  const headers: Record<string, number | string> = {
    "access-control-allow-origin": "http://127.0.0.1:5188",
    "access-control-expose-headers": "content-disposition, x-buffpop-saved-path",
    "content-disposition": `attachment; filename="${exportFilename(format, kind)}"`,
    "content-length": buffer.byteLength,
    "content-type": exportMimeType(format),
  };

  if (savedPath) {
    headers["x-buffpop-saved-path"] = encodeURIComponent(savedPath);
  }

  response.writeHead(200, {
    ...headers,
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

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiServerDependencies = {},
) {
  const requestStartedAt = Date.now();
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const videoRenderer = dependencies.renderVideo ?? renderVideo;
  const route = `${request.method ?? "UNKNOWN"} ${url.pathname}`;

  logApiEvent("request:start", { route });
  response.on("finish", () => {
    logApiEvent("request:finish", {
      route,
      statusCode: response.statusCode,
      durationMs: Date.now() - requestStartedAt,
    });
  });

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
      const requestPayload = normalizeExportRequest({
        ...payload,
        preset: {
          ...payload.preset,
          format: "webm-alpha",
        },
      });
      logApiEvent("export:render:start", {
        format: requestPayload.preset.format,
        kind: requestPayload.kind,
        width: requestPayload.preset.width,
        height: requestPayload.preset.height,
        fps: requestPayload.preset.fps,
        durationMs: requestPayload.preset.durationMs,
      });
      const buffer = await videoRenderer(requestPayload);
      logApiEvent("export:render:finish", {
        bytes: buffer.byteLength,
        elapsedMs: Date.now() - requestStartedAt,
      });
      const filename = exportFilename("webm-alpha", requestPayload.kind);
      const savedPath = await saveVideoToDownloads({
        buffer,
        filename,
        downloadsDirectory: dependencies.downloadsDirectory,
      });
      writeVideo(response, buffer, "webm-alpha", requestPayload.kind, savedPath);
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
      logApiEvent("export:render:start", {
        format: requestPayload.preset.format,
        kind: requestPayload.kind,
        width: requestPayload.preset.width,
        height: requestPayload.preset.height,
        fps: requestPayload.preset.fps,
        durationMs: requestPayload.preset.durationMs,
      });
      const buffer = await videoRenderer(requestPayload);
      logApiEvent("export:render:finish", {
        bytes: buffer.byteLength,
        elapsedMs: Date.now() - requestStartedAt,
      });
      const filename = exportFilename(requestPayload.preset.format, requestPayload.kind);
      const savedPath = await saveVideoToDownloads({
        buffer,
        filename,
        downloadsDirectory: dependencies.downloadsDirectory,
      });
      writeVideo(response, buffer, requestPayload.preset.format, requestPayload.kind, savedPath);
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

export function createApiServer(dependencies: ApiServerDependencies = {}): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, dependencies);
  });
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
