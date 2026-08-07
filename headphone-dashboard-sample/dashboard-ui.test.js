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
  const js = read("app.js");
  const css = read("styles.css");

  assert.match(html, /id="singleModeTab"[\s\S]*单项目分析/);
  assert.match(html, /id="multiModeTab"[\s\S]*多项目分析/);
  assert.match(html, /id="multiComparePage"[\s\S]*匹配用户详情对比/);
  assert.match(html, /id="multiFlowPage"[\s\S]*设备偏好流向/);
  assert.match(html, /id="multiFlowDeviceMappings"/);
  assert.match(html, /id="multiFlowClearSelection"[\s\S]*取消筛选/);
  assert.match(html, /id="multiFlowDetails"/);
  assert.match(html, /class="panel multi-config-card"/);
  assert.match(css, /\.multi-user-columns\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(js, /function renderSankeyChart/);
  assert.match(js, /multiFlowSelectedKey/);
  assert.match(js, /data-flow-key/);
  assert.match(js, /selectMultiFlow/);
  assert.match(js, /fromOffsets/);
  assert.match(js, /toOffsets/);
  assert.match(js, /nodeHeightFor/);
  assert.match(js, /function renderFlowDetailCards/);
  assert.match(js, /function flowMappingLabel/);
  assert.match(js, /flow-map-label/);
  assert.match(css, /\.sankey-chart/);
  assert.match(css, /\.multi-flow-overview/);
  assert.match(css, /\.flow-summary-row\.active/);
  assert.match(css, /\.flow-map-label/);
  assert.match(css, /\.flow-detail-card/);
  assert.match(js, /validIds\.has\(state\.multiProjectA\)/);
  assert.match(js, /state\.multiProjectB === state\.multiProjectA/);
});

test("pressure page exposes larger device radar for mean and minimum raw pressure scores", () => {
  const html = read("index.html");
  const js = read("app.js");
  const css = read("styles.css");

  assert.match(html, /id="pressureRadar"/);
  assert.match(html, /设备挤压雷达/);
  assert.match(html, /设备差值 \/ 平均原始分数 \/ 最低原始分数/);
  assert.match(js, /function renderPressureRadar/);
  assert.match(js, /function renderPressureRadarDiffCard/);
  assert.match(js, /meanDiff/);
  assert.match(js, /Core\.pressureRadarByDevice/);
  assert.match(js, /meanScore/);
  assert.match(js, /minScore/);
  assert.match(js, /viewBox="0 0 420 420"/);
  assert.match(js, /\[0, \.\.\.gridValues\]/);
  assert.match(js, /function pressureRadarSampleGroups/);
  assert.match(js, /Core\.pressureRadarByDevice\(rows, fields, deviceField\(\), \{[\s\S]*labels: fieldLabels,[\s\S]*userField: state\.userIdField/);
  assert.doesNotMatch(js, /Math\.max\(0\.5, group\.score\)/);
  assert.match(js, /group\.users\.length/);
  assert.match(js, /userNameField: pressureUserNameField\(\)/);
  assert.match(js, /renderPressureRadar\(rows, fields\)/);
  assert.match(css, /\.pressure-radar-grid/);
  assert.match(css, /\.pressure-radar-mean/);
  assert.match(css, /\.pressure-radar-min/);
  assert.match(css, /\.pressure-radar-diff/);
  assert.match(css, /height:\s*420px/);
  assert.match(css, /\.pressure-radar-sample/);
});

test("detail dashboard exposes csv export and click-to-center photo controls", () => {
  const html = read("index.html");
  const js = read("app.js");
  const css = read("styles.css");

  assert.match(html, /id="photoZoomControl"[\s\S]*全局照片缩放/);
  assert.match(html, /id="photoZoomControl"[^>]*min="50"[^>]*max="250"/);
  assert.match(html, /id="resetPhotoPositionsButton"[\s\S]*全部跟随全局/);
  assert.match(html, /class="photo-position-reset all-photo-position-reset reset-photo-positions-trigger"[\s\S]*全部跟随全局/);
  assert.match(js, /data-photo-center-user/);
  assert.match(js, /class="user-photo-zoom"/);
  assert.match(js, /function updateUserPhotoZoom/);
  assert.match(js, /function resetAllUserPhotoPositions/);
  assert.match(js, /state\.userPhotoPositions = \{\}/);
  assert.match(js, /resetPhotoPositionsButton\?\./);
  assert.match(js, /reset-photo-positions-trigger/);
  assert.match(js, /zoomRatio/);
  assert.match(js, /clickX - current\.x/);
  assert.match(js, /!event\.ctrlKey && !event\.metaKey/);
  assert.match(js, /addEventListener\("dblclick"/);
  assert.match(css, /--user-photo-zoom, var\(--photo-zoom/);
});

test("project config uses folder selection instead of manual path entry", () => {
  const html = read("index.html");
  const js = read("app.js");

  assert.match(html, /id="projectPathInput"[^>]*type="hidden"/);
  assert.match(html, /id="chooseProjectFolderButton"[\s\S]*选择项目根目录/);
  assert.match(html, /id="projectNameStatus"/);
  assert.doesNotMatch(html, /id="projectFileNameInput"/);
  assert.doesNotMatch(html, /id="loadProjectButton"/);
  assert.doesNotMatch(html, /id="saveProjectConfigButton"/);
  assert.match(html, /id="saveProjectButton"[\s\S]*保存项目/);
  assert.match(html, /id="exportProjectCsvButton"[\s\S]*导出项目 CSV/);
  assert.match(html, /projects\/我的耳机项目\/我的耳机项目\.json/);
  assert.doesNotMatch(html, /项目文件路径/);
  assert.doesNotMatch(html, /下载更新后的 CSV/);
  assert.match(js, /showDirectoryPicker/);
  assert.match(js, /id:\s*"hp-projects"/);
  assert.doesNotMatch(js, /headphone-dashboard-project-folder/);
  assert.match(js, /function loadProjectsFromSelectedFolder/);
  assert.match(js, /listProjectJsonFiles/);
  assert.match(js, /function autoLoadStoredProjectFolder/);
  assert.match(js, /indexedDB\.open\(PROJECT_FOLDER_DB/);
  assert.match(js, /selectedProjectPath/);
  assert.match(js, /activeProjectName/);
  assert.match(js, /function exportProjectCsv/);
  assert.match(js, /\/api\/export-project-csv/);
  assert.match(js, /getDirectoryHandle\("exports"/);
  assert.match(js, /\/api\/project-assets/);
  assert.match(js, /当前扫描目录/);
});

test("startup scans projects folder before falling back to the default project path", () => {
  const js = read("app.js");
  const startBody = js.match(/async function start\(\) \{([\s\S]*?)\n\}\n\nstart\(\)\.catch/)?.[1] || "";

  assert.ok(startBody.includes("const loaded = await autoLoadProjectsFolder();"));
  assert.ok(startBody.includes("projectFromUrl !== defaultProjectPath();"));
  assert.ok(startBody.includes("setProjectPath(defaultProjectPath());"));
  assert.ok(
    startBody.indexOf("const projectFromUrl") < startBody.indexOf("setProjectPath(defaultProjectPath());"),
    "startup must read the original URL before setting the default project path"
  );
  assert.ok(
    startBody.indexOf("const loaded = await autoLoadProjectsFolder();") < startBody.lastIndexOf("setProjectPath(defaultProjectPath());"),
    "startup must try projects folder auto-load before falling back to the default project path"
  );
});

test("windows launcher passes shared projects root to server", () => {
  const config = read("launcher/launcher-config.example.json");
  const ps1 = read("launcher/launcher.ps1");
  const bat = read("打开耳机数据看板.bat");
  const launcherReadme = read("launcher/README_自动更新启动器.txt");

  assert.match(config, /"projectsRoot"/);
  assert.match(ps1, /DASHBOARD_PROJECTS_ROOT/);
  assert.match(ps1, /Using projects root/);
  assert.match(ps1, /Auto-detected projects root/);
  assert.match(ps1, /Join-Path \$scriptDir "projects"/);
  assert.match(ps1, /Join-Path \(Split-Path -Parent \$scriptDir\) "projects"/);
  assert.match(bat, /DASHBOARD_PROJECTS_ROOT=%~dp0projects/);
  assert.match(launcherReadme, /projectsRoot 是看板自动扫描项目 JSON 的目录/);
});

test("detail photos can load from sibling photos folder through project-photo api", () => {
  const js = read("app.js");

  assert.match(js, /function projectPhotoUrl/);
  assert.match(js, /\/api\/project-photo\?root=/);
  assert.match(js, /project=\$\{encodeURIComponent\(project\)\}/);
  assert.match(js, /photoRoot: els\.photoRootInput\.value\.trim\(\) \|\| "photos"/);
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
