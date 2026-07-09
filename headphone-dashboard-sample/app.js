const DEFAULT_CSV = "headphone_sample.csv";
const Core = globalThis.DashboardCore;
const initialParams = new URL(window.location.href).searchParams;
const initialServerProjectId = initialParams.get("projectId") || "";

function storageScope() {
  return initialServerProjectId ? `server:${initialServerProjectId}` : "local";
}

function storageKey(name) {
  return `${name}:${storageScope()}`;
}

const fieldLabels = {
  record_id: "记录编号",
  user_id: "用户",
  device_id: "设备编号",
  device_name: "设备",
  gender: "性别",
  age: "年龄",
  age_group: "年龄段",
  ear_side: "耳侧",
  concha_size: "耳甲腔大小",
  concha_length_mm: "耳甲腔长度",
  concha_width_mm: "耳甲腔宽度",
  ear_canal_size: "耳道大小",
  ear_protrusion: "耳部外展",
  helix_shape: "耳轮形态",
  fit_result: "适配结果",
  satisfaction_score: "满意度",
  comfort_score: "舒适性",
  stability_score: "稳定性",
  tragus_pressure_relief_score: "耳屏",
  antitragus_pressure_relief_score: "对耳屏",
  helix_pressure_relief_score: "耳轮",
  original_sound_score: "原声评分",
  comments: "备注",
  photo_path: "照片"
};

function defaultLayout() {
  return {
    fontSize: 12,
    photoSize: 120,
    version: 5,
    schema: "",
    columns: []
  };
}

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey("headphoneDashboardLayout")) ||
      (!initialServerProjectId ? localStorage.getItem("headphoneDashboardLayout") : "null"));
    if (!saved?.columns?.length) return defaultLayout();
    return {
      fontSize: Number(saved.fontSize) || 12,
      photoSize: Number(saved.photoSize) || 120,
      version: Number(saved.version) || 1,
      schema: saved.schema || "",
      columns: saved.columns
    };
  } catch {
    return defaultLayout();
  }
}

function loadFieldRoleOverrides() {
  try {
    return JSON.parse(localStorage.getItem(storageKey("headphoneDashboardFieldRoles")) ||
      (!initialServerProjectId ? localStorage.getItem("headphoneDashboardFieldRoles") : "null")) || {};
  } catch {
    return {};
  }
}

const state = {
  rows: [],
  mappingRows: [],
  mappedRows: [],
  mappingFiles: [],
  mappingObjectUrls: [],
  thumbnailUrls: {},
  mappingViews: [],
  mappingReviews: [],
  mappingPhotoFields: [],
  photoMappingOverrides: {},
  viewLabels: {},
  globalView: "",
  userViews: {},
  selectedGroup: null,
  primaryDimension: "device_name",
  secondaryDimension: "concha_size",
  metric: "comfort_score",
  yAxisMode: "adaptive",
  showErrorBars: true,
  pressureWorst: "low",
  search: "",
  columnFilters: {},
  headers: [],
  fieldRoles: {},
  fieldRoleOverrides: loadFieldRoleOverrides(),
  dimensionFields: [],
  metricFields: [],
  userIdField: "user_id",
  photoFields: [],
  layout: loadLayout(),
  projectPath: "",
  serverProjectId: initialServerProjectId,
  projectRevision: null,
  projectTitle: "",
  projectDirty: false,
  protocolTemplate: null,
  protocolValidation: null,
  pressureDeviceFilter: "",
  pressureEarFilter: "",
  pressureGroupField: "",
  pressureGroupValue: "",
  pressureAggregation: "mean"
};

let draggedColumnId = "";
let draggedMappingPhoto = null;
let mappingDragTargetElement = null;
let mappingDragImage = null;
let columnDragScrollFrame = 0;
const columnDragScroll = { list: 0, page: 0 };
let photoLightboxReturnFocus = null;

const els = Object.fromEntries([
  "resetButton", "dataSourceLabel", "primaryDimension", "secondaryDimension",
  "metricSelect", "yAxisMode", "showErrorBars", "clearGroupButton", "kpiGrid", "pivotHead", "pivotBody",
  "pivotHint", "barChart", "chartTitle", "detailTitle", "detailDescription",
  "dataQualitySummary", "dataQualityList", "groupStats", "detailSearch", "detailCount", "detailBody", "detailHead",
  "detailColgroup", "fontSizeControl", "fontSizeValue", "photoSizeControl",
  "photoSizeValue", "resetLayoutButton", "exportConfigButton", "importConfigInput", "columnConfigList", "clearColumnFilters",
  "mappingPage", "dashboardPage", "mappingCsvInput", "photoRootInput", "photoRootInputWrap", "photoFolderChooser", "photoFolderStatus", "photoFolderInput", "photoFolderInputWrap",
  "mappingMode", "mappingUserField", "mappingEarField", "mappingEarFieldWrap", "mappingDeviceField", "viewNamesInput", "viewNamesInputWrap", "runMappingButton",
  "mappingModeNote", "applyMappingButton", "downloadMappedCsvButton", "downloadPhotoAuditButton", "mappingSummary", "mappingPreview",
  "globalViewControl", "globalViewSelect", "resetViewsButton", "fieldRoleList", "resetFieldRolesButton",
  "projectPathInput", "loadProjectButton", "saveProjectConfigButton", "saveProjectButton", "projectStatus",
  "pressureWorstSelect", "protocolTemplateInput", "clearProtocolButton", "protocolStatus",
  "pressurePage", "pressureDeviceFilter", "pressureEarFilter", "pressureGroupField", "pressureGroupValue",
  "pressureAggregation", "pressureSummary", "pressureHeatmaps", "pressureRanking",
  "photoLightbox", "photoLightboxImage", "photoLightboxCaption", "photoLightboxClose"
].map(id => [id, document.getElementById(id)]));

function saveLayout() {
  localStorage.setItem(storageKey("headphoneDashboardLayout"), JSON.stringify(state.layout));
}

function saveFieldRoleOverrides() {
  localStorage.setItem(storageKey("headphoneDashboardFieldRoles"), JSON.stringify(state.fieldRoleOverrides));
}

function protocolModule() {
  return window.ProtocolTemplateModule || null;
}

function protocolNumericRanges(template = {}) {
  return template.numericRanges || template.scoreRanges || {};
}

function protocolPhotoSchema(template = state.protocolTemplate || {}) {
  return template.photoSchema && typeof template.photoSchema === "object" ? template.photoSchema : {};
}

function protocolPhotoViews(template = state.protocolTemplate || {}) {
  const schema = protocolPhotoSchema(template);
  const views = Array.isArray(schema.views) ? schema.views : template.photoViews;
  return Array.isArray(views) ? views.map(String).map(value => value.trim()).filter(Boolean) : [];
}

function protocolExpectedEars(template = state.protocolTemplate || {}) {
  const schema = protocolPhotoSchema(template);
  return Array.isArray(schema.ears) ? schema.ears.map(String).map(value => value.trim()).filter(Boolean) : [];
}

function applyProtocolFieldRoles(template = state.protocolTemplate) {
  if (!template?.fieldRoles || typeof template.fieldRoles !== "object") return;
  state.fieldRoleOverrides = { ...state.fieldRoleOverrides, ...template.fieldRoles };
  saveFieldRoleOverrides();
}

function validateProtocolRows(rows = state.mappingRows) {
  const moduleApi = protocolModule();
  if (!state.protocolTemplate || !moduleApi || !rows.length) {
    state.protocolValidation = null;
    return null;
  }
  state.protocolValidation = moduleApi.validateProtocol(rows, {
    ...state.protocolTemplate,
    numericRanges: protocolNumericRanges(state.protocolTemplate)
  });
  return state.protocolValidation;
}

function renderProtocolStatus() {
  if (!state.protocolTemplate) {
    els.protocolStatus.textContent = "未加载模板，现有 CSV 和照片映射流程不受影响。";
    return;
  }
  const validation = state.protocolValidation;
  const views = protocolPhotoViews();
  const ears = protocolExpectedEars();
  const parts = [
    `<strong>${state.protocolTemplate.name || "未命名模板"}</strong>`,
    validation ? `CSV：${validation.valid ? "通过" : "有警告"}，${validation.rowCount} 行` : "CSV：等待导入",
    views.length ? `照片视角：${views.join("、")}` : "照片视角：未限定",
    ears.length ? `耳侧：${ears.join("、")}` : "耳侧：按数据/文件夹识别"
  ];
  const issues = [];
  if (validation?.missingRequiredFields?.length) issues.push(`缺少必填字段：${validation.missingRequiredFields.join("、")}`);
  if (validation?.missingRecommendedFields?.length) issues.push(`缺少建议字段：${validation.missingRecommendedFields.join("、")}`);
  if (validation?.rangeIssues?.length) issues.push(`数值范围问题：${validation.rangeIssues.length} 处`);
  els.protocolStatus.innerHTML = `${parts.join(" · ")}${issues.length ? `<ul>${issues.map(item => `<li>${item}</li>`).join("")}</ul>` : ""}`;
}

function setProtocolTemplate(template) {
  state.protocolTemplate = template && typeof template === "object" ? template : null;
  applyProtocolFieldRoles();
  validateProtocolRows();
  renderProtocolStatus();
  if (state.headers.length) {
    buildSchema();
    initializeControls();
    renderFieldRoleConfig();
    renderColumnConfig();
    render();
  }
}

function exportDashboardConfig() {
  const config = {
    version: 1,
    exportedAt: new Date().toISOString(),
    ...dashboardConfigSnapshot()
  };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json;charset=utf-8" }));
  link.download = "headphone_dashboard_config.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function dashboardConfigSnapshot() {
  return {
    layout: state.layout,
    fieldRoleOverrides: state.fieldRoleOverrides,
    primaryDimension: state.primaryDimension,
    secondaryDimension: state.secondaryDimension,
    metric: state.metric,
    yAxisMode: state.yAxisMode,
    showErrorBars: state.showErrorBars,
    pressureWorst: state.pressureWorst
  };
}

function projectDocumentSnapshot() {
  return Core.buildProjectDocument({
    rows: state.rows,
    mappingRows: state.mappingRows,
    photoRoot: els.photoRootInput.value.trim(),
    mappingMode: els.mappingMode.value,
    mappingFields: {
      userField: els.mappingUserField.value,
      earField: els.mappingEarField.value,
      deviceField: els.mappingDeviceField.value
    },
    mappingViews: mappingViews(),
    photoMappingOverrides: state.photoMappingOverrides,
    protocolTemplate: state.protocolTemplate,
    dashboardConfig: dashboardConfigSnapshot()
  });
}

function mappingConfigSnapshot() {
  return {
    photoRoot: els.photoRootInput.value.trim(),
    mappingMode: els.mappingMode.value,
    mappingFields: {
      userField: els.mappingUserField.value,
      earField: els.mappingEarField.value,
      deviceField: els.mappingDeviceField.value
    },
    mappingViews: mappingViews()
  };
}

function setProjectPath(path) {
  state.projectPath = path || "";
  els.projectPathInput.value = state.projectPath;
  if (state.serverProjectId) return;
  if (!state.projectPath) return;
  const url = new URL(window.location.href);
  url.searchParams.set("project", state.projectPath);
  history.replaceState(null, "", url);
}

function defaultProjectPath() {
  return "projects/我的耳机项目.json";
}

function setProjectStatus(message, dirty = state.projectDirty) {
  els.projectStatus.textContent = dirty ? `${message} · 有未保存更改` : message;
}

function markProjectDirty() {
  state.projectDirty = true;
  const label = state.serverProjectId ? `服务器项目：${state.projectTitle || state.serverProjectId} · rev ${state.projectRevision || "?"}` :
    state.projectPath ? `当前项目：${state.projectPath}` : "未加载项目文件";
  setProjectStatus(label);
}

function markProjectSaved(message) {
  state.projectDirty = false;
  setProjectStatus(message, false);
}

async function saveProject() {
  if (state.serverProjectId) {
    await writeServerProject(projectDocumentSnapshot(), "已保存完整项目");
    return;
  }
  const path = els.projectPathInput.value.trim();
  if (!path) throw new Error("请先填写项目 JSON 路径。");
  await writeProject(path, projectDocumentSnapshot(), "已保存完整项目");
}

async function writeProject(path, project, successPrefix) {
  const response = await fetch("/api/save-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, project })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "项目保存失败。");
  setProjectPath(result.path);
  markProjectSaved(`${successPrefix}：${result.path}`);
}

async function writeServerProject(project, successPrefix) {
  const response = await fetch(`/api/server/projects/${encodeURIComponent(state.serverProjectId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: state.projectRevision, title: state.projectTitle, project })
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 409) {
      throw new Error(`${result.error || "项目版本冲突"} 当前服务器版本：rev ${result.currentRevision || "?"}`);
    }
    throw new Error(result.error || "服务器项目保存失败。");
  }
  state.projectRevision = result.revision;
  state.projectTitle = result.title || state.projectTitle;
  markProjectSaved(`${successPrefix}：${state.projectTitle || state.serverProjectId} · rev ${state.projectRevision}`);
}

async function saveCurrentProjectConfig() {
  if (state.serverProjectId) {
    await writeServerProject({
      ...projectDocumentSnapshot(),
      rows: state.rows,
      mappingRows: state.mappingRows,
      savedAt: new Date().toISOString(),
      dashboardConfig: dashboardConfigSnapshot()
    }, "已保存当前配置");
    return;
  }
  const path = els.projectPathInput.value.trim();
  if (!path) throw new Error("请先填写项目 JSON 路径。");
  let project = null;
  try {
    const response = await fetch(`/api/load-project?path=${encodeURIComponent(path)}`);
    const result = await response.json();
    if (response.ok && result.project && typeof result.project === "object") project = result.project;
  } catch {
    project = null;
  }
  if (!project) project = projectDocumentSnapshot();
  const mappingConfig = mappingConfigSnapshot();
  await writeProject(path, {
    ...project,
    savedAt: new Date().toISOString(),
    photoRoot: mappingConfig.photoRoot,
    mappingMode: mappingConfig.mappingMode,
    mappingFields: mappingConfig.mappingFields,
    mappingViews: mappingConfig.mappingViews,
    protocolTemplate: state.protocolTemplate,
    dashboardConfig: dashboardConfigSnapshot()
  }, "已保存当前配置");
}

async function loadProject(path) {
  if (state.serverProjectId) {
    await loadServerProject();
    return;
  }
  const projectPath = path || els.projectPathInput.value.trim();
  if (!projectPath) throw new Error("请先填写项目 JSON 路径。");
  const response = await fetch(`/api/load-project?path=${encodeURIComponent(projectPath)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "项目加载失败。");
  const project = Core.sanitizeProjectDocument(result.project);
  state.rows = project.rows.map(row => ({ ...row }));
  state.mappingRows = project.mappingRows.map(row => ({ ...row }));
  state.mappedRows = [];
  state.mappingViews = project.mappingViews;
  state.photoMappingOverrides = project.photoMappingOverrides;
  state.protocolTemplate = project.protocolTemplate;
  els.photoRootInput.value = project.photoRoot;
  els.mappingMode.value = project.mappingMode;
  renderMappingMode();
  if (project.mappingViews.length) els.viewNamesInput.value = project.mappingViews.join(",");
  buildSchema();
  applyDashboardConfig(project.dashboardConfig);
  applyProtocolFieldRoles();
  buildSchema();
  initializeControls();
  renderFieldRoleConfig();
  renderColumnConfig();
  render();
  validateProtocolRows();
  renderProtocolStatus();
  initializeMappingFields();
  if (project.mappingFields.userField && [...els.mappingUserField.options].some(option => option.value === project.mappingFields.userField)) els.mappingUserField.value = project.mappingFields.userField;
  if (project.mappingFields.earField && [...els.mappingEarField.options].some(option => option.value === project.mappingFields.earField)) els.mappingEarField.value = project.mappingFields.earField;
  if (project.mappingFields.deviceField && [...els.mappingDeviceField.options].some(option => option.value === project.mappingFields.deviceField)) els.mappingDeviceField.value = project.mappingFields.deviceField;
  if (project.photoRoot && !project.photoRoot.startsWith("browser-folder:")) {
    try {
      await scanPhotoRoot();
    } catch (error) {
      setProjectStatus(`项目已加载，但照片目录未授权：${error.message}`);
    }
  }
  setProjectPath(result.path);
  markProjectSaved(`已加载：${result.path}`);
  els.dataSourceLabel.textContent = "项目数据";
  switchPage("dashboard");
}

async function loadServerProject() {
  if (!state.serverProjectId) throw new Error("缺少服务器项目 ID。");
  const response = await fetch(`/api/server/projects/${encodeURIComponent(state.serverProjectId)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "服务器项目加载失败。");
  const project = Core.sanitizeProjectDocument(result.project);
  state.projectRevision = result.revision;
  state.projectTitle = result.title || state.serverProjectId;
  state.rows = project.rows.map(row => ({ ...row }));
  state.mappingRows = project.mappingRows.map(row => ({ ...row }));
  state.mappedRows = [];
  state.mappingViews = project.mappingViews;
  state.photoMappingOverrides = project.photoMappingOverrides;
  state.protocolTemplate = project.protocolTemplate;
  els.photoRootInput.value = project.photoRoot;
  els.mappingMode.value = project.mappingMode;
  renderMappingMode();
  if (project.mappingViews.length) els.viewNamesInput.value = project.mappingViews.join(",");
  buildSchema();
  applyDashboardConfig(project.dashboardConfig);
  applyProtocolFieldRoles();
  buildSchema();
  initializeControls();
  renderFieldRoleConfig();
  renderColumnConfig();
  render();
  validateProtocolRows();
  renderProtocolStatus();
  initializeMappingFields();
  if (project.mappingFields.userField && [...els.mappingUserField.options].some(option => option.value === project.mappingFields.userField)) els.mappingUserField.value = project.mappingFields.userField;
  if (project.mappingFields.earField && [...els.mappingEarField.options].some(option => option.value === project.mappingFields.earField)) els.mappingEarField.value = project.mappingFields.earField;
  if (project.mappingFields.deviceField && [...els.mappingDeviceField.options].some(option => option.value === project.mappingFields.deviceField)) els.mappingDeviceField.value = project.mappingFields.deviceField;
  setProjectPath(state.serverProjectId);
  els.projectPathInput.readOnly = true;
  els.projectPathInput.value = state.serverProjectId;
  markProjectSaved(`已加载服务器项目：${state.projectTitle} · rev ${state.projectRevision}`);
  els.dataSourceLabel.textContent = "服务器项目";
  switchPage("dashboard");
}

function applyDashboardConfig(config) {
  const clean = Core.sanitizeDashboardConfig(config, state.headers);
  if (clean.layout.columns?.length) {
    state.layout = { ...defaultLayout(), ...state.layout, ...clean.layout };
    saveLayout();
    applyLayoutVariables();
  }
  state.fieldRoleOverrides = clean.fieldRoleOverrides;
  saveFieldRoleOverrides();
  if (clean.primaryDimension) state.primaryDimension = clean.primaryDimension;
  if (clean.secondaryDimension) state.secondaryDimension = clean.secondaryDimension;
  if (clean.metric) state.metric = clean.metric;
  if (clean.yAxisMode) state.yAxisMode = clean.yAxisMode;
  if (typeof clean.showErrorBars === "boolean") state.showErrorBars = clean.showErrorBars;
  if (clean.pressureWorst) state.pressureWorst = clean.pressureWorst;
  state.selectedGroup = null;
  buildSchema();
  initializeControls();
  renderFieldRoleConfig();
  renderColumnConfig();
  render();
}

function applyLayoutVariables() {
  document.documentElement.style.setProperty("--detail-font-size", `${state.layout.fontSize}px`);
  document.documentElement.style.setProperty("--photo-size", `${state.layout.photoSize}px`);
  els.fontSizeControl.value = state.layout.fontSize;
  els.fontSizeValue.value = `${state.layout.fontSize}px`;
  els.photoSizeControl.value = state.layout.photoSize;
  els.photoSizeValue.value = `${state.layout.photoSize}px`;
}

function renderColumnConfig() {
  els.columnConfigList.innerHTML = state.layout.columns.map(column => `
    <div class="column-config-row" data-column-id="${column.id}" draggable="true">
      <span class="column-drag-handle" aria-label="拖拽移动${column.label}" title="拖拽排序">⋮⋮</span>
      <input class="column-visible" type="checkbox" aria-label="显示${column.label}" ${column.visible ? "checked" : ""}>
      <label>${column.label}${column.userLevel ? " · 用户级" : ""}</label>
      <input class="column-width" type="number" min="60" max="500" step="10" value="${column.width}" aria-label="${column.label}列宽">
    </div>
  `).join("");
}

function moveColumn(draggedId, targetId, placeAfter = false) {
  if (!draggedId || !targetId || draggedId === targetId) return false;
  const fromIndex = state.layout.columns.findIndex(column => column.id === draggedId);
  const toIndex = state.layout.columns.findIndex(column => column.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return false;
  const [column] = state.layout.columns.splice(fromIndex, 1);
  const targetIndex = state.layout.columns.findIndex(item => item.id === targetId);
  const adjustedIndex = placeAfter ? targetIndex + 1 : targetIndex;
  state.layout.columns.splice(adjustedIndex, 0, column);
  return true;
}

function runColumnDragAutoScroll() {
  if (!draggedColumnId || (!columnDragScroll.list && !columnDragScroll.page)) {
    columnDragScrollFrame = 0;
    return;
  }
  if (columnDragScroll.list) els.columnConfigList.scrollTop += columnDragScroll.list;
  if (columnDragScroll.page) window.scrollBy(0, columnDragScroll.page);
  columnDragScrollFrame = requestAnimationFrame(runColumnDragAutoScroll);
}

function updateColumnDragAutoScroll(clientY) {
  const edge = 48;
  const listRect = els.columnConfigList.getBoundingClientRect();
  let listDelta = 0;
  if (clientY < listRect.top + edge) listDelta = -Math.ceil((edge - (clientY - listRect.top)) / 3);
  else if (clientY > listRect.bottom - edge) listDelta = Math.ceil((edge - (listRect.bottom - clientY)) / 3);

  const viewportEdge = 72;
  let pageDelta = 0;
  if (clientY < viewportEdge) pageDelta = -Math.ceil((viewportEdge - clientY) / 4);
  else if (clientY > window.innerHeight - viewportEdge) pageDelta = Math.ceil((viewportEdge - (window.innerHeight - clientY)) / 4);

  columnDragScroll.list = listDelta;
  columnDragScroll.page = pageDelta;
  if (!columnDragScrollFrame && (listDelta || pageDelta)) {
    columnDragScrollFrame = requestAnimationFrame(runColumnDragAutoScroll);
  }
}

function stopColumnDragAutoScroll() {
  columnDragScroll.list = 0;
  columnDragScroll.page = 0;
  if (columnDragScrollFrame) cancelAnimationFrame(columnDragScrollFrame);
  columnDragScrollFrame = 0;
}

function fieldRole(field) {
  return state.fieldRoles[field] || Core.inferFieldRole(field, state.rows);
}

function renderFieldRoleConfig() {
  const labels = {
    user_id: "用户编号",
    device: "设备/条件",
    user: "组间变量",
    dimension: "透视维度",
    metric: "评分/数值指标",
    pressure: "挤压程度",
    photo: "照片视角",
    ignore: "忽略"
  };
  const options = Object.entries(labels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  els.fieldRoleList.innerHTML = state.headers.map(field => `
    <label class="field-role-row">
      <span>${fieldLabels[field] || field}<small>${field}</small></span>
      <select data-field="${field}">
        ${options}
      </select>
    </label>
  `).join("");
  els.fieldRoleList.querySelectorAll("select").forEach(select => {
    select.value = fieldRole(select.dataset.field);
  });
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(value => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map(values => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])));
}

function isNumericField(field) {
  return Core.isNumericField(field, state.rows);
}

function isPhotoField(field) {
  return fieldRole(field) === "photo";
}

function photoUrl(path) {
  if (!path) return "";
  if (/^(blob:|data:|https?:|\/api\/)/i.test(path)) return path;
  if (/^[A-Za-z]:[\\/]|^\//.test(path)) return `/api/photo?path=${encodeURIComponent(path)}`;
  return path;
}

function photoThumbUrl(path) {
  return state.thumbnailUrls[path] || photoUrl(path);
}

function isUserLevelField(field) {
  const role = fieldRole(field);
  if (role === "user" || role === "user_id") return true;
  if (role !== "dimension") return false;
  if (isPhotoField(field)) return false;
  if (field === state.userIdField) {
    const byUser = new Map();
    for (const row of state.rows) {
      const user = row[state.userIdField];
      if (!byUser.has(user)) byUser.set(user, row[field]);
      if (byUser.get(user) !== row[field]) return false;
    }
    return true;
  }
  if (/record|device|condition|score|rating|pressure|comfort|stability|satisfaction|fit|sound|comment|备注/i.test(field)) return false;
  const byUser = new Map();
  for (const row of state.rows) {
    const user = row[state.userIdField];
    if (!byUser.has(user)) byUser.set(user, row[field]);
    if (byUser.get(user) !== row[field]) return false;
  }
  return true;
}

function defaultColumnWidth(field) {
  if (isPhotoField(field)) return 360;
  if (/comment|备注|description|说明/i.test(field)) return 220;
  if (/score|rating|age$|年龄$|gender|性别/i.test(field)) return 65;
  if (/name|device|设备/i.test(field)) return 105;
  if (/ear_|concha|耳/i.test(field)) return 90;
  return 82;
}

function buildSchema() {
  state.headers = Object.keys(state.rows[0] || {});
  state.fieldRoleOverrides = Object.fromEntries(Object.entries(state.fieldRoleOverrides).filter(([field]) => state.headers.includes(field)));
  state.fieldRoles = Core.resolveFieldRoles(state.headers, state.rows, state.fieldRoleOverrides);
  state.userIdField = state.headers.find(field => fieldRole(field) === "user_id") || state.headers[0];
  state.photoFields = state.headers.filter(field => fieldRole(field) === "photo");
  state.photoFields.forEach((field, index) => {
    if (!state.viewLabels[field]) state.viewLabels[field] = fieldLabels[field] || field.replace(/^photo_/, "");
  });
  const viewOptions = photoViewOptions();
  if (!viewOptions.some(option => option.value === state.globalView)) state.globalView = viewOptions[0]?.value || "";
  state.metricFields = state.headers.filter(field => fieldRole(field) === "metric" && isNumericField(field));
  state.dimensionFields = state.headers.filter(field => {
    const count = unique(field).length;
    return ["device", "user", "dimension"].includes(fieldRole(field)) &&
      field !== state.userIdField && count > 0 && count <= 50;
  });

  if (!state.dimensionFields.includes(state.primaryDimension)) state.primaryDimension = state.dimensionFields[0] || state.userIdField;
  if (!state.dimensionFields.includes(state.secondaryDimension) || state.secondaryDimension === state.primaryDimension) {
    state.secondaryDimension = state.dimensionFields.find(field => field !== state.primaryDimension) || "";
  }
  if (!state.metricFields.includes(state.metric)) state.metric = state.metricFields[0] || "";
  const dynamicColumns = state.headers.map(field => ({
    id: field,
    label: fieldLabels[field] || field,
    width: defaultColumnWidth(field),
    visible: !/^(record_id|device_id)$/i.test(field) && fieldRole(field) !== "pressure" && fieldRole(field) !== "photo" && fieldRole(field) !== "ignore",
    userLevel: isUserLevelField(field),
    photo: isPhotoField(field)
  }));
  dynamicColumns.splice(Math.max(0, dynamicColumns.findIndex(column => /fit_result|original_sound/i.test(column.id))), 0, {
    id: "__pressure_summary",
    label: "挤压程度",
    width: 210,
    visible: true,
    userLevel: false,
    photo: false,
    derived: true
  });
  if (state.photoFields.length) dynamicColumns.push({
    id: "__photo_view",
    label: "照片",
    width: 360,
    visible: true,
    userLevel: true,
    photo: true,
    derived: true
  });
  dynamicColumns.splice(Math.max(0, dynamicColumns.findIndex(column => column.id === state.userIdField) + 1), 0, {
    id: "__user_profile",
    label: "组间变量",
    width: 260,
    visible: true,
    userLevel: true,
    photo: false,
    derived: true
  });
  dynamicColumns.forEach(column => {
    if (column.userLevel && !column.photo && column.id !== state.userIdField && column.id !== "__user_profile") column.visible = false;
    if (fieldRole(column.id) === "pressure") column.visible = false;
  });
  const schema = state.headers.join("|||");
  const orderedSaved = state.layout.version === 5 && state.layout.schema === schema ? state.layout.columns
    .filter(column => dynamicColumns.some(item => item.id === column.id))
    .map(column => ({ ...dynamicColumns.find(item => item.id === column.id), ...column })) : [];
  const newColumns = dynamicColumns.filter(column => !orderedSaved.some(item => item.id === column.id));
  const combined = [...orderedSaved, ...newColumns];
  combined.forEach(column => {
    if (fieldRole(column.id) === "pressure") column.visible = false;
  });
  state.layout.columns = [...combined.filter(column => !column.photo), ...combined.filter(column => column.photo)];
  state.layout.version = 5;
  state.layout.schema = schema;
  saveLayout();
}

function average(rows, field) {
  return Core.numericSummary(rows, field).mean;
}

function unique(field) {
  return [...new Set(state.rows.map(row => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function fillSelect(select, values, includeBlank = false, labels = fieldLabels) {
  const current = select.value;
  select.innerHTML = includeBlank ? '<option value="">无</option>' : "";
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels[value] || value;
    select.append(option);
  });
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function initializeControls() {
  fillSelect(els.primaryDimension, state.dimensionFields);
  fillSelect(els.secondaryDimension, state.dimensionFields, true);
  fillSelect(els.metricSelect, state.metricFields);
  els.primaryDimension.value = state.primaryDimension;
  els.secondaryDimension.value = state.secondaryDimension;
  els.metricSelect.value = state.metric;
  els.yAxisMode.value = state.yAxisMode;
  els.showErrorBars.checked = state.showErrorBars;
  els.pressureWorstSelect.value = state.pressureWorst;
  refreshPressureControls();
  renderViewControls();
}

function renderViewControls() {
  els.globalViewControl.hidden = state.photoFields.length === 0;
  els.resetViewsButton.hidden = state.photoFields.length === 0;
  const options = photoViewOptions();
  els.globalViewSelect.innerHTML = options.map(option =>
    `<option value="${option.value}" ${option.value === state.globalView ? "selected" : ""}>${option.label}</option>`
  ).join("");
}

function earSideField() {
  return state.headers.find(field => /^(ear_side|左右耳|耳侧|left_right|side)$/i.test(field)) ||
    state.headers.find(field => /ear_side|左右耳|耳侧/i.test(field));
}

function makePhotoViewValue(field, ear = "") {
  return ear ? `ear:${encodeURIComponent(ear)}::${field}` : field;
}

function parsePhotoViewValue(value) {
  const match = String(value || "").match(/^ear:([^:]+)::(.+)$/);
  if (!match) return { ear: "", field: value || state.photoFields[0] || "" };
  return { ear: decodeURIComponent(match[1]), field: match[2] };
}

function photoViewOptions(rows = state.rows) {
  if (!state.photoFields.length) return [];
  const earField = earSideField();
  const ears = earField ? [...new Set(rows.map(row => row[earField]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "zh-CN")) : [];
  const fieldHasEar = field => {
    const label = state.viewLabels[field] || field;
    return ears.some(ear => label.includes(ear) || field.includes(ear));
  };
  if (ears.length && state.photoFields.some(fieldHasEar)) {
    return state.photoFields.map(field => ({
      value: field,
      field,
      ear: "",
      label: state.viewLabels[field] || field
    }));
  }
  if (!ears.length) {
    return state.photoFields.map(field => ({
      value: field,
      field,
      ear: "",
      label: state.viewLabels[field] || field
    }));
  }
  return ears.flatMap(ear => state.photoFields.map(field => ({
    value: makePhotoViewValue(field, ear),
    field,
    ear,
    label: `${ear} · ${state.viewLabels[field] || field}`
  })));
}

function rowMatchesPhotoView(row, view) {
  const earField = earSideField();
  return (!view.ear || !earField || String(row[earField] || "") === view.ear) && row[view.field];
}

function filteredRows() {
  return state.rows.filter(row => Object.entries(state.columnFilters).every(([field, value]) =>
    !value || String(row[field] ?? "") === value
  ));
}

function groupedRows(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const values = [row[state.primaryDimension] || "未填写"];
    if (state.secondaryDimension) values.push(row[state.secondaryDimension] || "未填写");
    const key = values.join("|||");
    if (!groups.has(key)) groups.set(key, { key, values, rows: [] });
    groups.get(key).rows.push(row);
  });
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key, "zh-CN"));
}

function renderKPIs(rows) {
  const userCount = new Set(rows.map(row => row[state.userIdField])).size;
  const displayScore = field => state.headers.includes(field) ? average(rows, field).toFixed(1) : "—";
  const cards = [
    ["独立用户", userCount, `${rows.length} 条测试记录`],
    ["平均满意度", displayScore("satisfaction_score"), "满分 10"],
    ["平均舒适性", displayScore("comfort_score"), "满分 10"],
    ["平均稳定性", displayScore("stability_score"), "满分 10"]
  ];
  els.kpiGrid.innerHTML = cards.map(([label, value, note]) => `
    <article class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-note">${note}</div>
    </article>
  `).join("");
}

function renderDataQuality() {
  const deviceField = state.headers.find(field => fieldRole(field) === "device");
  const scoreFields = state.metricFields.filter(field => Core.isScoreMetric(field) || /score|rating|评分|得分|满意|舒适|稳定/i.test(field));
  const userLevelFields = state.layout.columns
    .filter(column => column.userLevel && !column.derived && !column.photo && column.id !== state.userIdField)
    .map(column => column.id);
  const report = Core.validateRows(state.rows, {
    userIdField: state.userIdField,
    deviceField,
    scoreFields,
    userLevelFields
  });
  els.dataQualitySummary.textContent = report.totalIssues ?
    `${report.errors} 个错误 · ${report.warnings} 个提醒` :
    "未发现明显问题";
  els.dataQualityList.innerHTML = report.totalIssues ?
    report.items.slice(0, 12).map(item => `<div class="quality-item ${item.severity}">
      <strong>${item.severity === "error" ? "错误" : "提醒"}</strong>
      <span>${item.message}</span>
    </div>`).join("") +
    (report.items.length > 12 ? `<div class="quality-more">还有 ${report.items.length - 12} 条问题未展开。</div>` : "") :
    `<div class="quality-empty">当前数据通过基础检查：用户编号、设备条件、评分范围和组间变量一致性均正常。</div>`;
}

function renderPivot(groups) {
  const summaryFields = ["satisfaction_score", "comfort_score", "stability_score"].filter(field => state.headers.includes(field));
  els.pivotHead.innerHTML = `<tr>
    <th>${fieldLabels[state.primaryDimension] || state.primaryDimension}</th>
    ${state.secondaryDimension ? `<th>${fieldLabels[state.secondaryDimension] || state.secondaryDimension}</th>` : ""}
    <th>记录数</th><th>${fieldLabels[state.metric] || state.metric}均值</th>
    ${summaryFields.map(field => `<th>${fieldLabels[field] || field}</th>`).join("")}
  </tr>`;
  els.pivotBody.innerHTML = groups.map(group => `
    <tr data-group-key="${group.key}" class="${state.selectedGroup === group.key ? "active" : ""}">
      <td class="pivot-key">${group.values[0]}</td>
      ${state.secondaryDimension ? `<td>${group.values[1]}</td>` : ""}
      <td>${group.rows.length}</td>
      <td><span class="metric-chip">${average(group.rows, state.metric).toFixed(1)}</span></td>
      ${summaryFields.map(field => `<td>${average(group.rows, field).toFixed(1)}</td>`).join("")}
    </tr>
  `).join("");
  els.pivotBody.querySelectorAll("tr").forEach(row => row.addEventListener("click", () => {
    state.selectedGroup = row.dataset.groupKey;
    render();
    document.querySelector(".detail-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function renderChart(groups) {
  const metric = state.metric;
  const summaries = groups.map(group => ({ group, ...Core.numericSummary(group.rows, metric) }));
  const values = summaries.map(summary => summary.mean + summary.sd);
  const { axisMin, axisMax } = Core.computeAxisRange(values, state.yAxisMode, metric);
  const range = axisMax - axisMin || 1;
  const ticks = Array.from({ length: 6 }, (_, index) => axisMax - range * index / 5);
  els.chartTitle.textContent = `${fieldLabels[metric] || metric}组间柱状对比`;
  els.barChart.innerHTML = groups.length ? `<div class="academic-chart">
    <div class="y-axis-title">${fieldLabels[metric] || metric}均值</div>
    <div class="y-axis">${ticks.map(tick => `<span style="top:${(axisMax - tick) / range * 100}%">${tick.toFixed(1)}</span>`).join("")}</div>
    <div class="plot-area">
      <div class="grid-lines">${ticks.map(tick => `<i style="top:${(axisMax - tick) / range * 100}%"></i>`).join("")}</div>
      <div class="column-chart">${summaries.slice(0, 12).map(({ group, mean, sd, n }) => {
    const value = mean;
    const errorTop = Math.max(0, Math.min(100, (axisMax - (mean + sd)) / range * 100));
    const errorBottom = Math.max(0, Math.min(100, (axisMax - (mean - sd)) / range * 100));
    return `<div class="column-item" title="${group.values.join(" / ")}：${value.toFixed(1)} ± ${sd.toFixed(1)}，n=${n}">
      <span class="column-value">${value.toFixed(1)}</span>
      ${state.showErrorBars ? `<span class="error-bar" style="top:${errorTop}%;height:${Math.max(0, errorBottom - errorTop)}%"></span>` : ""}
      <div class="column-bar" style="height:${Math.max(0, (value - axisMin) / range * 100)}%"></div>
      <span class="column-label">${group.values.join(" / ")}<small>n=${n}</small></span>
    </div>`;
  }).join("")}</div>
    </div>
    <div class="x-axis-title">${fieldLabels[state.primaryDimension] || state.primaryDimension}${state.secondaryDimension ? ` × ${fieldLabels[state.secondaryDimension] || state.secondaryDimension}` : ""}</div>
  </div>` : '<div class="empty-state">没有可绘制的数据。</div>';
}

function pressureFields() {
  return state.headers.filter(field => fieldRole(field) === "pressure");
}

function deviceField() {
  return state.headers.find(field => fieldRole(field) === "device") ||
    state.headers.find(field => /device|condition|设备|条件|样机/i.test(field));
}

function pressureSelectableFields() {
  return state.headers.filter(field => {
    const role = fieldRole(field);
    return ["user", "dimension", "device"].includes(role) &&
      field !== state.userIdField &&
      field !== deviceField() &&
      field !== earSideField() &&
      unique(field).length > 0 &&
      unique(field).length <= 60;
  });
}

function refreshPressureControls() {
  if (!els.pressureDeviceFilter) return;
  const currentDevice = state.pressureDeviceFilter;
  const currentEar = state.pressureEarFilter;
  const currentField = state.pressureGroupField;
  const currentValue = state.pressureGroupValue;
  const currentAggregation = state.pressureAggregation;
  const pressureDeviceField = deviceField();
  const pressureEarField = earSideField();
  const devices = pressureDeviceField ? unique(pressureDeviceField) : [];
  const ears = pressureEarField ? unique(pressureEarField) : [];
  const groupFields = pressureSelectableFields();

  fillSelect(els.pressureDeviceFilter, devices, true, fieldLabels);
  els.pressureDeviceFilter.options[0].textContent = "全部设备";
  fillSelect(els.pressureEarFilter, ears, true, fieldLabels);
  els.pressureEarFilter.options[0].textContent = "全部耳侧";
  fillSelect(els.pressureGroupField, groupFields, true, fieldLabels);
  els.pressureGroupField.options[0].textContent = "不使用";

  els.pressureDeviceFilter.value = devices.includes(currentDevice) ? currentDevice : "";
  els.pressureEarFilter.value = ears.includes(currentEar) ? currentEar : "";
  els.pressureGroupField.value = groupFields.includes(currentField) ? currentField : "";

  const values = els.pressureGroupField.value ? unique(els.pressureGroupField.value) : [];
  fillSelect(els.pressureGroupValue, values, true, fieldLabels);
  els.pressureGroupValue.options[0].textContent = els.pressureGroupField.value ? "全部取值" : "先选择字段";
  els.pressureGroupValue.value = values.includes(currentValue) ? currentValue : "";

  els.pressureAggregation.value = ["mean", "median", "highRate"].includes(currentAggregation) ? currentAggregation : "mean";
  state.pressureDeviceFilter = els.pressureDeviceFilter.value;
  state.pressureEarFilter = els.pressureEarFilter.value;
  state.pressureGroupField = els.pressureGroupField.value;
  state.pressureGroupValue = els.pressureGroupValue.value;
  state.pressureAggregation = els.pressureAggregation.value;
}

function pressureMechanismRows() {
  const pressureDeviceField = deviceField();
  const pressureEarField = earSideField();
  return filteredRows().filter(row => {
    if (state.pressureDeviceFilter && pressureDeviceField && row[pressureDeviceField] !== state.pressureDeviceFilter) return false;
    if (state.pressureEarFilter && pressureEarField && row[pressureEarField] !== state.pressureEarFilter) return false;
    if (state.pressureGroupField && state.pressureGroupValue && row[state.pressureGroupField] !== state.pressureGroupValue) return false;
    return true;
  });
}

function heatColor(value, aggregation) {
  const risk = aggregation === "highRate" ? value * 10 : value;
  const clamped = Math.max(0, Math.min(10, risk));
  const alpha = 0.12 + clamped / 10 * 0.78;
  return `rgba(143, 29, 34, ${alpha.toFixed(2)})`;
}

function heatRadius(value, aggregation) {
  const risk = aggregation === "highRate" ? value * 10 : value;
  return 15 + Math.max(0, Math.min(10, risk)) * 2.1;
}

function pressureSpotPosition(siteKey, view) {
  const positions = {
    front: {
      tragus: [108, 164],
      antitragus: [121, 218],
      helix: [190, 82],
      concha: [157, 176],
      canal: [150, 194],
      lobe: [151, 282],
      "upper-ear": [175, 78],
      postauricular: [206, 165]
    },
    rear: {
      postauricular: [148, 175],
      helix: [188, 94],
      "upper-ear": [170, 78],
      lobe: [150, 280]
    },
    top: {
      "upper-ear": [158, 116],
      helix: [210, 130],
      postauricular: [145, 186],
      concha: [160, 158]
    }
  };
  return positions[view]?.[siteKey] || positions.front[siteKey] || [160, 170];
}

function pressureSvgBase(view) {
  if (view === "rear") {
    return `
      <path class="ear-outline" d="M168 48 C230 62 258 124 244 198 C232 263 197 318 151 326 C113 333 84 301 77 248 C67 174 92 78 168 48 Z"/>
      <path class="ear-fold" d="M174 72 C214 98 223 156 209 207 C196 258 174 291 145 304"/>
      <path class="ear-fold" d="M132 90 C106 141 103 214 126 267"/>
      <path class="ear-fold accent-line" d="M137 130 C156 151 162 198 143 236"/>
    `;
  }
  if (view === "top") {
    return `
      <path class="ear-outline" d="M72 176 C91 94 153 55 218 85 C260 105 265 165 226 207 C181 256 98 246 72 176 Z"/>
      <path class="ear-fold" d="M108 169 C125 112 174 91 215 115 C236 129 240 161 217 184 C187 215 130 209 108 169 Z"/>
      <path class="ear-fold accent-line" d="M88 164 C124 153 168 157 232 181"/>
      <path class="ear-fold" d="M148 118 C169 139 170 174 148 194"/>
    `;
  }
  return `
    <path class="ear-outline" d="M179 39 C238 55 266 112 254 185 C244 245 211 306 160 323 C119 337 88 308 86 263 C88 215 111 203 101 168 C88 123 113 55 179 39 Z"/>
    <path class="ear-fold" d="M185 69 C221 92 231 134 221 179 C210 231 187 276 151 291"/>
    <path class="ear-fold" d="M152 95 C119 124 119 169 137 191 C155 213 185 199 188 170 C192 135 174 113 152 95 Z"/>
    <path class="ear-fold accent-line" d="M105 168 C126 161 148 170 151 194 C154 216 137 227 120 221"/>
    <path class="ear-fold" d="M143 203 C162 221 172 246 157 274"/>
  `;
}

function renderPressureSvg(view, title, summaries) {
  const visible = summaries.filter(item => item.view === view || (view === "front" && !["rear", "top"].includes(item.view)));
  return `<article class="pressure-map-card">
    <div class="pressure-map-title">${attrEscape(title)}<small>${visible.length} 个部位</small></div>
    <svg viewBox="0 0 320 360" role="img" aria-label="${attrEscape(title)}标准耳挤压热图">
      ${pressureSvgBase(view)}
      ${visible.map(item => {
        const [x, y] = pressureSpotPosition(item.siteKey, view);
        const radius = heatRadius(item.value, state.pressureAggregation);
        const color = heatColor(item.value, state.pressureAggregation);
        const label = attrEscape(item.label);
        return `<g class="pressure-hotspot" tabindex="0">
          <circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"></circle>
          <circle cx="${x}" cy="${y}" r="4"></circle>
          <text x="${x}" y="${y - radius - 7}" text-anchor="middle">${label}</text>
          <title>${label}：${attrEscape(item.valueLabel)}，n=${item.n}</title>
        </g>`;
      }).join("")}
    </svg>
  </article>`;
}

function renderPressureMechanism() {
  if (!els.pressureHeatmaps) return;
  refreshPressureControls();
  const fields = pressureFields();
  const rows = pressureMechanismRows();
  if (!state.rows.length) {
    els.pressureSummary.textContent = "尚未加载数据";
    els.pressureHeatmaps.innerHTML = '<div class="empty-state">请先在 01 页加载项目或应用照片映射数据。</div>';
    els.pressureRanking.innerHTML = "";
    return;
  }
  if (!fields.length) {
    els.pressureSummary.textContent = "未识别到挤压字段";
    els.pressureHeatmaps.innerHTML = '<div class="empty-state">请在 02 页“字段角色”中把挤压列设为“挤压程度”。</div>';
    els.pressureRanking.innerHTML = "";
    return;
  }
  const summaries = Core.aggregatePressureSites(rows, fields, {
    labels: fieldLabels,
    pressureWorst: state.pressureWorst,
    aggregation: state.pressureAggregation
  });
  const users = new Set(rows.map(row => row[state.userIdField]).filter(Boolean)).size;
  const aggLabel = { mean: "平均风险", median: "中位风险", highRate: "高挤压比例" }[state.pressureAggregation];
  els.pressureSummary.textContent = `${rows.length} 条记录 · ${users} 位用户 · ${aggLabel}`;
  els.pressureHeatmaps.innerHTML = summaries.length ? [
    renderPressureSvg("rear", "耳后", summaries),
    renderPressureSvg("top", "耳上", summaries),
    renderPressureSvg("front", "正对耳朵", summaries)
  ].join("") : '<div class="empty-state">当前筛选条件下没有可聚合的挤压数据。</div>';
  els.pressureRanking.innerHTML = summaries.length ? summaries.map((item, index) => {
    const width = state.pressureAggregation === "highRate" ? item.value * 100 : item.value * 10;
    return `<div class="pressure-rank-row">
      <strong>${index + 1}. ${attrEscape(item.label)}</strong>
      <span>${attrEscape(item.valueLabel)} · n=${item.n}</span>
      <i style="width:${Math.max(2, Math.min(100, width))}%"></i>
    </div>`;
  }).join("") : '<div class="empty-state">暂无排行。</div>';
}

function scoreClass(value) {
  return Number(value) >= 8 ? "high" : Number(value) <= 5 ? "low" : "";
}

function pressureClass(value) {
  if (value === "" || value == null) return "";
  const score = Number(value);
  if (!Number.isFinite(score)) return "";
  const severityScore = state.pressureWorst === "high" ? 10 - score : score;
  if (severityScore >= 8 && severityScore <= 9) return "clear";
  if (severityScore >= 6 && severityScore <= 7) return "warn";
  if (severityScore >= 0 && severityScore <= 5) return `red-${Math.round(severityScore)}`;
  return "";
}

function pressureTitle(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "挤压程度：未填写";
  if (state.pressureWorst === "high") {
    if (score === 0) return "挤压程度：0=无挤压";
    if (score <= 2) return "挤压程度：1-2=轻微或基本无挤压";
    if (score <= 4) return "挤压程度：3-4=轻中度挤压";
    return "挤压程度：5-10=明显挤压，10 最严重";
  }
  if (score === 10) return "挤压程度：10=无挤压";
  if (score >= 8) return "挤压程度：8-9=轻微或基本无挤压";
  if (score >= 6) return "挤压程度：6-7=轻中度挤压";
  return "挤压程度：0-5=明显挤压，0 最严重";
}

function pressureTag(label, value) {
  if (value === "" || value == null) return "";
  const score = Number(value);
  const noPressureScore = state.pressureWorst === "high" ? 0 : 10;
  if (!Number.isFinite(score) || score === noPressureScore) return "";
  return `<span class="pressure-tag ${pressureClass(value)}" title="${pressureTitle(value)}">${label}：${score}</span>`;
}

function groupByUser(rows) {
  const users = new Map();
  rows.forEach(row => {
    const user = row[state.userIdField];
    if (!users.has(user)) users.set(user, []);
    users.get(user).push(row);
  });
  return [...users.values()];
}

function detailCell(column, row) {
  const field = column.id;
  const value = row[field] ?? "";
  const classes = [field === state.userIdField ? "user-cell" : ""].filter(Boolean).join(" ");
  if (field === "__pressure_summary") {
    const pressureFields = state.headers.filter(field => fieldRole(field) === "pressure");
    return `<td><div class="pressure-tags">${pressureFields.map(item => {
      const score = row[item];
      return pressureTag(Core.pressureSiteLabel(item, fieldLabels[item]), score);
    }).join("") || "—"}</div></td>`;
  }
  if (field === "__user_profile") {
    const profileFields = state.layout.columns.filter(item =>
      item.userLevel && !item.derived && !item.photo && item.id !== state.userIdField
    );
    return `<td><div class="profile-tags">${profileFields.map(item =>
      row[item.id] === "" ? "" : `<span class="profile-tag"><b>${item.label}</b>${row[item.id]}</span>`
    ).join("") || "—"}</div></td>`;
  }
  if (fieldRole(field) === "pressure") {
    return `<td class="${classes}"><span class="pressure ${pressureClass(value)}" title="${pressureTitle(value)}">${value === "" ? "—" : `${value}分`}</span></td>`;
  }
  if (/score$|rating$|satisfaction|comfort|stability/i.test(field) && isNumericField(field)) {
    return `<td class="${classes}"><span class="score ${scoreClass(value)}">${value || "—"}</span></td>`;
  }
  return `<td class="${classes}">${field === state.userIdField ? `<strong>${value}</strong>` : value || "—"}</td>`;
}

function photoGalleryCell(column, userRows) {
  const user = userRows[0][state.userIdField];
  const deviceField = state.headers.includes("device_name") ? "device_name" :
    state.headers.find(field => /device|condition|设备|条件/i.test(field));
  const earField = earSideField();
  const userOptions = photoViewOptions(userRows);
  const selectedValue = state.userViews[user] || state.globalView || userOptions[0]?.value || state.photoFields[0];
  const selectedView = parsePhotoViewValue(selectedValue);
  const items = userRows.filter(row => rowMatchesPhotoView(row, selectedView)).map(row => {
    const caption = [earField ? row[earField] : "", row[deviceField] || column.label].filter(Boolean).join(" · ");
    const src = photoUrl(row[selectedView.field]);
    const thumbSrc = photoThumbUrl(row[selectedView.field]);
    return `
    <figure class="photo-thumb">
      <img class="ear-photo photo-preview-trigger" src="${thumbSrc}" alt="${row[state.userIdField]} ${caption}" loading="lazy" tabindex="0" role="button" data-preview-src="${attrEscape(src)}" data-preview-caption="${attrEscape(`${row[state.userIdField]} ${caption}`)}">
      <figcaption>${caption}</figcaption>
    </figure>`;
  }).join("");
  const options = userOptions.map(option =>
    `<option value="${option.value}" ${state.userViews[user] === option.value ? "selected" : ""}>${option.label}</option>`
  ).join("");
  return `<td class="photo-cell" rowspan="${userRows.length}">
    <select class="user-view-select" data-user="${user}" aria-label="${user}照片视角">
      <option value="">跟随全局</option>${options}
    </select>
    <div class="photo-gallery" style="--photo-count:${Math.max(1, userRows.length)}">${items || "—"}</div>
  </td>`;
}

function detailRows(allFilteredRows, groups) {
  if (!state.selectedGroup) return allFilteredRows;
  return groups.find(group => group.key === state.selectedGroup)?.rows || allFilteredRows;
}

function renderDetails(rows, groups) {
  let selected = groups.find(group => group.key === state.selectedGroup);
  const baseRows = detailRows(rows, groups);
  const query = state.search.toLowerCase();
  const visibleRows = query ? baseRows.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(query))) : baseRows;

  if (selected) {
    els.detailTitle.textContent = selected.values.join(" × ");
    els.detailDescription.textContent = `当前展示该透视分组的全部原始测试记录；照片直接附在每条记录后。`;
  } else {
    els.detailTitle.textContent = "全部筛选数据";
    els.detailDescription.textContent = "点击上方任意透视分组，可查看该组原始记录与照片。";
  }

  const stats = [
    ["记录", baseRows.length],
    ["用户", new Set(baseRows.map(row => row[state.userIdField])).size],
    ["满意度", state.headers.includes("satisfaction_score") ? average(baseRows, "satisfaction_score").toFixed(1) : "—"],
    ["舒适性", state.headers.includes("comfort_score") ? average(baseRows, "comfort_score").toFixed(1) : "—"],
    ["稳定性", state.headers.includes("stability_score") ? average(baseRows, "stability_score").toFixed(1) : "—"]
  ];
  els.groupStats.innerHTML = stats.map(([label, value]) => `<div class="group-stat">${label}<strong>${value}</strong></div>`).join("");
  els.detailCount.textContent = `显示 ${visibleRows.length} / ${baseRows.length} 条记录`;
  const visibleColumns = state.layout.columns.filter(column => column.visible);
  const maxPhotos = Math.max(1, ...groupByUser(visibleRows).map(userRows =>
    Math.max(...visibleColumns.filter(column => column.photo).map(column =>
      column.id === "__photo_view" ? userRows.filter(row => {
        const selectedValue = state.userViews[userRows[0][state.userIdField]] || state.globalView || photoViewOptions(userRows)[0]?.value;
        return rowMatchesPhotoView(row, parsePhotoViewValue(selectedValue)) || state.photoFields.some(field => row[field]);
      }).length : userRows.filter(row => row[column.id]).length
    ), 0)
  ));
  const columnWidths = visibleColumns.map(column =>
    column.photo ? Math.max(column.width, maxPhotos * (state.layout.photoSize + 10)) : column.width
  );
  const totalWeight = columnWidths.reduce((sum, width) => sum + width, 0);
  els.detailColgroup.innerHTML = visibleColumns.map((column, index) => `<col style="width:${columnWidths[index] / totalWeight * 100}%">`).join("");
  els.detailHead.innerHTML = `<tr>${visibleColumns.map(column => {
    if (column.derived || column.photo) return `<th>${column.label}</th>`;
    const values = [...new Set(rows.map(row => row[column.id]).filter(value => value !== ""))].sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
    const options = values.length <= 80 ? values.map(value => `<option value="${value}" ${state.columnFilters[column.id] === String(value) ? "selected" : ""}>${value}</option>`).join("") : "";
    return `<th><span>${column.label}</span><select class="header-filter" data-field="${column.id}" aria-label="${column.label}筛选"><option value="">全部</option>${options}</select></th>`;
  }).join("")}</tr>`;
  els.detailBody.innerHTML = visibleRows.length ? groupByUser(visibleRows).map(userRows =>
    userRows.map((row, rowIndex) => `<tr class="${rowIndex === 0 ? "user-group-start" : ""}">
      ${visibleColumns.map(column => {
        if (column.photo) return rowIndex === 0 ? photoGalleryCell(column, userRows) : "";
        if (column.userLevel && rowIndex > 0) return "";
        const cell = detailCell(column, row);
        return column.userLevel ? cell.replace("<td", `<td rowspan="${userRows.length}"`) : cell;
      }).join("")}
    </tr>`).join("")
  ).join("") : `<tr><td colspan="${visibleColumns.length || 1}"><div class="empty-state">当前组内没有匹配记录。</div></td></tr>`;
}

function render() {
  const rows = filteredRows();
  const groups = groupedRows(rows);
  if (state.selectedGroup && !groups.some(group => group.key === state.selectedGroup)) state.selectedGroup = null;
  renderKPIs(rows);
  renderDataQuality();
  renderPivot(groups);
  renderChart(groups);
  renderDetails(rows, groups);
  renderPressureMechanism();
}

function switchPage(page) {
  document.querySelectorAll(".app-page").forEach(element => element.classList.toggle("active", element.id === `${page}Page`));
  document.querySelectorAll(".page-tab").forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function mappingViews() {
  return els.viewNamesInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
}

function initializeMappingFields() {
  const headers = Object.keys(state.mappingRows[0] || {});
  fillSelect(els.mappingUserField, headers, false, fieldLabels);
  fillSelect(els.mappingEarField, headers, true, fieldLabels);
  fillSelect(els.mappingDeviceField, headers, true, fieldLabels);
  if (els.mappingEarField.options[0]) els.mappingEarField.options[0].textContent = "不配置（照片仍识别左右耳）";
  if (els.mappingDeviceField.options[0]) els.mappingDeviceField.options[0].textContent = "不配置（按单设备）";
  els.mappingUserField.value = headers.find(field => /^(name|姓名|user_name|用户姓名)$/i.test(field)) ||
    headers.find(field => /^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) || headers[0] || "";
  els.mappingEarField.value = headers.find(field => /ear_side|左右耳|耳侧|left_right|side/i.test(field)) || "";
  els.mappingDeviceField.value = headers.find(field => /^device_name$/i.test(field)) ||
    headers.find(field => /prototype|sample|样机|device_name|device_id|condition|设备|条件/i.test(field)) || "";
  renderMappingMode();
}

function renderMappingMode() {
  const folderMode = els.mappingMode.value === "folders";
  els.mappingEarFieldWrap.hidden = false;
  els.viewNamesInputWrap.hidden = folderMode;
  els.viewNamesInput.placeholder = folderMode ? "例如：正面,侧面,后侧" : "例如：左耳正面,左耳侧面,右耳正面,右耳侧面";
  els.mappingModeNote.innerHTML = folderMode ?
    `<strong>当前规则：子文件夹识别</strong><span>不需要填写拍摄顺序。系统会从照片目录自动识别方向，并生成左右耳 × 方向照片列；左右耳字段和设备字段可不配置。</span>` :
    `<strong>当前规则：按文件名顺序</strong><span>需要填写拍摄顺序。每个用户文件夹内照片按名称自然排序，依次分配给 CSV 中该用户的设备记录和视角。</span>`;
}

function renderPhotoSourceMode() {
  const serverMode = Boolean(state.serverProjectId);
  document.body.dataset.runtimeMode = serverMode ? "server" : "local";
  document.querySelectorAll("[data-server-only]").forEach(element => {
    element.hidden = !serverMode;
  });
  if (els.photoRootInputWrap) els.photoRootInputWrap.hidden = serverMode;
  if (els.photoFolderInputWrap) els.photoFolderInputWrap.hidden = !serverMode;
}

function clearMappingObjectUrls() {
  state.mappingObjectUrls.forEach(url => URL.revokeObjectURL(url));
  state.mappingObjectUrls = [];
  Object.values(state.thumbnailUrls).forEach(url => {
    if (String(url).startsWith("blob:")) URL.revokeObjectURL(url);
  });
  state.thumbnailUrls = {};
}

function imageLoad(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function createThumbnailUrl(sourceUrl, maxSize = 128) {
  const image = await imageLoad(sourceUrl);
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(image, 0, 0, width, height);
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      resolve(blob ? URL.createObjectURL(blob) : sourceUrl);
    }, "image/jpeg", 0.72);
  });
}

async function buildMappingThumbnails(photos = []) {
  await Promise.all(photos.map(async photo => {
    if (!photo.absolute_path || state.thumbnailUrls[photo.absolute_path]) return;
    try {
      const thumbUrl = await createThumbnailUrl(photo.absolute_path);
      state.thumbnailUrls[photo.absolute_path] = thumbUrl;
    } catch {
      state.thumbnailUrls[photo.absolute_path] = photo.absolute_path;
    }
  }));
}

async function loadBrowserPhotoFolder(files = []) {
  clearMappingObjectUrls();
  const photos = Core.photoFilesFromBrowserSelection(files, {
    urlForFile: file => {
      const url = URL.createObjectURL(file);
      state.mappingObjectUrls.push(url);
      return url;
    }
  });
  if (els.photoFolderStatus) els.photoFolderStatus.textContent = `正在生成 ${photos.length} 张缩略图…`;
  await buildMappingThumbnails(photos);
  state.mappingFiles = photos;
  const rootName = [...files].find(file => file.webkitRelativePath)?.webkitRelativePath?.split(/[\\/]/)[0] || "已选择文件夹";
  els.photoRootInput.value = photos.length ? `browser-folder:${rootName}` : "";
  if (els.photoFolderStatus) {
    els.photoFolderStatus.textContent = photos.length ?
      `已选择 ${rootName}，识别到 ${photos.length} 张图片。` :
      "未识别到图片，请选择包含照片的文件夹。";
  }
  resetMappingOutputs();
  return photos;
}

async function scanPhotoRoot() {
  if (state.serverProjectId) return uploadServerPhotoFiles();
  if (state.mappingFiles.some(file => file.source === "browser_folder")) {
    return { root: els.photoRootInput.value || "browser-folder", photos: state.mappingFiles };
  }
  const root = els.photoRootInput.value.trim();
  if (!root) throw new Error("请选择照片根文件夹，或在高级设置中手动输入路径。");
  const response = await fetch("/api/scan-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "照片目录扫描失败。");
  state.mappingFiles = result.photos;
  return result;
}

async function uploadServerPhotoFiles() {
  if (!els.photoFolderInput) throw new Error("当前入口未提供服务器照片上传控件。");
  const files = [...(els.photoFolderInput.files || [])]
    .filter(file => Core.isImagePath(file.name));
  if (!files.length) throw new Error("服务器版请先选择包含照片的文件夹。");
  if (!state.serverProjectId) throw new Error("缺少服务器项目 ID。");

  const rawPaths = files.map(file => file.webkitRelativePath || file.name);
  const firstParts = rawPaths.map(path => path.split(/[\\/]/).filter(Boolean)[0]);
  const stripSelectedRoot = firstParts.length > 0 && firstParts.every(part => part === firstParts[0]) &&
    rawPaths.some(path => path.split(/[\\/]/).filter(Boolean).length > 1);
  const photos = [];
  for (const [index, file] of files.entries()) {
    const rawPath = file.webkitRelativePath || file.name;
    const parts = rawPath.split(/[\\/]/).filter(Boolean);
    const relativePath = stripSelectedRoot ? parts.slice(1).join("/") : parts.join("/");
    const url = `/api/server/projects/${encodeURIComponent(state.serverProjectId)}/photos?path=${encodeURIComponent(relativePath)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `照片上传失败：${relativePath}`);
    photos.push(result.photo);
    if ((index + 1) % 10 === 0 || index === files.length - 1) {
      els.mappingSummary.textContent = `正在上传照片 ${index + 1} / ${files.length}`;
    }
  }
  photos.sort((a, b) => (a.user_folder || "").localeCompare(b.user_folder || "", "zh-CN") ||
    Core.naturalCompare(a.relative_path || a.name, b.relative_path || b.name));
  state.mappingFiles = photos;
  els.photoRootInput.value = `server:${state.serverProjectId}`;
  return { root: els.photoRootInput.value, photos };
}

function buildPhotoMapping() {
  const mode = els.mappingMode.value;
  const userField = els.mappingUserField.value;
  const earField = els.mappingEarField.value;
  const deviceField = els.mappingDeviceField.value;
  const templateViews = protocolPhotoViews();
  const expectedEars = protocolExpectedEars();
  const inferredFolderViews = mode === "folders" ? Core.inferFolderViews(state.mappingRows, state.mappingFiles, {
    userField,
    earField,
    deviceField
  }) : [];
  const views = mode === "folders" ? (templateViews.length ? templateViews : inferredFolderViews) : mappingViews();
  if (!state.mappingRows.length) throw new Error("请先选择 CSV。");
  if (!views.length) throw new Error(mode === "folders" ? "没有从照片目录中识别到方向/视角文件夹。" : "请至少填写一个视角名称。");
  if (!userField) throw new Error("请选择用户字段。");
  if (mode === "folders") els.viewNamesInput.value = views.join(",");

  const { mapped, reviews, photoFields } = Core.mapPhotosToRows(state.mappingRows, state.mappingFiles, {
    mode,
    userField,
    earField,
    deviceField,
    views,
    expectedEars,
    overrides: state.photoMappingOverrides
  });
  state.mappedRows = mapped;
  state.mappingReviews = reviews;
  state.mappingPhotoFields = photoFields;
  state.mappingViews = views;
  const photoViews = Core.viewDescriptors(state.mappingRows, {
    mode,
    earField,
    views,
    expectedEars,
    files: state.mappingFiles
  });
  photoFields.forEach((field, index) => {
    const label = photoViews[index]?.label || views[index] || field;
    state.viewLabels[field] = label;
    fieldLabels[field] = label;
  });
  renderMappingPreview(reviews, userField, deviceField, photoFields);
  els.applyMappingButton.disabled = false;
  els.downloadMappedCsvButton.disabled = false;
  els.downloadPhotoAuditButton.disabled = false;
}

function photoSelectOptions(files, selectedPath) {
  const selectedKnown = files.some(file => file.absolute_path === selectedPath);
  return `<option value="">缺失/不使用</option>` +
    (!selectedKnown && selectedPath ? `<option value="${selectedPath}" selected>当前手动路径</option>` : "") +
    files.map(file => `<option value="${file.absolute_path}" ${file.absolute_path === selectedPath ? "selected" : ""}>${file.name}</option>`).join("");
}

function renderMappingReviewCard(review, deviceField, photoFields) {
  const selectFiles = els.mappingMode.value === "folders" ? state.mappingFiles : null;
  return `<article class="mapping-user ${review.status}" data-review-user="${attrEscape(review.user)}">
    <div class="mapping-user-heading">
      <strong>${review.user}</strong>
      <span>预期 ${review.expected} 张 / 实际 ${review.files.length} 张</span>
      <b>${review.status === "ok" ? "映射正常" : review.status === "missing" ? "照片不足" : "照片过多"}</b>
    </div>
    <div class="mapping-device-list">${review.entries.map(entry => `
      <div class="mapping-device-row">
        <strong>${deviceField ? entry.row[deviceField] || "未命名设备" : "单设备"}</strong>
        ${photoFields.map(field => {
          const path = state.mappedRows[entry.rowIndex][field];
          const src = path ? photoUrl(path) : "";
          const thumbSrc = path ? photoThumbUrl(path) : "";
          const caption = `${review.user} · ${deviceField ? entry.row[deviceField] || "未命名设备" : "单设备"} · ${state.viewLabels[field]}`;
          return `<figure class="mapping-photo-slot ${path ? "has-photo" : "missing"}" draggable="${path ? "true" : "false"}" data-user="${attrEscape(review.user)}" data-row-index="${entry.rowIndex}" data-field="${attrEscape(field)}" title="拖动同一用户内的照片可交换映射">
            ${path ? `<img class="photo-preview-trigger" src="${thumbSrc}" alt="${state.viewLabels[field]}" loading="lazy" decoding="async" draggable="false" tabindex="0" role="button" data-preview-src="${attrEscape(src)}" data-preview-caption="${attrEscape(caption)}">` : `<div class="missing-photo">缺失</div>`}
            <figcaption>${state.viewLabels[field]}</figcaption>
            <select class="mapping-photo-select" data-row-index="${entry.rowIndex}" data-field="${field}">
              ${photoSelectOptions(selectFiles || review.files, path)}
            </select>
          </figure>`;
        }).join("")}
      </div>
    `).join("")}</div>
    ${review.notes?.length ? `<div class="mapping-notes">${review.notes.map(note => `<p>${note}</p>`).join("")}</div>` : ""}
  </article>`;
}

function renderMappingPreview(reviews, userField, deviceField, photoFields) {
  const ok = reviews.filter(review => review.status === "ok").length;
  const issues = reviews.length - ok;
  els.mappingSummary.innerHTML = `<strong>${reviews.length}</strong> 位用户 · <strong>${ok}</strong> 正常 · <strong>${issues}</strong> 异常`;
  els.mappingPreview.innerHTML = reviews.map(review => renderMappingReviewCard(review, deviceField, photoFields)).join("");
}

function renderMappingReviewUser(user) {
  const review = state.mappingReviews.find(item => String(item.user) === String(user));
  if (!review) return;
  const current = [...els.mappingPreview.querySelectorAll(".mapping-user")]
    .find(element => element.dataset.reviewUser === String(user));
  const html = renderMappingReviewCard(review, els.mappingDeviceField.value, state.mappingPhotoFields);
  if (current) current.outerHTML = html;
}

function mappingSlotFromElement(element) {
  const slot = element?.closest?.(".mapping-photo-slot");
  if (!slot) return null;
  return {
    user: slot.dataset.user || "",
    rowIndex: Number(slot.dataset.rowIndex),
    field: slot.dataset.field || ""
  };
}

function applyPhotoSlotOverrides(slots = []) {
  slots.forEach(slot => {
    const row = state.mappedRows[slot.rowIndex];
    if (!row || !slot.field) return;
    state.photoMappingOverrides[`${slot.rowIndex}::${slot.field}`] = row[slot.field] || "";
  });
}

function swapMappingPhotoSlots(source, target) {
  if (!source || !target) return false;
  if (source.user !== target.user) return false;
  if (source.rowIndex === target.rowIndex && source.field === target.field) return false;
  state.mappedRows = Core.swapMappedPhotoAssignments(state.mappedRows, source, target);
  applyPhotoSlotOverrides([source, target]);
  renderMappingReviewUser(source.user);
  markProjectDirty();
  return true;
}

function createMappingDragImage(label = "交换照片") {
  const element = document.createElement("div");
  element.className = "mapping-drag-image";
  element.textContent = label;
  document.body.append(element);
  mappingDragImage = element;
  return element;
}

function clearMappingDragState() {
  draggedMappingPhoto = null;
  mappingDragTargetElement = null;
  mappingDragImage?.remove();
  mappingDragImage = null;
  els.mappingPreview.querySelectorAll(".mapping-photo-slot").forEach(slot => {
    slot.classList.remove("dragging", "drop-target");
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function attrEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function downloadMappedCsv() {
  const headers = Object.keys(state.mappedRows[0] || {});
  const csv = [headers.join(","), ...state.mappedRows.map(row => headers.map(header => csvEscape(row[header])).join(","))].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = "headphone_data_with_photos.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadPhotoAuditCsv() {
  const deviceField = els.mappingDeviceField.value;
  const auditRows = Core.buildPhotoAuditRows(state.mappingReviews, state.mappingPhotoFields, state.mappedRows, {
    deviceField,
    viewLabels: state.viewLabels
  });
  const headers = ["status", "user", "device", "rowIndex", "field", "view", "message"];
  const csvRows = auditRows.length ? auditRows : [{
    status: "ok",
    user: "",
    device: "",
    rowIndex: "",
    field: "",
    view: "",
    message: "未发现缺失照片或映射异常"
  }];
  const csv = [headers.join(","), ...csvRows.map(row => headers.map(header => csvEscape(row[header])).join(","))].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = "photo_mapping_audit.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function openPhotoLightbox(src, caption = "", returnFocus = document.activeElement) {
  if (!src) return;
  photoLightboxReturnFocus = returnFocus;
  els.photoLightboxImage.src = src;
  els.photoLightboxImage.alt = caption || "照片大图";
  els.photoLightboxCaption.textContent = caption;
  els.photoLightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  els.photoLightboxClose.focus({ preventScroll: true });
}

function closePhotoLightbox() {
  els.photoLightbox.hidden = true;
  els.photoLightboxImage.src = "";
  els.photoLightboxImage.alt = "";
  els.photoLightboxCaption.textContent = "";
  document.body.classList.remove("lightbox-open");
  if (photoLightboxReturnFocus?.focus) photoLightboxReturnFocus.focus({ preventScroll: true });
  photoLightboxReturnFocus = null;
}

function resetMappingOutputs() {
  state.mappedRows = [];
  state.mappingReviews = [];
  state.mappingPhotoFields = [];
  state.photoMappingOverrides = {};
  els.applyMappingButton.disabled = true;
  els.downloadMappedCsvButton.disabled = true;
  els.downloadPhotoAuditButton.disabled = true;
}

function applyMappedRows() {
  state.rows = state.mappedRows.map(row => ({ ...row }));
  state.selectedGroup = null;
  state.columnFilters = {};
  state.userViews = {};
  buildSchema();
  initializeControls();
  renderFieldRoleConfig();
  renderColumnConfig();
  render();
  els.dataSourceLabel.textContent = "照片映射数据";
  switchPage("dashboard");
  markProjectDirty();
}

function bindEvents() {
  document.querySelectorAll(".page-tab").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.page)));
  els.loadProjectButton.addEventListener("click", async () => {
    els.loadProjectButton.disabled = true;
    setProjectStatus("正在加载项目…");
    try {
      await loadProject();
    } catch (error) {
      setProjectStatus(error.message);
    } finally {
      els.loadProjectButton.disabled = false;
    }
  });
  els.saveProjectButton.addEventListener("click", async () => {
    els.saveProjectButton.disabled = true;
    setProjectStatus("正在保存完整项目…");
    try {
      await saveProject();
    } catch (error) {
      setProjectStatus(error.message);
    } finally {
      els.saveProjectButton.disabled = false;
    }
  });
  els.saveProjectConfigButton.addEventListener("click", async () => {
    els.saveProjectConfigButton.disabled = true;
    setProjectStatus("正在保存当前配置…");
    try {
      await saveCurrentProjectConfig();
    } catch (error) {
      setProjectStatus(error.message);
    } finally {
      els.saveProjectConfigButton.disabled = false;
    }
  });
  els.protocolTemplateInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const template = JSON.parse(reader.result);
        setProtocolTemplate(template);
        renderProtocolStatus();
        markProjectDirty();
      } catch (error) {
        els.protocolStatus.textContent = `模板加载失败：${error.message}`;
      }
    };
    reader.readAsText(file, "UTF-8");
  });
  els.clearProtocolButton.addEventListener("click", event => {
    event.stopPropagation();
    state.protocolTemplate = null;
    state.protocolValidation = null;
    els.protocolTemplateInput.value = "";
    renderProtocolStatus();
    markProjectDirty();
  });
  els.mappingCsvInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.mappingRows = parseCSV(reader.result);
      resetMappingOutputs();
      initializeMappingFields();
      validateProtocolRows();
      renderProtocolStatus();
      els.mappingSummary.textContent = `${file.name} · ${state.mappingRows.length} 条记录`;
      markProjectDirty();
    };
    reader.readAsText(file, "UTF-8");
  });
  if (els.photoFolderInput) {
    els.photoFolderInput.addEventListener("change", () => {
      resetMappingOutputs();
      const count = [...(els.photoFolderInput.files || [])].filter(file => Core.isImagePath(file.name)).length;
      els.mappingSummary.textContent = count ? `已选择 ${count} 张照片，点击“生成照片映射”上传并映射。` : "未选择可用图片。";
    });
  }
  if (els.photoFolderChooser) {
    els.photoFolderChooser.addEventListener("change", async () => {
      els.mappingSummary.textContent = "正在读取照片并生成缩略图…";
      try {
        const photos = await loadBrowserPhotoFolder(els.photoFolderChooser.files || []);
        els.mappingSummary.textContent = photos.length ? `已选择 ${photos.length} 张照片，点击“生成照片映射”开始审查。` : "未选择可用图片。";
        markProjectDirty();
      } catch (error) {
        els.mappingSummary.textContent = `照片读取失败：${error.message}`;
      }
    });
  }
  els.photoRootInput.addEventListener("input", () => {
    clearMappingObjectUrls();
    state.mappingFiles = [];
    if (els.photoFolderChooser) els.photoFolderChooser.value = "";
    if (els.photoFolderStatus) els.photoFolderStatus.textContent = "将使用手动路径扫描照片目录。";
    resetMappingOutputs();
  });
  els.runMappingButton.addEventListener("click", async () => {
    els.runMappingButton.disabled = true;
    els.mappingSummary.textContent = "正在扫描并映射照片…";
    try {
      await scanPhotoRoot();
      state.photoMappingOverrides = {};
      buildPhotoMapping();
      markProjectDirty();
    } catch (error) {
      els.mappingSummary.textContent = error.message;
    } finally {
      els.runMappingButton.disabled = false;
    }
  });
  els.applyMappingButton.addEventListener("click", applyMappedRows);
  els.downloadMappedCsvButton.addEventListener("click", downloadMappedCsv);
  els.downloadPhotoAuditButton.addEventListener("click", downloadPhotoAuditCsv);
  els.mappingMode.addEventListener("change", () => {
    resetMappingOutputs();
    renderMappingMode();
    markProjectDirty();
  });
  els.mappingPreview.addEventListener("change", event => {
    if (!event.target.classList.contains("mapping-photo-select")) return;
    const key = `${event.target.dataset.rowIndex}::${event.target.dataset.field}`;
    if (event.target.value) state.photoMappingOverrides[key] = event.target.value;
    else state.photoMappingOverrides[key] = "";
    buildPhotoMapping();
    markProjectDirty();
  });
  els.mappingPreview.addEventListener("dragstart", event => {
    const slot = mappingSlotFromElement(event.target);
    if (!slot) return;
    const path = state.mappedRows[slot.rowIndex]?.[slot.field] || "";
    if (!path) {
      event.preventDefault();
      return;
    }
    draggedMappingPhoto = slot;
    const slotElement = event.target.closest(".mapping-photo-slot");
    slotElement?.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${slot.user}::${slot.rowIndex}::${slot.field}`);
    const dragImage = createMappingDragImage(slotElement?.querySelector("figcaption")?.textContent || "交换照片");
    event.dataTransfer.setDragImage(dragImage, 12, 12);
  });
  els.mappingPreview.addEventListener("dragover", event => {
    const slotElement = event.target.closest(".mapping-photo-slot");
    const slot = mappingSlotFromElement(slotElement);
    if (!draggedMappingPhoto || !slot || slot.user !== draggedMappingPhoto.user) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (slotElement === mappingDragTargetElement) return;
    mappingDragTargetElement?.classList.remove("drop-target");
    mappingDragTargetElement = slotElement;
    mappingDragTargetElement.classList.add("drop-target");
  });
  els.mappingPreview.addEventListener("dragleave", event => {
    const slotElement = event.target.closest(".mapping-photo-slot");
    if (slotElement && !slotElement.contains(event.relatedTarget)) {
      slotElement.classList.remove("drop-target");
      if (mappingDragTargetElement === slotElement) mappingDragTargetElement = null;
    }
  });
  els.mappingPreview.addEventListener("drop", event => {
    const slotElement = event.target.closest(".mapping-photo-slot");
    const target = mappingSlotFromElement(slotElement);
    if (!draggedMappingPhoto || !target) return;
    event.preventDefault();
    mappingDragTargetElement?.classList.remove("drop-target");
    mappingDragTargetElement = null;
    swapMappingPhotoSlots(draggedMappingPhoto, target);
  });
  els.mappingPreview.addEventListener("dragend", () => {
    clearMappingDragState();
  });
  document.addEventListener("click", event => {
    const trigger = event.target.closest(".photo-preview-trigger");
    if (trigger) {
      openPhotoLightbox(trigger.dataset.previewSrc || trigger.currentSrc || trigger.src, trigger.dataset.previewCaption || trigger.alt || "", trigger);
      return;
    }
    if (event.target === els.photoLightbox) closePhotoLightbox();
  });
  document.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.classList?.contains("photo-preview-trigger")) {
      event.preventDefault();
      openPhotoLightbox(event.target.dataset.previewSrc || event.target.currentSrc || event.target.src, event.target.dataset.previewCaption || event.target.alt || "", event.target);
    }
    if (event.key === "Escape" && !els.photoLightbox.hidden) closePhotoLightbox();
  });
  els.photoLightboxClose.addEventListener("click", closePhotoLightbox);
  els.fieldRoleList.addEventListener("change", event => {
    if (!event.target.matches("select[data-field]")) return;
    const field = event.target.dataset.field;
    const inferred = Core.inferFieldRole(field, state.rows);
    if (event.target.value === inferred) delete state.fieldRoleOverrides[field];
    else state.fieldRoleOverrides[field] = event.target.value;
    saveFieldRoleOverrides();
    state.selectedGroup = null;
    buildSchema();
    initializeControls();
    renderFieldRoleConfig();
    renderColumnConfig();
    render();
    markProjectDirty();
  });
  els.resetFieldRolesButton.addEventListener("click", () => {
    state.fieldRoleOverrides = {};
    saveFieldRoleOverrides();
    state.selectedGroup = null;
    buildSchema();
    initializeControls();
    renderFieldRoleConfig();
    renderColumnConfig();
    render();
    markProjectDirty();
  });
  els.primaryDimension.addEventListener("change", () => { state.primaryDimension = els.primaryDimension.value; state.selectedGroup = null; render(); markProjectDirty(); });
  els.secondaryDimension.addEventListener("change", () => { state.secondaryDimension = els.secondaryDimension.value; state.selectedGroup = null; render(); markProjectDirty(); });
  els.metricSelect.addEventListener("change", () => { state.metric = els.metricSelect.value; render(); markProjectDirty(); });
  els.yAxisMode.addEventListener("change", () => { state.yAxisMode = els.yAxisMode.value; renderChart(groupedRows(filteredRows())); markProjectDirty(); });
  els.showErrorBars.addEventListener("change", () => { state.showErrorBars = els.showErrorBars.checked; renderChart(groupedRows(filteredRows())); markProjectDirty(); });
  els.pressureWorstSelect.addEventListener("change", () => {
    state.pressureWorst = els.pressureWorstSelect.value === "high" ? "high" : "low";
    renderDetails(filteredRows(), groupedRows(filteredRows()));
    renderPressureMechanism();
    markProjectDirty();
  });
  els.pressureDeviceFilter.addEventListener("change", () => {
    state.pressureDeviceFilter = els.pressureDeviceFilter.value;
    renderPressureMechanism();
  });
  els.pressureEarFilter.addEventListener("change", () => {
    state.pressureEarFilter = els.pressureEarFilter.value;
    renderPressureMechanism();
  });
  els.pressureGroupField.addEventListener("change", () => {
    state.pressureGroupField = els.pressureGroupField.value;
    state.pressureGroupValue = "";
    renderPressureMechanism();
  });
  els.pressureGroupValue.addEventListener("change", () => {
    state.pressureGroupValue = els.pressureGroupValue.value;
    renderPressureMechanism();
  });
  els.pressureAggregation.addEventListener("change", () => {
    state.pressureAggregation = els.pressureAggregation.value;
    renderPressureMechanism();
  });
  els.clearGroupButton.addEventListener("click", () => { state.selectedGroup = null; render(); });
  els.detailSearch.addEventListener("input", () => { state.search = els.detailSearch.value; render(); });
  els.detailHead.addEventListener("change", event => {
    if (!event.target.classList.contains("header-filter")) return;
    state.columnFilters[event.target.dataset.field] = event.target.value;
    state.selectedGroup = null;
    render();
  });
  els.clearColumnFilters.addEventListener("click", () => {
    state.columnFilters = {};
    state.selectedGroup = null;
    render();
  });
  els.globalViewSelect.addEventListener("change", () => {
    state.globalView = els.globalViewSelect.value;
    renderDetails(filteredRows(), groupedRows(filteredRows()));
    markProjectDirty();
  });
  els.resetViewsButton.addEventListener("click", () => {
    state.globalView = photoViewOptions()[0]?.value || "";
    state.userViews = {};
    renderViewControls();
    renderDetails(filteredRows(), groupedRows(filteredRows()));
    markProjectDirty();
  });
  els.detailBody.addEventListener("change", event => {
    if (!event.target.classList.contains("user-view-select")) return;
    const user = event.target.dataset.user;
    if (event.target.value) state.userViews[user] = event.target.value;
    else delete state.userViews[user];
    renderDetails(filteredRows(), groupedRows(filteredRows()));
    markProjectDirty();
  });
  els.fontSizeControl.addEventListener("input", () => {
    state.layout.fontSize = Number(els.fontSizeControl.value);
    applyLayoutVariables(); saveLayout(); markProjectDirty();
  });
  els.photoSizeControl.addEventListener("input", () => {
    state.layout.photoSize = Number(els.photoSizeControl.value);
    applyLayoutVariables(); saveLayout(); markProjectDirty();
  });
  els.exportConfigButton.addEventListener("click", exportDashboardConfig);
  els.importConfigInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyDashboardConfig(JSON.parse(reader.result));
      } catch (error) {
        alert(`配置导入失败：${error.message}`);
      } finally {
        els.importConfigInput.value = "";
      }
    };
    reader.readAsText(file, "UTF-8");
  });
  els.columnConfigList.addEventListener("change", event => {
    const row = event.target.closest(".column-config-row");
    if (!row) return;
    const column = state.layout.columns.find(item => item.id === row.dataset.columnId);
    if (event.target.classList.contains("column-visible")) column.visible = event.target.checked;
    saveLayout(); render(); markProjectDirty();
  });
  els.columnConfigList.addEventListener("input", event => {
    if (!event.target.classList.contains("column-width")) return;
    const row = event.target.closest(".column-config-row");
    const column = state.layout.columns.find(item => item.id === row.dataset.columnId);
    column.width = Math.max(60, Math.min(500, Number(event.target.value) || column.width));
    saveLayout(); render(); markProjectDirty();
  });
  els.columnConfigList.addEventListener("dragstart", event => {
    const row = event.target.closest(".column-config-row");
    if (!row) return;
    draggedColumnId = row.dataset.columnId;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedColumnId);
  });
  els.columnConfigList.addEventListener("dragover", event => {
    if (!draggedColumnId) return;
    event.preventDefault();
    updateColumnDragAutoScroll(event.clientY);
    const row = event.target.closest(".column-config-row");
    if (!row || row.dataset.columnId === draggedColumnId) return;
    const rect = row.getBoundingClientRect();
    const placeAfter = event.clientY > rect.top + rect.height / 2;
    row.classList.toggle("drop-before", !placeAfter);
    row.classList.toggle("drop-after", placeAfter);
  });
  els.columnConfigList.addEventListener("dragleave", event => {
    const row = event.target.closest(".column-config-row");
    if (!row || row.contains(event.relatedTarget)) return;
    row.classList.remove("drop-before", "drop-after");
  });
  els.columnConfigList.addEventListener("drop", event => {
    const row = event.target.closest(".column-config-row");
    if (!row || !draggedColumnId) return;
    event.preventDefault();
    stopColumnDragAutoScroll();
    const rect = row.getBoundingClientRect();
    const placeAfter = event.clientY > rect.top + rect.height / 2;
    if (moveColumn(draggedColumnId, row.dataset.columnId, placeAfter)) {
      saveLayout(); renderColumnConfig(); render(); markProjectDirty();
    }
  });
  els.columnConfigList.addEventListener("dragend", () => {
    draggedColumnId = "";
    stopColumnDragAutoScroll();
    els.columnConfigList.querySelectorAll(".column-config-row").forEach(row =>
      row.classList.remove("dragging", "drop-before", "drop-after")
    );
  });
  els.resetLayoutButton.addEventListener("click", () => {
    state.layout = defaultLayout();
    buildSchema();
    saveLayout(); applyLayoutVariables(); renderColumnConfig(); render(); markProjectDirty();
  });
  els.resetButton.addEventListener("click", () => {
    state.primaryDimension = "device_name"; state.secondaryDimension = "concha_size"; state.metric = "comfort_score";
    state.yAxisMode = "adaptive";
    state.showErrorBars = true;
    state.pressureWorst = "low";
    state.selectedGroup = null; state.search = ""; state.columnFilters = {}; els.detailSearch.value = "";
    buildSchema();
    initializeControls(); renderFieldRoleConfig(); render();
    markProjectDirty();
  });
}

async function start() {
  const response = await fetch(DEFAULT_CSV);
  state.rows = parseCSV(await response.text());
  state.mappingRows = state.rows.map(row => ({ ...row }));
  initializeMappingFields();
  buildSchema();
  initializeControls();
  applyLayoutVariables();
  renderFieldRoleConfig();
  renderColumnConfig();
  bindEvents();
  renderPhotoSourceMode();
  renderProtocolStatus();
  render();
  if (state.serverProjectId) {
    els.projectPathInput.value = state.serverProjectId;
    els.projectPathInput.readOnly = true;
    setProjectStatus(`正在加载服务器项目：${state.serverProjectId}`);
    try {
      await loadServerProject();
    } catch (error) {
      setProjectStatus(`服务器项目自动加载失败：${error.message}`);
    }
    return;
  }
  setProjectPath(defaultProjectPath());
  setProjectStatus(`默认项目路径：${state.projectPath}`);
  const projectFromUrl = new URL(window.location.href).searchParams.get("project");
  if (projectFromUrl) {
    els.projectPathInput.value = projectFromUrl;
    try {
      await loadProject(projectFromUrl);
    } catch (error) {
      setProjectStatus(`自动加载失败：${error.message}`);
    }
  } else if (window.location.protocol === "file:") {
    setProjectStatus("当前是 file:// 打开；保存项目和扫描照片需要通过启动器打开看板。");
  }
}

start().catch(error => {
  console.error(error);
  document.body.innerHTML = `<div class="empty-state">无法读取示例 CSV。请使用项目启动器打开页面。</div>`;
});
