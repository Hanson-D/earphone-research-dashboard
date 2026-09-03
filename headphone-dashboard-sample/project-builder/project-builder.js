"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const Core = require("../dashboard-core.js");

function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const table = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some(value => value !== "")) table.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (cell || row.length) {
    row.push(cell);
    if (row.some(value => value !== "")) table.push(row);
  }
  if (!table.length) throw new Error("CSV is empty.");
  const headers = table[0].map(header => header.trim());
  if (headers.some(header => !header)) throw new Error("CSV contains an empty header.");
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`CSV contains duplicate headers: ${[...new Set(duplicates)].join(", ")}`);
  return table.slice(1).map(values => Object.fromEntries(
    headers.map((header, index) => [header, values[index]?.trim() ?? ""])
  ));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, headers) {
  return [headers, ...rows.map(row => headers.map(header => row[header] ?? ""))]
    .map(row => row.map(csvEscape).join(","))
    .join("\r\n") + "\r\n";
}

function firstMatching(headers, patterns) {
  for (const pattern of patterns) {
    const field = headers.find(header => pattern.test(header));
    if (field) return field;
  }
  return "";
}

function inferMappingFields(rows, configured = {}) {
  const headers = Object.keys(rows[0] || {});
  const userField = configured.userField || firstMatching(headers, [
    /^(name|姓名|user_name|用户姓名)$/i,
    /^(user_id|participant_id|subject_id|用户编号|用户id)$/i,
    /user|participant|subject|姓名|用户|受试者/i
  ]);
  const earField = configured.earField === null ? "" : (configured.earField || firstMatching(headers, [
    /ear_side|左右耳|耳侧|left_right|side/i
  ]));
  const deviceField = configured.deviceField === null ? "" : (configured.deviceField || firstMatching(headers, [
    /^device_name$/i,
    /prototype|sample|样机|device_name|device_id|condition|设备|条件/i
  ]));
  if (!userField || !headers.includes(userField)) {
    throw new Error(`Cannot infer the user field. Available headers: ${headers.join(", ")}`);
  }
  for (const [label, field] of [["ear", earField], ["device", deviceField]]) {
    if (field && !headers.includes(field)) throw new Error(`Configured ${label} field does not exist: ${field}`);
  }
  return { userField, earField, deviceField };
}

async function scanPhotoDirectory(photoRoot) {
  const resolvedRoot = path.resolve(photoRoot);
  const stat = await fsp.stat(resolvedRoot).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Photo directory was not found: ${resolvedRoot}`);
  const photos = [];
  async function visit(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => Core.naturalCompare(a.name, b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && Core.isImagePath(entry.name)) {
        const relative = path.relative(resolvedRoot, absolute).split(path.sep).join("/");
        const parts = relative.split("/");
        photos.push({
          name: entry.name,
          relative_path: relative,
          absolute_path: absolute,
          user_folder: parts.length > 1 ? parts[0] : ""
        });
      }
    }
  }
  await visit(resolvedRoot);
  photos.sort((a, b) => Core.naturalCompare(a.relative_path, b.relative_path));
  return photos;
}

function normalizeViews(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return String(value || "").split(/[,，]/).map(item => item.trim()).filter(Boolean);
}

function mappingOptions(rows, photos, config = {}) {
  const fields = inferMappingFields(rows, config.mappingFields || config);
  const requestedMode = config.mode || config.mappingMode || "auto";
  if (!["auto", "folders", "sequence"].includes(requestedMode)) {
    throw new Error(`Unknown mapping mode: ${requestedMode}`);
  }
  const template = config.protocolTemplate || {};
  const templateViews = normalizeViews(template.photoSchema?.views);
  const configuredViews = normalizeViews(config.views || config.mappingViews);
  const folderViews = Core.inferFolderViews(rows, photos, fields);
  const mode = requestedMode === "auto" ? (folderViews.length ? "folders" : "sequence") : requestedMode;
  const views = mode === "folders" ? (templateViews.length ? templateViews : (configuredViews.length ? configuredViews : folderViews)) :
    (configuredViews.length ? configuredViews : templateViews);
  if (!views.length) {
    throw new Error(mode === "sequence" ?
      "Sequence mode requires --views (for example: 正面,侧面,后侧)." :
      "No photo views could be inferred from the folder structure.");
  }
  const expectedEars = normalizeViews(config.expectedEars || template.photoSchema?.ears);
  return {
    mode,
    ...fields,
    views,
    expectedEars,
    photoEarMode: Boolean(config.photoEarMode),
    includeBareEar: Boolean(config.includeBareEarPhotos),
    bareEarConfig: config.bareEarConfig || undefined,
    singleEarMode: Boolean(config.singleEarMode),
    overrides: config.photoMappingOverrides || {}
  };
}

function buildAudit(mappedResult, options) {
  const labels = Object.fromEntries((mappedResult.photoViews || []).map(item => [item.field, item.label]));
  return Core.buildPhotoAuditRows(mappedResult.reviews, mappedResult.photoFields, mappedResult.mapped, {
    deviceField: options.deviceField,
    viewLabels: labels
  });
}

function buildProjectDocument(rows, mappedResult, options, config = {}) {
  const fieldRoles = Core.resolveFieldRoles(Object.keys(mappedResult.mapped[0] || {}), mappedResult.mapped,
    config.fieldRoleOverrides || config.dashboardConfig?.fieldRoleOverrides || {});
  return Core.buildProjectDocument({
    title: config.projectName,
    rows: mappedResult.mapped,
    mappingRows: rows,
    sourceCsv: `data/${path.basename(config.csvPath)}`,
    photoRoot: "photos",
    mappingMode: options.mode,
    mappingFields: {
      userField: options.userField,
      earField: options.earField,
      deviceField: options.deviceField,
      includeBareEarPhotos: options.includeBareEar,
      bareEarConfig: options.bareEarConfig || {},
      singleEarMode: options.singleEarMode
    },
    mappingViews: options.views,
    photoMappingOverrides: options.overrides,
    protocolTemplate: config.protocolTemplate || null,
    dashboardConfig: {
      ...(config.dashboardConfig || {}),
      fieldRoleOverrides: fieldRoles
    }
  });
}

function safeProjectName(value) {
  const name = String(value || "").trim().replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_").replace(/^\.+|[. ]+$/g, "");
  if (!name) throw new Error("Project name is empty or invalid.");
  return name.slice(0, 120);
}

async function copyPhotos(photos, destination) {
  for (const photo of photos) {
    const target = path.join(destination, ...photo.relative_path.split("/"));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(photo.absolute_path, target, fs.constants.COPYFILE_EXCL);
  }
}

async function createProject(config) {
  const csvPath = path.resolve(config.csvPath || "");
  const photoRoot = path.resolve(config.photoRoot || "");
  const outputRoot = path.resolve(config.outputRoot || "projects");
  const projectName = safeProjectName(config.projectName || path.basename(csvPath, path.extname(csvPath)));
  const csvText = await fsp.readFile(csvPath, "utf8").catch(error => {
    throw new Error(`Cannot read CSV ${csvPath}: ${error.message}`);
  });
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("CSV has headers but no data rows.");
  const photos = await scanPhotoDirectory(photoRoot);
  if (!photos.length) throw new Error(`No supported images were found in: ${photoRoot}`);
  const normalizedConfig = { ...config, csvPath, photoRoot, outputRoot, projectName };
  const options = mappingOptions(rows, photos, normalizedConfig);
  const mappedResult = Core.mapPhotosToRows(rows, photos, options);
  const audit = buildAudit(mappedResult, options);
  const project = buildProjectDocument(rows, mappedResult, options, normalizedConfig);
  const summary = {
    projectName,
    mode: options.mode,
    fields: { userField: options.userField, earField: options.earField, deviceField: options.deviceField },
    headers: Object.keys(rows[0] || {}),
    views: options.views,
    csvRows: rows.length,
    outputRows: mappedResult.mapped.length,
    photos: photos.length,
    photoFields: mappedResult.photoFields,
    issues: audit.length
  };
  if (config.failOnIssues && audit.length) {
    const error = new Error(`Photo mapping found ${audit.length} issue(s); no project was written.`);
    error.code = "MAPPING_ISSUES";
    error.summary = summary;
    throw error;
  }
  if (config.dryRun) return { project, audit, summary, outputPath: "" };
  await fsp.mkdir(outputRoot, { recursive: true });
  const target = path.join(outputRoot, projectName);
  if (await fsp.stat(target).catch(() => null)) throw new Error(`Output project already exists: ${target}`);
  const staging = path.join(outputRoot, `.project-builder-${process.pid}-${Date.now()}`);
  try {
    await fsp.mkdir(path.join(staging, "data"), { recursive: true });
    await fsp.mkdir(path.join(staging, "photos"), { recursive: true });
    await fsp.mkdir(path.join(staging, "exports"), { recursive: true });
    await fsp.copyFile(csvPath, path.join(staging, "data", path.basename(csvPath)), fs.constants.COPYFILE_EXCL);
    await copyPhotos(photos, path.join(staging, "photos"));
    await fsp.writeFile(path.join(staging, `${projectName}.json`), JSON.stringify(project, null, 2) + "\n", "utf8");
    const auditHeaders = ["status", "user", "device", "rowIndex", "field", "view", "message"];
    const auditRows = audit.length ? audit : [{ status: "ok", message: "未发现缺失照片或映射异常" }];
    await fsp.writeFile(path.join(staging, "exports", "photo_mapping_audit.csv"), "\uFEFF" + toCsv(auditRows, auditHeaders), "utf8");
    await fsp.writeFile(path.join(staging, "exports", "build-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
    await fsp.rename(staging, target);
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return { project, audit, summary, outputPath: target };
}

module.exports = {
  parseCsv,
  toCsv,
  inferMappingFields,
  scanPhotoDirectory,
  mappingOptions,
  buildAudit,
  buildProjectDocument,
  safeProjectName,
  createProject
};
