"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createProject } = require("./project-builder.js");

const execFileAsync = promisify(execFile);
const UI_ROOT = path.join(__dirname, "ui");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

async function readJsonBody(request, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function pickPath(kind) {
  if (!["csv", "photos", "output"].includes(kind)) throw new Error("Unknown picker type.");
  if (process.platform === "win32") {
    const script = kind === "csv" ?
      "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Filter='CSV files (*.csv)|*.csv|All files (*.*)|*.*'; if($d.ShowDialog() -eq 'OK'){[Console]::Write($d.FileName)}" :
      `Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='${kind === "photos" ? "选择照片根文件夹" : "选择项目输出文件夹"}'; if($d.ShowDialog() -eq 'OK'){[Console]::Write($d.SelectedPath)}`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], { windowsHide: true });
    return stdout.trim();
  }
  if (process.platform === "darwin") {
    const script = kind === "csv" ?
      'POSIX path of (choose file with prompt "选择 CSV")' :
      `POSIX path of (choose folder with prompt "${kind === "photos" ? "选择照片根文件夹" : "选择项目输出文件夹"}")`;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    return stdout.trim().replace(/\/$/, "");
  }
  const args = ["--file-selection", `--title=${kind === "csv" ? "选择 CSV" : kind === "photos" ? "选择照片根文件夹" : "选择项目输出文件夹"}`];
  if (kind !== "csv") args.push("--directory");
  const { stdout } = await execFileAsync("zenity", args);
  return stdout.trim();
}

function openBrowser(url) {
  const command = process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", "start", "", url]] :
    process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const child = execFile(command[0], command[1], { windowsHide: false }, () => {});
  child.unref();
}

async function serveStatic(requestPath, response) {
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const target = path.resolve(UI_ROOT, relative);
  if (target !== UI_ROOT && !target.startsWith(UI_ROOT + path.sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await fsp.readFile(target);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(target)] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

function createGuiServer(options = {}) {
  const token = options.token || crypto.randomBytes(24).toString("hex");
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      if (url.pathname.startsWith("/api/")) {
        if (request.headers["x-builder-token"] !== token) {
          sendJson(response, 403, { error: "Invalid local session token." });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/health") {
          sendJson(response, 200, { ok: true, platform: process.platform });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/pick") {
          const body = await readJsonBody(request);
          sendJson(response, 200, { path: await pickPath(body.kind) });
          return;
        }
        if (request.method === "POST" && (url.pathname === "/api/preview" || url.pathname === "/api/build")) {
          const config = await readJsonBody(request);
          const preview = url.pathname === "/api/preview";
          const result = await createProject({ ...config, dryRun: preview, failOnIssues: false });
          sendJson(response, 200, {
            summary: result.summary,
            audit: result.audit.slice(0, 1000),
            outputPath: result.outputPath,
            truncatedAudit: result.audit.length > 1000
          });
          return;
        }
        sendJson(response, 404, { error: "Unknown API route." });
        return;
      }
      await serveStatic(url.pathname, response);
    } catch (error) {
      sendJson(response, 400, { error: error.message, code: error.code || "BUILD_ERROR", summary: error.summary || null });
    }
  });
  return { server, token };
}

async function startGui(options = {}) {
  const { server, token } = createGuiServer(options);
  const port = Number(options.port) || 0;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/?token=${token}`;
  process.stdout.write(`看板项目制作器：${url}\n`);
  if (options.openBrowser !== false) openBrowser(url);
  return { server, token, url };
}

module.exports = { createGuiServer, startGui, pickPath };

if (require.main === module) {
  startGui().catch(error => {
    process.stderr.write(`启动失败：${error.message}\n`);
    process.exitCode = 1;
  });
}
