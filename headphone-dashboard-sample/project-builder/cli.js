#!/usr/bin/env node
"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { createProject } = require("./project-builder.js");

const HELP = `
耳机看板项目制作器

Usage:
  project-builder                         打开本地操作界面
  project-builder gui                     打开本地操作界面
  project-builder gui --no-open --port 7390
  node project-builder/cli.js build --csv FILE --photos DIR --output DIR [options]

Required:
  --csv FILE                 源 CSV
  --photos DIR               照片根目录
  --output DIR               projects 输出根目录

Options:
  --project-name NAME        项目名称，默认使用 CSV 文件名
  --mode auto|folders|sequence
  --user-field FIELD
  --ear-field FIELD          使用 --no-ear-field 明确表示没有耳侧列
  --device-field FIELD       使用 --no-device-field 明确表示没有设备列
  --views 正面,侧面,后侧     顺序模式必填；文件夹模式可以自动识别
  --config FILE              JSON 配置文件；命令行参数覆盖配置
  --template FILE            项目模板 JSON
  --single-ear               强制单耳模式
  --photo-ear-mode           CSV 无耳侧列，照片按左右耳分列
  --include-bare-ear         顺序模式预留空耳照片
  --fail-on-issues           有缺失或重复照片时不写出项目
  --dry-run                  只扫描和验证，不写文件
  --json                     仅输出机器可读 JSON
  --help
`;

function parseArgs(argv) {
  const values = {};
  const booleanFlags = new Set(["single-ear", "photo-ear-mode", "include-bare-ear", "fail-on-issues", "dry-run", "json", "help", "no-ear-field", "no-device-field", "no-open"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (booleanFlags.has(key)) values[key] = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
      values[key] = value;
      index += 1;
    }
  }
  return values;
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(path.resolve(file), "utf8"));
}

function resolveConfigPaths(config, configFile) {
  if (!configFile) return config;
  const base = path.dirname(path.resolve(configFile));
  const resolved = { ...config };
  for (const key of ["csvPath", "photoRoot", "outputRoot"]) {
    if (resolved[key] && !path.isAbsolute(resolved[key])) resolved[key] = path.resolve(base, resolved[key]);
  }
  return resolved;
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "gui") {
    const guiArgs = parseArgs(argv.slice(argv[0] === "gui" ? 1 : 0));
    await require("./gui-server.js").startGui({
      openBrowser: !guiArgs["no-open"],
      port: guiArgs.port ? Number(guiArgs.port) : 0
    });
    return;
  }
  const command = argv[0] && !argv[0].startsWith("--") ? argv.shift() : "build";
  const args = parseArgs(argv);
  if (args.help || command === "help") {
    process.stdout.write(HELP.trimStart());
    return;
  }
  if (command !== "build") throw new Error(`Unknown command: ${command}`);
  const fileConfig = resolveConfigPaths(args.config ? await readJson(args.config) : {}, args.config);
  const protocolTemplate = args.template ? await readJson(args.template) : fileConfig.protocolTemplate;
  const cliMappingFields = {};
  if (args["user-field"]) cliMappingFields.userField = args["user-field"];
  if (args["ear-field"]) cliMappingFields.earField = args["ear-field"];
  if (args["no-ear-field"]) cliMappingFields.earField = null;
  if (args["device-field"]) cliMappingFields.deviceField = args["device-field"];
  if (args["no-device-field"]) cliMappingFields.deviceField = null;
  const config = {
    ...fileConfig,
    ...(args.csv ? { csvPath: args.csv } : {}),
    ...(args.photos ? { photoRoot: args.photos } : {}),
    ...(args.output ? { outputRoot: args.output } : {}),
    ...(args["project-name"] ? { projectName: args["project-name"] } : {}),
    ...(args.mode ? { mode: args.mode } : {}),
    ...(args.views ? { views: args.views } : {}),
    mappingFields: { ...(fileConfig.mappingFields || {}), ...cliMappingFields },
    protocolTemplate,
    singleEarMode: args["single-ear"] || Boolean(fileConfig.singleEarMode),
    photoEarMode: args["photo-ear-mode"] || Boolean(fileConfig.photoEarMode),
    includeBareEarPhotos: args["include-bare-ear"] || Boolean(fileConfig.includeBareEarPhotos),
    failOnIssues: args["fail-on-issues"] || Boolean(fileConfig.failOnIssues),
    dryRun: args["dry-run"] || Boolean(fileConfig.dryRun)
  };
  for (const required of ["csvPath", "photoRoot", "outputRoot"]) {
    if (!config[required]) throw new Error(`Missing required setting: ${required}`);
  }
  const result = await createProject(config);
  const payload = { ...result.summary, outputPath: result.outputPath, dryRun: config.dryRun };
  if (args.json) process.stdout.write(JSON.stringify(payload) + "\n");
  else {
    process.stdout.write(`项目：${payload.projectName}\n`);
    process.stdout.write(`模式：${payload.mode} · CSV ${payload.csvRows} 行 · 照片 ${payload.photos} 张\n`);
    process.stdout.write(`映射：${payload.photoFields.length} 个照片字段 · ${payload.issues} 个检查项\n`);
    process.stdout.write(config.dryRun ? "验证完成，未写文件。\n" : `输出：${payload.outputPath}\n`);
  }
}

main().catch(error => {
  process.stderr.write(`项目生成失败：${error.message}\n`);
  if (error.summary) process.stderr.write(JSON.stringify(error.summary) + "\n");
  process.exitCode = error.code === "MAPPING_ISSUES" ? 2 : 1;
});
