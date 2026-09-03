"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Core = require("../dashboard-core.js");
const {
  parseCsv,
  inferMappingFields,
  scanPhotoDirectory,
  mappingOptions,
  createProject
} = require("./project-builder.js");

async function fixture() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "dashboard-project-builder-"));
  return {
    root,
    csv: path.join(root, "study.csv"),
    photos: path.join(root, "input-photos"),
    output: path.join(root, "projects")
  };
}

async function writePhoto(root, relative) {
  const target = path.join(root, ...relative.split("/"));
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, "test-image-placeholder");
  return target;
}

test("parseCsv supports BOM, quoted commas, escaped quotes, and newlines", () => {
  const rows = parseCsv('\uFEFFuser_id,comment\r\nU001,"hello, ""world"""\r\nU002,"two\nlines"\r\n');
  assert.deepEqual(rows, [
    { user_id: "U001", comment: 'hello, "world"' },
    { user_id: "U002", comment: "two\nlines" }
  ]);
});

test("parseCsv rejects duplicate headers", () => {
  assert.throws(() => parseCsv("user_id,user_id\nU001,U001\n"), /duplicate headers/);
});

test("mapping fields are inferred with the same naming conventions as the dashboard", () => {
  const fields = inferMappingFields([{ 姓名: "张三", 耳侧: "左耳", 样机: "A" }]);
  assert.deepEqual(fields, { userField: "姓名", earField: "耳侧", deviceField: "样机" });
});

test("auto mode chooses folder mapping and infers views", async t => {
  const work = await fixture();
  t.after(() => fsp.rm(work.root, { recursive: true, force: true }));
  await writePhoto(work.photos, "张三/左耳/样机A/正面/a.jpg");
  const rows = [{ 姓名: "张三", 耳侧: "左耳", 样机: "样机A" }];
  const photos = await scanPhotoDirectory(work.photos);
  const options = mappingOptions(rows, photos, { mode: "auto" });
  assert.equal(options.mode, "folders");
  assert.deepEqual(options.views, ["正面"]);
});

test("folder build writes a portable project accepted by the dashboard", async t => {
  const work = await fixture();
  t.after(() => fsp.rm(work.root, { recursive: true, force: true }));
  await fsp.writeFile(work.csv, "\uFEFF姓名,耳侧,样机,comfort_score\n张三,左耳,样机A,8\n", "utf8");
  await writePhoto(work.photos, "张三/左耳/样机A/正面/a.jpg");

  const result = await createProject({
    csvPath: work.csv,
    photoRoot: work.photos,
    outputRoot: work.output,
    projectName: "研究A",
    mode: "folders"
  });

  assert.equal(result.summary.issues, 0);
  assert.equal(result.summary.mode, "folders");
  const projectPath = path.join(work.output, "研究A", "研究A.json");
  const raw = JSON.parse(await fsp.readFile(projectPath, "utf8"));
  const clean = Core.sanitizeProjectDocument(raw);
  assert.equal(clean.title, "研究A");
  assert.equal(clean.sourceCsv, "data/study.csv");
  assert.equal(clean.photoRoot, "photos");
  assert.equal(clean.rows[0].photo_左耳_正面, "张三/左耳/样机A/正面/a.jpg");
  assert.equal(await fsp.readFile(path.join(work.output, "研究A", "photos", "张三", "左耳", "样机A", "正面", "a.jpg"), "utf8"), "test-image-placeholder");
  assert.match(await fsp.readFile(path.join(work.output, "研究A", "exports", "photo_mapping_audit.csv"), "utf8"), /未发现缺失照片/);
});

test("sequence build follows natural filename order", async t => {
  const work = await fixture();
  t.after(() => fsp.rm(work.root, { recursive: true, force: true }));
  await fsp.writeFile(work.csv, "user_id,device_name\nU001,A\nU001,B\n", "utf8");
  await writePhoto(work.photos, "U001/10.jpg");
  await writePhoto(work.photos, "U001/2.jpg");

  const result = await createProject({
    csvPath: work.csv,
    photoRoot: work.photos,
    outputRoot: work.output,
    projectName: "sequence-test",
    mode: "sequence",
    views: ["正面"]
  });

  assert.equal(result.project.rows[0].photo_正面, "U001/2.jpg");
  assert.equal(result.project.rows[1].photo_正面, "U001/10.jpg");
  assert.equal(result.summary.issues, 0);
});

test("strict dry run reports mapping issues and writes nothing", async t => {
  const work = await fixture();
  t.after(() => fsp.rm(work.root, { recursive: true, force: true }));
  await fsp.writeFile(work.csv, "user_id,device_name\nU001,A\n", "utf8");
  await writePhoto(work.photos, "U001/1.jpg");

  await assert.rejects(createProject({
    csvPath: work.csv,
    photoRoot: work.photos,
    outputRoot: work.output,
    projectName: "strict-test",
    mode: "sequence",
    views: ["正面", "侧面"],
    dryRun: true,
    failOnIssues: true
  }), error => error.code === "MAPPING_ISSUES" && error.summary.issues > 0);
  assert.equal(await fsp.stat(path.join(work.output, "strict-test")).catch(() => null), null);
});

test("existing project directories are never overwritten", async t => {
  const work = await fixture();
  t.after(() => fsp.rm(work.root, { recursive: true, force: true }));
  await fsp.writeFile(work.csv, "user_id\nU001\n", "utf8");
  await writePhoto(work.photos, "U001/1.jpg");
  await fsp.mkdir(path.join(work.output, "existing"), { recursive: true });
  await assert.rejects(createProject({
    csvPath: work.csv,
    photoRoot: work.photos,
    outputRoot: work.output,
    projectName: "existing",
    mode: "sequence",
    views: ["正面"]
  }), /already exists/);
});
