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
  tragus_pressure_score: "耳屏挤压",
  antitragus_pressure_score: "对耳屏挤压",
  helix_pressure_score: "耳轮挤压",
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
  mappingViews: [],
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
  projectDirty: false
};

const els = Object.fromEntries([
  "resetButton", "dataSourceLabel", "primaryDimension", "secondaryDimension",
  "metricSelect", "yAxisMode", "showErrorBars", "clearGroupButton", "kpiGrid", "pivotHead", "pivotBody",
  "pivotHint", "barChart", "chartTitle", "detailTitle", "detailDescription",
  "dataQualitySummary", "dataQualityList", "groupStats", "detailSearch", "detailCount", "detailBody", "detailHead",
  "detailColgroup", "fontSizeControl", "fontSizeValue", "photoSizeControl",
  "photoSizeValue", "resetLayoutButton", "exportConfigButton", "importConfigInput", "columnConfigList", "clearColumnFilters",
  "mappingPage", "dashboardPage", "mappingCsvInput", "photoRootInput", "photoRootInputWrap", "photoFolderInput", "photoFolderInputWrap",
  "mappingMode", "mappingUserField", "mappingEarField", "mappingEarFieldWrap", "mappingDeviceField", "viewNamesInput", "viewNamesInputWrap", "runMappingButton",
  "applyMappingButton", "downloadMappedCsvButton", "mappingSummary", "mappingPreview",
  "globalViewControl", "globalViewSelect", "resetViewsButton", "fieldRoleList", "resetFieldRolesButton",
  "projectPathInput", "loadProjectButton", "saveProjectConfigButton", "saveProjectButton", "projectStatus"
].map(id => [id, document.getElementById(id)]));

function saveLayout() {
  localStorage.setItem(storageKey("headphoneDashboardLayout"), JSON.stringify(state.layout));
}

function saveFieldRoleOverrides() {
  localStorage.setItem(storageKey("headphoneDashboardFieldRoles"), JSON.stringify(state.fieldRoleOverrides));
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
    showErrorBars: state.showErrorBars
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
  els.photoRootInput.value = project.photoRoot;
  els.mappingMode.value = project.mappingMode;
  renderMappingMode();
  if (project.mappingViews.length) els.viewNamesInput.value = project.mappingViews.join(",");
  buildSchema();
  applyDashboardConfig(project.dashboardConfig);
  initializeMappingFields();
  if (project.mappingFields.userField && [...els.mappingUserField.options].some(option => option.value === project.mappingFields.userField)) els.mappingUserField.value = project.mappingFields.userField;
  if (project.mappingFields.earField && [...els.mappingEarField.options].some(option => option.value === project.mappingFields.earField)) els.mappingEarField.value = project.mappingFields.earField;
  if (project.mappingFields.deviceField && [...els.mappingDeviceField.options].some(option => option.value === project.mappingFields.deviceField)) els.mappingDeviceField.value = project.mappingFields.deviceField;
  if (project.photoRoot) {
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
  els.photoRootInput.value = project.photoRoot;
  els.mappingMode.value = project.mappingMode;
  renderMappingMode();
  if (project.mappingViews.length) els.viewNamesInput.value = project.mappingViews.join(",");
  buildSchema();
  applyDashboardConfig(project.dashboardConfig);
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
  els.columnConfigList.innerHTML = state.layout.columns.map((column, index) => `
    <div class="column-config-row" data-column-id="${column.id}">
      <input class="column-visible" type="checkbox" aria-label="显示${column.label}" ${column.visible ? "checked" : ""}>
      <label>${column.label}${column.userLevel ? " · 用户级" : ""}</label>
      <input class="column-width" type="number" min="60" max="500" step="10" value="${column.width}" aria-label="${column.label}列宽">
      <button class="column-up" type="button" aria-label="${column.label}上移" ${index === 0 ? "disabled" : ""}>↑</button>
      <button class="column-down" type="button" aria-label="${column.label}下移" ${index === state.layout.columns.length - 1 ? "disabled" : ""}>↓</button>
    </div>
  `).join("");
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
    pressure: "挤压分数",
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
    label: "挤压",
    width: 190,
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

function scoreClass(value) {
  return Number(value) >= 8 ? "high" : Number(value) <= 5 ? "low" : "";
}

function pressureClass(value) {
  return Number(value) >= 5 ? "hot" : "";
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
      return score === "" ? "" : `<span class="pressure-tag ${pressureClass(score)}">${fieldLabels[item] || item}：${score}</span>`;
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
    return `<td class="${classes}"><span class="pressure ${pressureClass(value)}">${value || "—"}</span></td>`;
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
    return `
    <figure class="photo-thumb">
      <img class="ear-photo" src="${photoUrl(row[selectedView.field])}" alt="${row[state.userIdField]} ${caption}" loading="lazy">
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
  visibleColumns.forEach(column => {
    if (column.photo) column.width = Math.max(column.width, maxPhotos * 78);
  });
  const totalWeight = visibleColumns.reduce((sum, column) => sum + column.width, 0);
  els.detailColgroup.innerHTML = visibleColumns.map(column => `<col style="width:${column.width / totalWeight * 100}%">`).join("");
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
}

function switchPage(page) {
  document.querySelectorAll(".app-page").forEach(element => element.classList.toggle("active", element.id === `${page}Page`));
  document.querySelectorAll(".page-tab").forEach(button => button.classList.toggle("active", button.dataset.page === page));
}

function mappingViews() {
  return els.viewNamesInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
}

function initializeMappingFields() {
  const headers = Object.keys(state.mappingRows[0] || {});
  fillSelect(els.mappingUserField, headers, false, fieldLabels);
  fillSelect(els.mappingEarField, headers, false, fieldLabels);
  fillSelect(els.mappingDeviceField, headers, false, fieldLabels);
  els.mappingUserField.value = headers.find(field => /^(name|姓名|user_name|用户姓名)$/i.test(field)) ||
    headers.find(field => /^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) || headers[0] || "";
  els.mappingEarField.value = headers.find(field => /ear_side|左右耳|耳侧|left_right|side/i.test(field)) || headers[0] || "";
  els.mappingDeviceField.value = headers.find(field => /^device_name$/i.test(field)) ||
    headers.find(field => /prototype|sample|样机|device_name|device_id|condition|设备|条件/i.test(field)) || headers[1] || "";
  renderMappingMode();
}

function renderMappingMode() {
  const folderMode = els.mappingMode.value === "folders";
  els.mappingEarFieldWrap.hidden = false;
  els.viewNamesInputWrap.hidden = folderMode;
  els.viewNamesInput.placeholder = folderMode ? "例如：正面,侧面,后侧" : "例如：左耳正面,左耳侧面,右耳正面,右耳侧面";
}

function renderPhotoSourceMode() {
  const serverMode = Boolean(state.serverProjectId);
  els.photoRootInputWrap.hidden = serverMode;
  els.photoFolderInputWrap.hidden = !serverMode;
}

async function scanPhotoRoot() {
  if (state.serverProjectId) return uploadServerPhotoFiles();
  const root = els.photoRootInput.value.trim();
  if (!root) throw new Error("请填写照片根文件夹路径。");
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
  const views = mode === "folders" ? Core.inferFolderViews(state.mappingRows, state.mappingFiles, {
    userField,
    earField,
    deviceField
  }) : mappingViews();
  if (!state.mappingRows.length) throw new Error("请先选择 CSV。");
  if (!views.length) throw new Error(mode === "folders" ? "没有从照片目录中识别到方向/视角文件夹。" : "请至少填写一个视角名称。");
  if (!userField || !deviceField) throw new Error("请选择用户字段和设备字段。");
  if (mode === "folders" && !earField) throw new Error("子文件夹逻辑需要选择左右耳字段。");
  if (mode === "folders") els.viewNamesInput.value = views.join(",");

  const { mapped, reviews, photoFields } = Core.mapPhotosToRows(state.mappingRows, state.mappingFiles, {
    mode,
    userField,
    earField,
    deviceField,
    views,
    overrides: state.photoMappingOverrides
  });
  state.mappedRows = mapped;
  state.mappingViews = views;
  const photoViews = Core.viewDescriptors(state.mappingRows, {
    mode,
    earField,
    views,
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
}

function photoSelectOptions(files, selectedPath) {
  const selectedKnown = files.some(file => file.absolute_path === selectedPath);
  return `<option value="">缺失/不使用</option>` +
    (!selectedKnown && selectedPath ? `<option value="${selectedPath}" selected>当前手动路径</option>` : "") +
    files.map(file => `<option value="${file.absolute_path}" ${file.absolute_path === selectedPath ? "selected" : ""}>${file.name}</option>`).join("");
}

function renderMappingPreview(reviews, userField, deviceField, photoFields) {
  const ok = reviews.filter(review => review.status === "ok").length;
  const issues = reviews.length - ok;
  const selectFiles = els.mappingMode.value === "folders" ? state.mappingFiles : null;
  els.mappingSummary.innerHTML = `<strong>${reviews.length}</strong> 位用户 · <strong>${ok}</strong> 正常 · <strong>${issues}</strong> 异常`;
  els.mappingPreview.innerHTML = reviews.map(review => `
    <article class="mapping-user ${review.status}">
      <div class="mapping-user-heading">
        <strong>${review.user}</strong>
        <span>预期 ${review.expected} 张 / 实际 ${review.files.length} 张</span>
        <b>${review.status === "ok" ? "映射正常" : review.status === "missing" ? "照片不足" : "照片过多"}</b>
      </div>
      <div class="mapping-device-list">${review.entries.map(entry => `
        <div class="mapping-device-row">
          <strong>${entry.row[deviceField]}</strong>
          ${photoFields.map(field => {
            const path = state.mappedRows[entry.rowIndex][field];
            return `<figure>
              ${path ? `<img src="${photoUrl(path)}" alt="${state.viewLabels[field]}">` : `<div class="missing-photo">缺失</div>`}
              <figcaption>${state.viewLabels[field]}</figcaption>
              <select class="mapping-photo-select" data-row-index="${entry.rowIndex}" data-field="${field}">
                ${photoSelectOptions(selectFiles || review.files, path)}
              </select>
            </figure>`;
          }).join("")}
        </div>
      `).join("")}</div>
    </article>
  `).join("");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
  els.mappingCsvInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.mappingRows = parseCSV(reader.result);
      state.photoMappingOverrides = {};
      initializeMappingFields();
      els.mappingSummary.textContent = `${file.name} · ${state.mappingRows.length} 条记录`;
      markProjectDirty();
    };
    reader.readAsText(file, "UTF-8");
  });
  els.photoFolderInput.addEventListener("change", () => {
    const count = [...(els.photoFolderInput.files || [])].filter(file => Core.isImagePath(file.name)).length;
    els.mappingSummary.textContent = count ? `已选择 ${count} 张照片，点击“生成照片映射”上传并映射。` : "未选择可用图片。";
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
  els.mappingMode.addEventListener("change", () => {
    state.photoMappingOverrides = {};
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
  els.columnConfigList.addEventListener("click", event => {
    const row = event.target.closest(".column-config-row");
    if (!row || !event.target.matches("button")) return;
    const index = state.layout.columns.findIndex(item => item.id === row.dataset.columnId);
    const targetIndex = event.target.classList.contains("column-up") ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= state.layout.columns.length) return;
    [state.layout.columns[index], state.layout.columns[targetIndex]] = [state.layout.columns[targetIndex], state.layout.columns[index]];
    saveLayout(); renderColumnConfig(); render(); markProjectDirty();
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
    setProjectStatus("当前是 file:// 打开；保存/加载项目需要通过 python3 server.py 访问。");
  }
}

start().catch(error => {
  console.error(error);
  document.body.innerHTML = `<div class="empty-state">无法读取示例 CSV。请从本目录启动本地服务器后访问页面。</div>`;
});
