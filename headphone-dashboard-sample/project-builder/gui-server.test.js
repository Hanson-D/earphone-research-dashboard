"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createGuiServer } = require("./gui-server.js");

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise(resolve => server.close(resolve));
}

async function makeInput() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "builder-gui-"));
  const csvPath = path.join(root, "study.csv");
  const photoRoot = path.join(root, "photos");
  const outputRoot = path.join(root, "projects");
  await fsp.writeFile(csvPath, "user_id,device_name\nU001,A\n", "utf8");
  await fsp.mkdir(path.join(photoRoot, "U001"), { recursive: true });
  await fsp.writeFile(path.join(photoRoot, "U001", "1.jpg"), "placeholder");
  return { root, csvPath, photoRoot, outputRoot };
}

test("GUI serves its local interface with a restrictive content policy", async t => {
  const { server } = createGuiServer({ token: "test-token" });
  t.after(() => close(server));
  const base = await listen(server);
  const response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(await response.text(), /项目制作器/);
});

test("GUI API rejects requests without its local session token", async t => {
  const { server } = createGuiServer({ token: "test-token" });
  t.after(() => close(server));
  const base = await listen(server);
  const response = await fetch(base + "/api/health");
  assert.equal(response.status, 403);
});

test("GUI preview and build endpoints use the same project core", async t => {
  const input = await makeInput();
  t.after(() => fsp.rm(input.root, { recursive: true, force: true }));
  const { server } = createGuiServer({ token: "test-token" });
  t.after(() => close(server));
  const base = await listen(server);
  const config = { ...input, projectName: "GUI研究", mode: "sequence", views: ["正面"] };
  const request = route => fetch(base + route, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Builder-Token": "test-token" },
    body: JSON.stringify(config)
  });

  const previewResponse = await request("/api/preview");
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.summary.issues, 0);
  assert.equal(await fsp.stat(path.join(input.outputRoot, "GUI研究")).catch(() => null), null);

  const buildResponse = await request("/api/build");
  assert.equal(buildResponse.status, 200);
  const built = await buildResponse.json();
  assert.equal(built.summary.projectName, "GUI研究");
  assert.equal(built.outputPath, path.join(input.outputRoot, "GUI研究"));
  assert.ok(await fsp.stat(path.join(built.outputPath, "GUI研究.json")));
});
