const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const cssBlock = (css, selector) => css.match(new RegExp(`${selector.replaceAll(".", "\\.")}\\s*{([^}]*)}`))?.[1] || "";

function directSectionClasses(html, parentClass) {
  const tokens = [...html.matchAll(/<\/?section\b[^>]*>/g)];
  const stack = [];
  const children = [];
  for (const token of tokens) {
    const tag = token[0];
    if (tag.startsWith("</")) {
      stack.pop();
      continue;
    }
    const className = tag.match(/class="([^"]+)"/)?.[1] || "";
    if (stack.at(-1) === parentClass) children.push(className);
    stack.push(className);
  }
  return children;
}

test("mapping page is organized as a three-step workflow with optional advanced settings", () => {
  const html = read("index.html");
  const css = read("styles.css");

  assert.match(html, /<section class="mapping-step">[\s\S]*导入 CSV/);
  assert.match(html, /<section class="mapping-step">[\s\S]*照片根目录与规则/);
  assert.match(html, /<section class="mapping-step">[\s\S]*字段与拍照顺序/);
  assert.match(html, /<div class="mapping-run-step">[\s\S]*生成照片映射/);
  assert.match(html, /<details class="advanced-path-input mapping-advanced">[\s\S]*高级：手动输入照片路径/);
  assert.match(html, /<details class="mapping-advanced">[\s\S]*高级匹配设置/);
  assert.deepEqual(directSectionClasses(html, "mapping-layout"), [
    "mapping-setup mapping-card mapping-builder",
    "mapping-results panel"
  ]);
  assert.match(css, /\.mapping-steps-grid\s*{[\s\S]*grid-template-columns:\s*minmax\(180px,\s*1fr\)\s*minmax\(260px,\s*2fr\)\s*minmax\(420px,\s*3fr\);/);
  assert.match(css, /\.mapping-layout\s*{[\s\S]*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(cssBlock(css, ".mapping-setup"), /position:\s*sticky;/);
});

test("detail layout panel separates display settings from column configuration", () => {
  const html = read("index.html");

  assert.match(html, /<section class="layout-config-section">[\s\S]*显示设置/);
  assert.match(html, /<details class="layout-config-section column-layout-section">[\s\S]*详情列配置/);
  assert.match(html, /id="columnConfigList"/);
});

test("multi-project analysis exposes detail comparison and flow pages", () => {
  const html = read("index.html");
  const css = read("styles.css");

  assert.match(html, /id="singleModeTab"[\s\S]*单项目分析/);
  assert.match(html, /id="multiModeTab"[\s\S]*多项目分析/);
  assert.match(html, /id="multiComparePage"[\s\S]*匹配用户详情对比/);
  assert.match(html, /id="multiFlowPage"[\s\S]*设备偏好流向/);
  assert.match(html, /id="multiFlowDeviceMappings"/);
  assert.match(html, /class="panel multi-config-card"/);
  assert.match(css, /\.multi-user-columns\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("detail dashboard exposes csv export and click-to-center photo controls", () => {
  const html = read("index.html");
  const js = read("app.js");
  const css = read("styles.css");

  assert.match(html, /id="exportDetailCsvButton"[\s\S]*导出当前详情 CSV/);
  assert.match(html, /id="photoZoomControl"[\s\S]*全局照片缩放/);
  assert.match(js, /function downloadCurrentDetailCsv/);
  assert.match(js, /data-photo-center-user/);
  assert.match(js, /!event\.ctrlKey && !event\.metaKey/);
  assert.match(js, /addEventListener\("dblclick"/);
  assert.match(css, /--photo-zoom/);
});

test("project config uses folder selection instead of manual path entry", () => {
  const html = read("index.html");
  const js = read("app.js");

  assert.match(html, /id="projectPathInput"[^>]*type="hidden"/);
  assert.match(html, /id="chooseProjectFolderButton"[\s\S]*选择项目文件夹/);
  assert.match(html, /id="projectFileNameInput"/);
  assert.doesNotMatch(html, /项目文件路径/);
  assert.match(js, /showDirectoryPicker/);
  assert.match(js, /selectedProjectPath/);
});

test("project load failures expose recovery actions without affecting sample data", () => {
  const html = read("index.html");
  const js = read("app.js");

  assert.match(html, /id="projectRecoveryActions"[^>]*hidden/);
  assert.match(html, /id="useSampleProjectButton"/);
  assert.match(html, /id="clearProjectPathButton"/);
  assert.match(js, /function showProjectRecoveryActions/);
  assert.match(js, /function useSampleProject/);
  assert.match(js, /function clearProjectPath/);
  assert.match(js, /useSampleProjectButton\.addEventListener\("click", useSampleProject\)/);
  assert.match(js, /clearProjectPathButton\.addEventListener\("click", clearProjectPath\)/);
});

test("dynamic dashboard and server entry rendering escapes user-controlled text", () => {
  const js = read("app.js");
  const serverEntry = read("server/server-entry.js");

  assert.match(js, /function escapeHtml/);
  assert.match(js, /function attrEscape/);
  assert.match(js, /escapeHtml\(review\.user\)/);
  assert.match(js, /escapeHtml\(item\.message\)/);
  assert.match(js, /escapeHtml\(group\.values\[0\]\)/);
  assert.match(js, /escapeHtml\(column\.label\)/);
  assert.match(js, /escapeHtml\(state\.protocolTemplate\.name \|\| "未命名模板"\)/);
  assert.match(js, /views\.map\(escapeHtml\)/);
  assert.match(js, /escapeHtml\(fieldLabels\[metric\] \|\| metric\)/);
  assert.match(js, /\$\{escapeHtml\(label\)\}：\$\{score\}/);
  assert.match(js, /src="\$\{attrEscape\(thumbSrc\)\}"/);
  assert.match(js, /data-field="\$\{attrEscape\(slot\.field\)\}"/);
  assert.match(serverEntry, /function escapeHtml/);
  assert.match(serverEntry, /escapeHtml\(project\.title \|\| project\.id\)/);
  assert.match(serverEntry, /escapeHtml\(error\.message\)/);
});

test("dashboard declares a local favicon", () => {
  const html = read("index.html");
  const icon = read("favicon.svg");

  assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
  assert.match(icon, /<svg[^>]+viewBox="0 0 64 64"/);
});
