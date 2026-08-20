const DEFAULT_CSV = "headphone_sample.csv";
const Core = globalThis.DashboardCore;
const initialParams = new URL(window.location.href).searchParams;
const initialServerProjectId = initialParams.get("projectId") || "";
const PHOTO_EAR_MODE_VALUE = "__photo_ear__";
const USER_NOTE_FIELD = "user_note";

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
  auricle_front_pressure_score: "耳廓前侧",
  auricle_upper_pressure_score: "耳廓上侧",
  postauricular_middle_pressure_score: "耳后中侧",
  lobe_rear_pressure_score: "耳垂后侧",
  auricle_outer_pressure_score: "耳廓外侧",
  original_sound_score: "原声评分",
  comments: "备注",
  photo_path: "照片"
};

function defaultLayout() {
  return {
    fontSize: 12,
    photoSize: 120,
    photoPositionX: 50,
    photoPositionY: 50,
    photoZoom: 100,
    detailPhotoMode: "performance",
    version: 5,
    schema: "",
    columns: []
  };
}

function sanitizeDetailPhotoMode(mode) {
  return mode === "capture" ? "capture" : "performance";
}

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey("headphoneDashboardLayout")) ||
      (!initialServerProjectId ? localStorage.getItem("headphoneDashboardLayout") : "null"));
    if (!saved?.columns?.length) return defaultLayout();
    return {
      fontSize: Number(saved.fontSize) || 12,
      photoSize: Number(saved.photoSize) || 120,
      photoPositionX: Number.isFinite(Number(saved.photoPositionX)) ? Number(saved.photoPositionX) : 50,
      photoPositionY: Number.isFinite(Number(saved.photoPositionY)) ? Number(saved.photoPositionY) : 50,
      photoZoom: Number.isFinite(Number(saved.photoZoom)) ? Number(saved.photoZoom) : 100,
      detailPhotoMode: sanitizeDetailPhotoMode(saved.detailPhotoMode),
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
  sourceCsvFile: null,
  sourceCsvName: "",
  sourceCsvText: "",
  detailPhotoObserver: null,
  mappingThumbnailObserver: null,
  mappingObjectUrls: [],
  thumbnailUrls: {},
  thumbnailPromises: {},
  photoUrlByPath: {},
  photoRelativeByUrl: {},
  detailPreviewUrls: {},
  detailPreviewPromises: {},
  mappingViews: [],
  includeBareEarPhotos: false,
  bareEarConfig: { splitByEar: false, genericCount: 1, leftCount: 1, rightCount: 1 },
  singleEarMode: false,
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
  userPhotoPositions: {},
  userFilter: null,
  deviceOrderMode: "source",
  userOrder: [],
  userNotes: {},
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
  projectFolderHandle: null,
  projectFolderLabel: "",
  serverProjectId: initialServerProjectId,
  projectRevision: null,
  projectTitle: "",
  projectDirty: false,
  projectTabs: [],
  activeProjectTabId: "",
  protocolTemplate: null,
  protocolValidation: null,
  pressureDeviceFilter: "",
  pressureEarFilter: "",
  pressureGroupField: "",
  pressureGroupValue: "",
  pressureAggregation: "mean",
  comparisonMetric: "",
  comparisonAutoDevices: true,
  comparisonDeviceA: "",
  comparisonDeviceB: "",
  comparisonThreshold: 1,
  comparisonGroupLayouts: {},
  photoCompareVariable: "",
  photoCompareLevelA: "",
  photoCompareLevelB: "",
  photoCompareView: "",
  photoComparePhotoSize: 150,
  photoComparePositionX: 50,
  photoComparePositionY: 50,
  photoCompareZoom: 100,
  photoComparePanelSettings: {},
  analysisMode: "single",
  multiProjectA: "",
  multiProjectB: "",
  multiUserField: "",
  multiFlowMetricA: "",
  multiFlowMetricB: "",
  multiFlowThreshold: 1,
  multiFlowMappings: [],
  multiFlowSelectedKey: ""
};

let draggedColumnId = "";
let draggedDetailUser = "";
let draggedProjectTabId = "";
let activeColumnConfigList = null;
let draggedMappingPhoto = null;
let mappingDragTargetElement = null;
let mappingDragImage = null;
let columnDragScrollFrame = 0;
const columnDragScroll = { list: 0, page: 0 };
let photoLightboxReturnFocus = null;
const PROJECT_FOLDER_DB = "hp-project-folder";
const PROJECT_FOLDER_STORE = "handles";
const PROJECT_FOLDER_KEY = "last-project-root";

const els = Object.fromEntries([
  "resetButton", "singleModeTab", "multiModeTab", "singlePageNav", "multiPageNav",
  "dataSourceLabel", "primaryDimension", "secondaryDimension",
  "metricSelect", "yAxisMode", "showErrorBars", "clearGroupButton", "kpiGrid", "pivotHead", "pivotBody",
  "pivotHint", "barChart", "chartTitle", "detailTitle", "detailDescription",
  "dataQualitySummary", "dataQualityList", "groupStats", "detailSearch", "detailCount", "detailBody", "detailHead",
  "detailColgroup", "fontSizeControl", "fontSizeValue", "photoSizeControl",
  "photoSizeValue", "photoZoomControl", "photoZoomValue", "photoPositionXControl", "photoPositionXValue", "photoPositionYControl", "photoPositionYValue",
  "globalCenterValue",
  "detailPhotoModeControl", "detailPhotoModeValue",
  "resetLayoutButton", "exportConfigButton", "importConfigInput", "columnConfigList", "clearColumnFilters",
  "resetPhotoPositionsButton",
  "mappingPage", "dashboardPage", "mappingCsvInput", "mappingCsvStatus", "photoRootInput", "photoRootInputWrap", "photoFolderChooser", "photoFolderStatus", "photoFolderInput", "photoFolderInputWrap",
  "mappingMode", "mappingUserField", "mappingEarField", "mappingEarFieldWrap", "mappingDeviceField", "viewNamesInput", "viewNamesInputWrap",
  "bareEarToggleWrap", "includeBareEarPhotos", "bareEarConfigPanel", "bareEarSplitByEar", "bareEarGenericCountWrap",
  "bareEarGenericCount", "bareEarSideCounts", "bareEarLeftCount", "bareEarRightCount", "singleEarToggleWrap", "singleEarMode", "runMappingButton",
  "mappingModeNote", "applyMappingButton", "downloadPhotoAuditButton", "mappingSummary", "mappingPreview",
  "globalViewControl", "globalViewSelect", "resetViewsButton", "fieldRoleList", "resetFieldRolesButton",
  "projectPathInput", "projectNameStatus", "chooseProjectFolderButton", "projectFolderStatus", "exportProjectCsvButton",
  "loadProjectButton", "saveProjectConfigButton", "saveProjectButton", "projectStatus",
  "projectRecoveryActions", "useSampleProjectButton", "clearProjectPathButton", "projectTabs", "newProjectTabButton",
  "pressureWorstSelect", "protocolTemplateInput", "clearProtocolButton", "protocolStatus",
  "pressurePage", "pressureRadar", "pressureDeviceFilter", "pressureEarFilter", "pressureGroupField", "pressureGroupValue",
  "pressureAggregation", "pressureSummary", "pressureHeatmaps", "pressureRanking",
  "comparisonPage", "comparisonMetricSelect", "comparisonAutoDevices", "comparisonDeviceA", "comparisonDeviceB",
  "comparisonThreshold", "comparisonTitle", "comparisonSummary", "comparisonDeviceRanking", "comparisonGroupCards", "comparisonDetails",
  "comparisonGlobalFontSize", "comparisonGlobalPhotoSize", "comparisonGlobalColumns", "comparisonApplyAllTables",
  "photoComparePage", "photoCompareVariable", "photoCompareLevelA", "photoCompareLevelB", "photoCompareView",
  "photoComparePhotoSize", "photoComparePhotoSizeValue", "photoComparePositionX", "photoComparePositionXValue",
  "photoComparePositionY", "photoComparePositionYValue", "photoCompareZoom", "photoCompareZoomValue",
  "photoCompareSummary", "photoCompareTitle", "photoCompareGrid",
  "multiComparePage", "multiCompareProjectA", "multiCompareProjectB", "multiCompareUserField", "multiCompareRefresh",
  "multiCompareSummary", "multiMatchedDetails", "multiOnlyA", "multiOnlyB",
  "multiFlowPage", "multiFlowProjectA", "multiFlowProjectB", "multiFlowMetricA", "multiFlowMetricB",
  "multiFlowThreshold", "multiFlowDeviceMappings", "multiFlowAddMapping", "multiFlowRefresh", "multiFlowSummary", "multiFlowChart", "multiFlowTable", "multiFlowDetails", "multiFlowClearSelection",
  "photoLightbox", "photoLightboxImage", "photoLightboxCaption", "photoLightboxClose"
].map(id => [id, document.getElementById(id)]));

const comparisonTableColumns = [
  { id: "user", label: "用户", width: 80 },
  { id: "verdict", label: "胜负", width: 95 },
  { id: "device", label: "设备", width: 110 },
  { id: "score", label: "指标分数", width: 90 },
  { id: "diff", label: "A-B", width: 70 },
  { id: "profile", label: "组间变量", width: 220 },
  { id: "pressure", label: "挤压摘要", width: 210 },
  { id: "photos", label: "照片", width: 180 },
  { id: "note", label: "备注", width: 130 }
];

const comparisonVerdictColumn = {
  id: "__comparison_verdict",
  label: "胜负",
  width: 95,
  userLevel: true,
  custom: true
};

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

function boundedCount(value, fallback = 1) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(12, number));
}

function sanitizeBareEarConfig(config = {}) {
  return {
    splitByEar: Boolean(config.splitByEar),
    genericCount: Math.max(1, boundedCount(config.genericCount, 1)),
    leftCount: boundedCount(config.leftCount, 1),
    rightCount: boundedCount(config.rightCount, 1),
    labels: config.labels && typeof config.labels === "object" ? { ...config.labels } : {}
  };
}

function bareEarConfigFromControls() {
  const current = sanitizeBareEarConfig(state.bareEarConfig);
  return sanitizeBareEarConfig({
    splitByEar: els.bareEarSplitByEar.checked,
    genericCount: els.bareEarGenericCount.value,
    leftCount: els.bareEarLeftCount.value,
    rightCount: els.bareEarRightCount.value,
    labels: current.labels
  });
}

function applyBareEarConfigToControls() {
  const config = sanitizeBareEarConfig(state.bareEarConfig);
  state.bareEarConfig = config;
  els.bareEarSplitByEar.checked = config.splitByEar;
  els.bareEarGenericCount.value = config.genericCount;
  els.bareEarLeftCount.value = config.leftCount;
  els.bareEarRightCount.value = config.rightCount;
}

function renderBareEarConfigControls() {
  const folderMode = els.mappingMode.value === "folders";
  const showPanel = !folderMode && state.includeBareEarPhotos;
  els.bareEarConfigPanel.hidden = !showPanel;
  els.bareEarGenericCountWrap.hidden = state.bareEarConfig.splitByEar;
  els.bareEarSideCounts.hidden = !state.bareEarConfig.splitByEar;
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
    `<strong>${escapeHtml(state.protocolTemplate.name || "未命名模板")}</strong>`,
    validation ? `CSV：${validation.valid ? "通过" : "有警告"}，${validation.rowCount} 行` : "CSV：等待导入",
    views.length ? `照片视角：${views.map(escapeHtml).join("、")}` : "照片视角：未限定",
    ears.length ? `耳侧：${ears.map(escapeHtml).join("、")}` : "耳侧：按数据/文件夹识别"
  ];
  const issues = [];
  if (validation?.missingRequiredFields?.length) issues.push(`缺少必填字段：${validation.missingRequiredFields.map(escapeHtml).join("、")}`);
  if (validation?.missingRecommendedFields?.length) issues.push(`缺少建议字段：${validation.missingRecommendedFields.map(escapeHtml).join("、")}`);
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
    pressureWorst: state.pressureWorst,
    comparisonMetric: state.comparisonMetric,
    comparisonAutoDevices: state.comparisonAutoDevices,
    comparisonDeviceA: state.comparisonDeviceA,
    comparisonDeviceB: state.comparisonDeviceB,
    comparisonThreshold: state.comparisonThreshold,
    comparisonGroupLayouts: state.comparisonGroupLayouts,
    photoCompareVariable: state.photoCompareVariable,
    photoCompareLevelA: state.photoCompareLevelA,
    photoCompareLevelB: state.photoCompareLevelB,
    photoCompareView: state.photoCompareView,
    photoComparePhotoSize: state.photoComparePhotoSize,
    photoComparePositionX: state.photoComparePositionX,
    photoComparePositionY: state.photoComparePositionY,
    photoCompareZoom: state.photoCompareZoom,
    photoComparePanelSettings: state.photoComparePanelSettings,
    userPhotoPositions: state.userPhotoPositions,
    userFilter: state.userFilter,
    deviceOrderMode: state.deviceOrderMode,
    userOrder: state.userOrder,
    userNotes: state.userNotes,
    analysisMode: state.analysisMode,
    multiProjectA: state.multiProjectA,
    multiProjectB: state.multiProjectB,
    multiUserField: state.multiUserField,
    multiFlowMetricA: state.multiFlowMetricA,
    multiFlowMetricB: state.multiFlowMetricB,
    multiFlowThreshold: state.multiFlowThreshold,
    multiFlowMappings: state.multiFlowMappings,
    multiFlowSelectedKey: state.multiFlowSelectedKey
  };
}

function normalizePhotoValueForSave(value) {
  const text = String(value || "");
  if (!text) return "";
  if (state.photoRelativeByUrl[text]) return state.photoRelativeByUrl[text];
  if (state.photoUrlByPath[text] && !isRuntimePhotoUrl(text)) return normalizePathSlashes(text);
  try {
    const url = new URL(text, window.location.href);
    const apiPath = url.pathname === "/api/photo" ? url.searchParams.get("path") || "" : "";
    const serverPhotoPath = url.pathname.includes("/photos") ? url.searchParams.get("path") || "" : "";
    if (serverPhotoPath) return normalizePathSlashes(serverPhotoPath);
    if (apiPath) {
      const root = els.photoRootInput?.value?.trim?.() || "";
      const normalizedApiPath = normalizePathSlashes(apiPath);
      const normalizedRoot = normalizePathSlashes(root).replace(/\/+$/, "");
      if (normalizedRoot && normalizedApiPath.startsWith(`${normalizedRoot}/`)) {
        return normalizedApiPath.slice(normalizedRoot.length + 1);
      }
    }
  } catch {
    // Plain relative or platform path; handled below.
  }
  const root = els.photoRootInput?.value?.trim?.() || "";
  const normalized = normalizePathSlashes(text);
  const normalizedRoot = normalizePathSlashes(root).replace(/\/+$/, "");
  if (normalizedRoot && normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized.slice(normalizedRoot.length + 1);
  }
  if (isRuntimePhotoUrl(text)) {
    throw new Error("项目中仍有临时照片 URL。请重新选择照片根文件夹并重新映射后再保存。");
  }
  return normalized;
}

function photoValueForDisplay(value) {
  return state.photoRelativeByUrl[value] || normalizePathSlashes(value);
}

function normalizeRowsForSave(rows = []) {
  const photoFields = new Set(state.photoFields);
  Object.keys(state.viewLabels || {}).forEach(field => photoFields.add(field));
  state.mappingPhotoFields.forEach(field => photoFields.add(field));
  return rows.map(row => {
    const next = { ...row };
    photoFields.forEach(field => {
      if (field in next) next[field] = normalizePhotoValueForSave(next[field]);
    });
    return next;
  });
}

function normalizeOverridesForSave(overrides = {}) {
  return Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, normalizePhotoValueForSave(value)]));
}

function projectDocumentSnapshot() {
  applyUserNotesToRows(state.rows);
  applyUserNotesToRows(state.mappedRows);
  return Core.buildProjectDocument({
    title: state.projectTitle || projectTabTitle(state.projectPath || els.projectPathInput.value),
    rows: normalizeRowsForSave(state.rows),
    mappingRows: normalizeRowsForSave(state.mappingRows),
    sourceCsv: state.sourceCsvName ? joinPath("data", state.sourceCsvName) : "",
    photoRoot: els.photoRootInput.value.trim() || "photos",
    mappingMode: els.mappingMode.value,
    mappingFields: {
      userField: els.mappingUserField.value,
      earField: els.mappingEarField.value,
      deviceField: els.mappingDeviceField.value,
      includeBareEarPhotos: state.includeBareEarPhotos,
      bareEarConfig: state.bareEarConfig,
      singleEarMode: state.singleEarMode
    },
    mappingViews: mappingViews(),
    photoMappingOverrides: normalizeOverridesForSave(state.photoMappingOverrides),
    protocolTemplate: state.protocolTemplate,
    dashboardConfig: dashboardConfigSnapshot()
  });
}

function mappingConfigSnapshot() {
  return {
    photoRoot: els.photoRootInput.value.trim() || "photos",
    mappingMode: els.mappingMode.value,
    mappingFields: {
      userField: els.mappingUserField.value,
      earField: els.mappingEarField.value,
      deviceField: els.mappingDeviceField.value,
      includeBareEarPhotos: state.includeBareEarPhotos,
      bareEarConfig: state.bareEarConfig,
      singleEarMode: state.singleEarMode
    },
    mappingViews: mappingViews()
  };
}

function setProjectPath(path) {
  const previousPath = state.projectPath;
  state.projectPath = path || "";
  els.projectPathInput.value = state.projectPath;
  if (state.projectPath) syncProjectFileNameFromPath(state.projectPath);
  const activeTab = state.projectTabs.find(item => item.id === state.activeProjectTabId);
  if (activeTab && state.projectPath && activeTab.id !== state.projectPath && !state.projectTabs.some(item => item.id === state.projectPath)) {
    activeTab.id = state.projectPath;
    activeTab.path = state.projectPath;
    if (!activeTab.customTitle && (!activeTab.title || activeTab.title === projectTabTitle(previousPath))) activeTab.title = projectTabTitle(state.projectPath);
    state.activeProjectTabId = activeTab.id;
    renderProjectTabs();
  }
  if (state.serverProjectId) return;
  if (!state.projectPath) return;
  if (String(state.projectPath).startsWith("browser-folder:")) {
    setProjectUrlParam("");
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("project", state.projectPath);
  history.replaceState(null, "", url);
}

function defaultProjectPath() {
  return "projects/我的耳机项目/我的耳机项目.json";
}

function sanitizeProjectName(name = "") {
  const clean = String(name || "").trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return clean || "我的耳机项目";
}

function sanitizeProjectFileName(name = "") {
  const clean = String(name || "").trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  const base = clean || "我的耳机项目.json";
  return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
}

function projectFileNameFromPath(path = "") {
  const value = String(path || "").trim();
  if (!value) return "我的耳机项目.json";
  return sanitizeProjectFileName(value.split(/[\\/]/).filter(Boolean).pop() || value);
}

function defaultProjectFolderPath() {
  return "projects";
}

function projectNameFromFileName(name = "") {
  return sanitizeProjectFileName(name).replace(/\.json$/i, "") || "我的耳机项目";
}

function activeProjectName() {
  const tab = state.projectTabs.find(item => item.id === state.activeProjectTabId);
  return sanitizeProjectName(state.projectTitle || tab?.title || projectNameFromFileName(projectFileNameFromPath(state.projectPath)) || "我的耳机项目");
}

function selectedProjectFileName() {
  return sanitizeProjectFileName(activeProjectName());
}

function projectPathFromProjectName(name = activeProjectName()) {
  const projectName = sanitizeProjectName(name);
  return joinPath(joinPath(defaultProjectFolderPath(), projectName), `${projectName}.json`);
}

function projectPathFromFileName(name = selectedProjectFileName()) {
  const projectName = projectNameFromFileName(name);
  return projectPathFromProjectName(projectName);
}

function syncProjectFileNameFromPath(path = state.projectPath) {
  if (els.projectNameStatus) els.projectNameStatus.textContent = activeProjectName() || projectNameFromFileName(projectFileNameFromPath(path));
}

function selectedProjectPath() {
  const fileName = selectedProjectFileName();
  const currentPath = String(state.projectPath || "");
  if (currentPath && !currentPath.startsWith("browser-folder:") && projectFileNameFromPath(currentPath) === fileName) return currentPath;
  return projectPathFromProjectName(activeProjectName());
}

function updateProjectFolderStatus(message = "") {
  if (!els.projectFolderStatus) return;
  if (message) {
    els.projectFolderStatus.textContent = message;
    return;
  }
  els.projectFolderStatus.textContent = state.projectFolderHandle ?
    `已选择项目根目录：${state.projectFolderLabel || state.projectFolderHandle.name || "本地文件夹"}` :
    "默认保存到看板根目录下的 projects 文件夹。项目会保存 CSV、照片、映射、布局、备注和用户排序。";
}

function openProjectFolderDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("当前浏览器不支持记住项目根目录。"));
      return;
    }
    const request = indexedDB.open(PROJECT_FOLDER_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECT_FOLDER_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("项目根目录缓存打开失败。"));
  });
}

async function saveStoredProjectFolderHandle(handle) {
  try {
    const db = await openProjectFolderDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECT_FOLDER_STORE, "readwrite");
      transaction.objectStore(PROJECT_FOLDER_STORE).put(handle, PROJECT_FOLDER_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("项目根目录缓存保存失败。"));
    });
    db.close();
  } catch {
    // 保存目录句柄只是启动体验优化；失败不影响本次加载。
  }
}

async function loadStoredProjectFolderHandle() {
  try {
    const db = await openProjectFolderDb();
    const handle = await new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECT_FOLDER_STORE, "readonly");
      const request = transaction.objectStore(PROJECT_FOLDER_STORE).get(PROJECT_FOLDER_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("项目根目录缓存读取失败。"));
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

async function hasDirectoryPermission(handle, mode = "read") {
  if (!handle?.queryPermission) return false;
  try {
    return await handle.queryPermission({ mode }) === "granted";
  } catch {
    return false;
  }
}

async function chooseProjectFolder() {
  if (!window.showDirectoryPicker) {
    updateProjectFolderStatus("当前浏览器不支持直接授权项目文件夹；将默认保存到看板根目录下的 projects 文件夹。");
    return;
  }
  const handle = await window.showDirectoryPicker({
    id: "hp-projects",
    mode: "readwrite",
    startIn: "documents"
  });
  state.projectFolderHandle = handle;
  state.projectFolderLabel = handle.name || "本地文件夹";
  await saveStoredProjectFolderHandle(handle);
  updateProjectFolderStatus();
  setProjectPath(`browser-folder:${state.projectFolderLabel}/${activeProjectName()}/${selectedProjectFileName()}`);
  await loadProjectsFromSelectedFolder();
}

async function autoLoadStoredProjectFolder() {
  if (!window.showDirectoryPicker) return false;
  const handle = await loadStoredProjectFolderHandle();
  if (!handle) return false;
  if (!await hasDirectoryPermission(handle, "read")) {
    setProjectStatus("已记住项目根目录，但浏览器尚未授权读取；请点“选择项目根目录”重新授权一次。", false);
    return false;
  }
  state.projectFolderHandle = handle;
  state.projectFolderLabel = handle.name || "已授权项目根目录";
  updateProjectFolderStatus(`已自动使用上次授权的项目根目录：${state.projectFolderLabel}`);
  return loadProjectsFromSelectedFolder();
}

async function browserDirectoryEntries(directoryHandle) {
  const entries = [];
  for await (const entry of directoryHandle.entries()) entries.push(entry);
  return entries.sort(([nameA], [nameB]) => nameA.localeCompare(nameB, "zh-CN", { numeric: true }));
}

function shouldSkipProjectDirectory(parts = []) {
  const ignored = new Set(["exports", "photos", "bare_ears"]);
  return parts.some(part => ignored.has(part) || String(part).endsWith("_assets"));
}

async function listProjectJsonFiles(directoryHandle, parts = []) {
  if (shouldSkipProjectDirectory(parts)) return [];
  const files = [];
  for (const [name, handle] of await browserDirectoryEntries(directoryHandle)) {
    const nextParts = [...parts, name];
    if (handle.kind === "directory") {
      files.push(...await listProjectJsonFiles(handle, nextParts));
    } else if (/\.json$/i.test(name)) {
      files.push({ handle, relativePath: nextParts.join("/") });
    }
  }
  return files;
}

async function browserDirectoryByParts(rootHandle, parts = []) {
  let handle = rootHandle;
  for (const part of parts.filter(Boolean)) {
    handle = await handle.getDirectoryHandle(part);
  }
  return handle;
}

async function browserPhotoFilesFromDirectory(directoryHandle, parts = []) {
  const photos = [];
  for (const [name, handle] of await browserDirectoryEntries(directoryHandle)) {
    const nextParts = [...parts, name];
    if (handle.kind === "directory") {
      photos.push(...await browserPhotoFilesFromDirectory(handle, nextParts));
    } else if (Core.isImagePath(name)) {
      const file = await handle.getFile();
      const relativePath = nextParts.join("/");
      const url = URL.createObjectURL(file);
      state.mappingObjectUrls.push(url);
      photos.push({
        name,
        relative_path: relativePath,
        absolute_path: url,
        user_folder: nextParts.length > 1 ? nextParts[0] : "",
        url,
        source: "browser_project"
      });
    }
  }
  return photos;
}

async function browserProjectPhotoFiles(projectRelativePath, project) {
  if (!state.projectFolderHandle) return [];
  const root = safeRelativeRootForProjectPhoto(project.photoRoot || "photos");
  if (!root) return [];
  const projectDirParts = projectRelativePath.split("/").filter(Boolean).slice(0, -1);
  const photoRootParts = root.split("/").filter(Boolean);
  try {
    const photoDir = await browserDirectoryByParts(state.projectFolderHandle, [...projectDirParts, ...photoRootParts]);
    return await browserPhotoFilesFromDirectory(photoDir);
  } catch {
    return [];
  }
}

async function loadProjectsFromSelectedFolder() {
  if (!state.projectFolderHandle) return false;
  const files = await listProjectJsonFiles(state.projectFolderHandle);
  if (!files.length) {
    setProjectStatus(`已选择项目根目录：${state.projectFolderLabel || state.projectFolderHandle.name || "本地文件夹"}，但没有发现项目 JSON。`);
    return false;
  }
  let loaded = 0;
  const errors = [];
  saveActiveProjectTabSnapshot();
  for (const file of files) {
    try {
      const raw = JSON.parse(await (await file.handle.getFile()).text());
      const photos = await browserProjectPhotoFiles(file.relativePath, raw);
      await applyLoadedProject(`browser-folder:${state.projectFolderLabel || state.projectFolderHandle.name || "本地文件夹"}/${file.relativePath}`, raw, {
        mappingFiles: photos,
        skipPhotoScan: true
      });
      loaded += 1;
    } catch (error) {
      errors.push(`${file.relativePath}：${error.message}`);
    }
  }
  setProjectStatus(errors.length ?
    `已从所选项目根目录加载 ${loaded} 个项目，${errors.length} 个失败。` :
    `已从所选项目根目录加载 ${loaded} 个项目。`, false);
  showProjectRecoveryActions(errors.length > 0);
  return loaded > 0;
}

function showProjectRecoveryActions(show = true) {
  if (els.projectRecoveryActions) els.projectRecoveryActions.hidden = !show;
}

function setProjectUrlParam(path = "") {
  if (state.serverProjectId || window.location.protocol === "file:") return;
  const url = new URL(window.location.href);
  if (path) url.searchParams.set("project", path);
  else url.searchParams.delete("project");
  history.replaceState(null, "", url);
}

function useSampleProject() {
  state.projectPath = "";
  state.projectDirty = false;
  state.sourceCsvFile = null;
  state.sourceCsvName = "";
  state.sourceCsvText = "";
  els.projectPathInput.value = "";
  syncProjectFileNameFromPath(defaultProjectPath());
  if (els.mappingCsvStatus) els.mappingCsvStatus.textContent = "尚未选择 CSV。保存项目时会把当前 CSV 复制到项目 data 文件夹。";
  els.dataSourceLabel.textContent = "示例数据";
  showProjectRecoveryActions(false);
  setProjectUrlParam("");
  upsertProjectTab("sample", { title: "示例数据" });
  setProjectStatus("已切回示例数据", false);
}

function clearProjectPath() {
  state.projectPath = "";
  els.projectPathInput.value = "";
  syncProjectFileNameFromPath(defaultProjectPath());
  showProjectRecoveryActions(false);
  setProjectUrlParam("");
  setProjectStatus("已清除项目位置；可继续使用示例数据，或用当前项目名保存到 projects 文件夹。", state.projectDirty);
}

function cloneStateData(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function hydrateUserNotesFromRows(rows = state.rows) {
  if (!state.userIdField) return;
  rows.forEach(row => {
    const user = String(row[state.userIdField] || "");
    const note = String(row[USER_NOTE_FIELD] || "").trim();
    if (user && note && !state.userNotes[user]) state.userNotes[user] = note;
  });
}

function applyUserNotesToRows(rows = state.rows) {
  if (!state.userIdField || !Array.isArray(rows)) return rows;
  const hasAnyNote = Object.keys(state.userNotes || {}).some(user => state.userNotes[user]);
  const hasNoteField = rows.some(row => Object.prototype.hasOwnProperty.call(row, USER_NOTE_FIELD));
  if (!hasAnyNote && !hasNoteField) return rows;
  rows.forEach(row => {
    const user = String(row[state.userIdField] || "");
    row[USER_NOTE_FIELD] = user ? (state.userNotes[user] || "") : (row[USER_NOTE_FIELD] || "");
  });
  return rows;
}

function rowsWithUserNotes(rows = []) {
  return applyUserNotesToRows(rows.map(row => ({ ...row })));
}

function syncUserNoteInputs(user, value, source = null) {
  if (!user) return;
  document.querySelectorAll(`.user-note-input[data-user="${CSS.escape(user)}"]`).forEach(input => {
    if (input !== source) input.value = value;
  });
}

function setUserNote(user, rawValue, options = {}) {
  const value = String(rawValue || "").trim();
  if (!user) return;
  if (value) state.userNotes[user] = value;
  else delete state.userNotes[user];
  applyUserNotesToRows(state.rows);
  applyUserNotesToRows(state.mappedRows);
  syncUserNoteInputs(user, value, options.source || null);
  if (options.dirty) markProjectDirty();
}

function projectTabTitle(path = state.projectPath) {
  const value = String(path || "").trim();
  if (!value) return "未命名项目";
  return value.split(/[\\/]/).filter(Boolean).pop() || value;
}

function currentPageName() {
  return document.querySelector(".page-tab.active")?.dataset.page || "mapping";
}

function currentProjectTabSnapshot() {
  applyUserNotesToRows(state.rows);
  applyUserNotesToRows(state.mappedRows);
  return {
    rows: cloneStateData(state.rows),
    mappingRows: cloneStateData(state.mappingRows),
    mappedRows: cloneStateData(state.mappedRows),
    mappingFiles: cloneStateData(state.mappingFiles),
    mappingViews: cloneStateData(state.mappingViews),
    mappingReviews: cloneStateData(state.mappingReviews),
    mappingPhotoFields: cloneStateData(state.mappingPhotoFields),
    photoMappingOverrides: cloneStateData(state.photoMappingOverrides),
    viewLabels: cloneStateData(state.viewLabels),
    globalView: state.globalView,
    userViews: cloneStateData(state.userViews),
    selectedGroup: state.selectedGroup,
    primaryDimension: state.primaryDimension,
    secondaryDimension: state.secondaryDimension,
    metric: state.metric,
    yAxisMode: state.yAxisMode,
    showErrorBars: state.showErrorBars,
    pressureWorst: state.pressureWorst,
    comparisonMetric: state.comparisonMetric,
    comparisonAutoDevices: state.comparisonAutoDevices,
    comparisonDeviceA: state.comparisonDeviceA,
    comparisonDeviceB: state.comparisonDeviceB,
    comparisonThreshold: state.comparisonThreshold,
    comparisonGroupLayouts: cloneStateData(state.comparisonGroupLayouts),
    photoCompareVariable: state.photoCompareVariable,
    photoCompareLevelA: state.photoCompareLevelA,
    photoCompareLevelB: state.photoCompareLevelB,
    photoCompareView: state.photoCompareView,
    photoComparePhotoSize: state.photoComparePhotoSize,
    photoComparePositionX: state.photoComparePositionX,
    photoComparePositionY: state.photoComparePositionY,
    photoCompareZoom: state.photoCompareZoom,
    photoComparePanelSettings: cloneStateData(state.photoComparePanelSettings),
    analysisMode: state.analysisMode,
    multiProjectA: state.multiProjectA,
    multiProjectB: state.multiProjectB,
    multiUserField: state.multiUserField,
    multiFlowMetricA: state.multiFlowMetricA,
    multiFlowMetricB: state.multiFlowMetricB,
    multiFlowThreshold: state.multiFlowThreshold,
    multiFlowMappings: cloneStateData(state.multiFlowMappings),
    multiFlowSelectedKey: state.multiFlowSelectedKey,
    userPhotoPositions: cloneStateData(state.userPhotoPositions),
    userFilter: cloneStateData(state.userFilter),
    deviceOrderMode: state.deviceOrderMode,
    userOrder: cloneStateData(state.userOrder),
    userNotes: cloneStateData(state.userNotes),
    search: state.search,
    columnFilters: cloneStateData(state.columnFilters),
    fieldRoleOverrides: cloneStateData(state.fieldRoleOverrides),
    layout: cloneStateData(state.layout),
    projectPath: state.projectPath,
    projectTitle: state.projectTitle,
    projectDirty: state.projectDirty,
    sourceCsvName: state.sourceCsvName,
    protocolTemplate: cloneStateData(state.protocolTemplate),
    protocolValidation: cloneStateData(state.protocolValidation),
    projectRevision: state.projectRevision,
    photoRoot: els.photoRootInput.value,
    mappingMode: els.mappingMode.value,
    mappingUserField: els.mappingUserField.value,
    mappingEarField: els.mappingEarField.value,
    mappingDeviceField: els.mappingDeviceField.value,
    viewNames: els.viewNamesInput.value,
    includeBareEarPhotos: state.includeBareEarPhotos,
    bareEarConfig: cloneStateData(state.bareEarConfig),
    singleEarMode: state.singleEarMode,
    page: currentPageName()
  };
}

function saveActiveProjectTabSnapshot() {
  const tab = state.projectTabs.find(item => item.id === state.activeProjectTabId);
  if (!tab) return;
  tab.path = state.projectPath || tab.path;
  tab.title = state.projectTitle || tab.title || projectTabTitle(tab.path);
  tab.dirty = state.projectDirty;
  tab.snapshot = currentProjectTabSnapshot();
}

function upsertProjectTab(path = state.projectPath, options = {}) {
  const id = path || `untitled:${Date.now()}`;
  let tab = state.projectTabs.find(item => item.id === id);
  if (!tab) {
    tab = { id, path, title: options.title || projectTabTitle(path), customTitle: Boolean(options.title), dirty: false, snapshot: null };
    state.projectTabs.push(tab);
  }
  tab.path = path || tab.path;
  if (options.title) {
    tab.title = options.title;
    tab.customTitle = true;
  } else if (!tab.title) {
    tab.title = projectTabTitle(tab.path);
  }
  tab.dirty = state.projectDirty;
  tab.snapshot = currentProjectTabSnapshot();
  state.projectTitle = tab.title;
  state.activeProjectTabId = tab.id;
  renderProjectTabs();
  return tab;
}

function renderProjectTabs() {
  if (!els.projectTabs) return;
  els.projectTabs.innerHTML = state.projectTabs.map(tab => `
    <div class="project-tab-item ${tab.id === state.activeProjectTabId ? "active" : ""} ${tab.renaming ? "renaming" : ""}" data-tab-id="${attrEscape(tab.id)}" title="${attrEscape(tab.path || tab.title)}">
      <button class="project-tab-drag" type="button" draggable="true" data-drag-tab="${attrEscape(tab.id)}" aria-label="拖动项目排序">⋮⋮</button>
      ${tab.renaming ?
        `<input class="project-tab-title-input" data-tab-name="${attrEscape(tab.id)}" value="${attrEscape(tab.title)}" aria-label="项目标签名称">` :
        `<button class="project-tab-title" type="button" data-activate-tab="${attrEscape(tab.id)}">${escapeHtml(tab.title)}</button>`}
      <span class="project-tab-dirty" aria-hidden="true">${tab.dirty ? "*" : ""}</span>
      <button class="project-tab-rename" type="button" data-rename-tab="${attrEscape(tab.id)}" aria-label="重命名项目标签">改</button>
      <button class="project-tab-close" type="button" data-close-tab="${attrEscape(tab.id)}" aria-label="关闭项目标签">×</button>
    </div>
  `).join("") || `<div class="project-empty">暂无打开项目</div>`;
  const renaming = els.projectTabs.querySelector(".project-tab-title-input");
  if (renaming) {
    renaming.focus({ preventScroll: true });
    renaming.select();
  }
  updateProjectNameStatus();
  if (state.analysisMode === "multi") renderMultiProjectSelectors();
}

function restoreProjectTabSnapshot(snapshot) {
  if (!snapshot) return;
  state.rows = cloneStateData(snapshot.rows || []);
  state.mappingRows = cloneStateData(snapshot.mappingRows || []);
  state.mappedRows = cloneStateData(snapshot.mappedRows || []);
  state.mappingFiles = cloneStateData(snapshot.mappingFiles || []);
  state.mappingViews = cloneStateData(snapshot.mappingViews || []);
  state.mappingReviews = cloneStateData(snapshot.mappingReviews || []);
  state.mappingPhotoFields = cloneStateData(snapshot.mappingPhotoFields || []);
  state.photoMappingOverrides = cloneStateData(snapshot.photoMappingOverrides || {});
  state.viewLabels = cloneStateData(snapshot.viewLabels || {});
  state.globalView = snapshot.globalView || "";
  state.userViews = cloneStateData(snapshot.userViews || {});
  state.selectedGroup = snapshot.selectedGroup || null;
  state.primaryDimension = snapshot.primaryDimension || state.primaryDimension;
  state.secondaryDimension = snapshot.secondaryDimension || "";
  state.metric = snapshot.metric || "";
  state.yAxisMode = snapshot.yAxisMode || "adaptive";
  state.showErrorBars = snapshot.showErrorBars !== false;
  state.pressureWorst = snapshot.pressureWorst || "low";
  state.comparisonMetric = snapshot.comparisonMetric || "";
  state.comparisonAutoDevices = snapshot.comparisonAutoDevices !== false;
  state.comparisonDeviceA = snapshot.comparisonDeviceA || "";
  state.comparisonDeviceB = snapshot.comparisonDeviceB || "";
  state.comparisonThreshold = Number.isFinite(Number(snapshot.comparisonThreshold)) ? Number(snapshot.comparisonThreshold) : 1;
  state.comparisonGroupLayouts = cloneStateData(snapshot.comparisonGroupLayouts || {});
  state.photoCompareVariable = snapshot.photoCompareVariable || "";
  state.photoCompareLevelA = snapshot.photoCompareLevelA || "";
  state.photoCompareLevelB = snapshot.photoCompareLevelB || "";
  state.photoCompareView = snapshot.photoCompareView || "";
  state.photoComparePhotoSize = Number.isFinite(Number(snapshot.photoComparePhotoSize)) ? Number(snapshot.photoComparePhotoSize) : 150;
  state.photoComparePositionX = Number.isFinite(Number(snapshot.photoComparePositionX)) ? Number(snapshot.photoComparePositionX) : 50;
  state.photoComparePositionY = Number.isFinite(Number(snapshot.photoComparePositionY)) ? Number(snapshot.photoComparePositionY) : 50;
  state.photoCompareZoom = Number.isFinite(Number(snapshot.photoCompareZoom)) ? Number(snapshot.photoCompareZoom) : 100;
  state.photoComparePanelSettings = cloneStateData(snapshot.photoComparePanelSettings || {});
  state.analysisMode = snapshot.analysisMode || "single";
  state.multiProjectA = snapshot.multiProjectA || "";
  state.multiProjectB = snapshot.multiProjectB || "";
  state.multiUserField = snapshot.multiUserField || "";
  state.multiFlowMetricA = snapshot.multiFlowMetricA || "";
  state.multiFlowMetricB = snapshot.multiFlowMetricB || "";
  state.multiFlowThreshold = Number.isFinite(Number(snapshot.multiFlowThreshold)) ? Number(snapshot.multiFlowThreshold) : 1;
  state.multiFlowMappings = cloneStateData(snapshot.multiFlowMappings || []);
  state.multiFlowSelectedKey = snapshot.multiFlowSelectedKey || "";
  state.userPhotoPositions = cloneStateData(snapshot.userPhotoPositions || {});
  state.userFilter = cloneStateData(snapshot.userFilter || null);
  state.deviceOrderMode = snapshot.deviceOrderMode || "source";
  state.userOrder = cloneStateData(snapshot.userOrder || []);
  state.userNotes = cloneStateData(snapshot.userNotes || {});
  state.search = snapshot.search || "";
  state.columnFilters = cloneStateData(snapshot.columnFilters || {});
  state.fieldRoleOverrides = cloneStateData(snapshot.fieldRoleOverrides || {});
  state.layout = cloneStateData(snapshot.layout || defaultLayout());
  state.projectPath = snapshot.projectPath || "";
  state.projectTitle = snapshot.projectTitle || "";
  state.projectDirty = Boolean(snapshot.projectDirty);
  state.sourceCsvFile = null;
  state.sourceCsvName = snapshot.sourceCsvName || "";
  state.sourceCsvText = "";
  if (els.mappingCsvStatus) {
    els.mappingCsvStatus.textContent = state.sourceCsvName ?
      `项目内 CSV：data/${state.sourceCsvName}` :
      "当前项目没有记录源 CSV；重新选择 CSV 后保存会复制到项目 data 文件夹。";
  }
  state.protocolTemplate = cloneStateData(snapshot.protocolTemplate || null);
  state.protocolValidation = cloneStateData(snapshot.protocolValidation || null);
  state.projectRevision = snapshot.projectRevision || null;
  els.photoRootInput.value = snapshot.photoRoot || "";
  els.mappingMode.value = snapshot.mappingMode || "sequence";
  state.includeBareEarPhotos = Boolean(snapshot.includeBareEarPhotos);
  state.bareEarConfig = sanitizeBareEarConfig(snapshot.bareEarConfig);
  state.singleEarMode = Boolean(snapshot.singleEarMode);
  els.includeBareEarPhotos.checked = state.includeBareEarPhotos;
  els.singleEarMode.checked = state.singleEarMode;
  applyBareEarConfigToControls();
  buildSchema();
  initializeMappingFields();
  if ([...els.mappingUserField.options].some(option => option.value === snapshot.mappingUserField)) els.mappingUserField.value = snapshot.mappingUserField;
  if ([...els.mappingEarField.options].some(option => option.value === snapshot.mappingEarField)) els.mappingEarField.value = snapshot.mappingEarField;
  if ([...els.mappingDeviceField.options].some(option => option.value === snapshot.mappingDeviceField)) els.mappingDeviceField.value = snapshot.mappingDeviceField;
  els.viewNamesInput.value = snapshot.viewNames || state.mappingViews.join(",") || els.viewNamesInput.value;
  renderMappingMode();
  rebuildPhotoPathIndex(state.mappingFiles);
  applyLayoutVariables();
  initializeControls();
  renderFieldRoleConfig();
  renderColumnConfig();
  renderProtocolStatus();
  validateProtocolRows();
  render();
  if (state.mappingReviews.length) {
    renderMappingPreview(state.mappingReviews, els.mappingUserField.value, els.mappingDeviceField.value, state.mappingPhotoFields);
    els.applyMappingButton.disabled = !state.mappedRows.length;
    els.downloadPhotoAuditButton.disabled = !state.mappingPhotoFields.length;
  } else {
    resetMappingOutputs();
  }
  setProjectPath(state.projectPath);
  setProjectStatus(state.projectPath ? `当前项目：${state.projectPath}` : "未加载项目文件");
  switchPage(snapshot.page || "mapping");
  els.dataSourceLabel.textContent = state.projectPath ? "项目数据" : "示例数据";
}

function activateProjectTab(tabId) {
  if (tabId === state.activeProjectTabId) return;
  saveActiveProjectTabSnapshot();
  const tab = state.projectTabs.find(item => item.id === tabId);
  if (!tab) return;
  state.activeProjectTabId = tab.id;
  restoreProjectTabSnapshot(tab.snapshot);
  renderProjectTabs();
}

function closeProjectTab(tabId) {
  const index = state.projectTabs.findIndex(item => item.id === tabId);
  if (index < 0) return;
  const tab = state.projectTabs[index];
  if (tab.dirty && !confirm(`项目「${tab.title}」有未保存更改，仍要关闭吗？`)) return;
  state.projectTabs.splice(index, 1);
  if (state.activeProjectTabId === tabId) {
    const next = state.projectTabs[Math.max(0, index - 1)] || state.projectTabs[0];
    state.activeProjectTabId = next?.id || "";
    if (next) restoreProjectTabSnapshot(next.snapshot);
  }
  renderProjectTabs();
}

function createNewProjectTab() {
  saveActiveProjectTabSnapshot();
  state.rows = [];
  state.mappingRows = [];
  state.mappedRows = [];
  state.mappingFiles = [];
  state.mappingViews = [];
  state.mappingReviews = [];
  state.mappingPhotoFields = [];
  state.photoMappingOverrides = {};
  state.projectPath = "";
  state.projectTitle = "";
  state.projectDirty = false;
  state.protocolTemplate = null;
  state.protocolValidation = null;
  els.photoRootInput.value = "";
  els.projectPathInput.value = defaultProjectPath();
  syncProjectFileNameFromPath(defaultProjectPath());
  updateProjectFolderStatus();
  buildSchema();
  initializeMappingFields();
  initializeControls();
  renderFieldRoleConfig();
  renderColumnConfig();
  resetMappingOutputs();
  renderProtocolStatus();
  render();
  upsertProjectTab(`untitled:${Date.now()}`, { title: "未命名项目" });
  setProjectStatus("新建项目标签");
  switchPage("mapping");
}

function renameProjectTab(tabId, title, options = {}) {
  const tab = state.projectTabs.find(item => item.id === tabId);
  if (!tab) return;
  const cleanTitle = String(title || "").trim() || projectTabTitle(tab.path);
  tab.title = cleanTitle;
  tab.customTitle = true;
  if (options.persist) tab.renaming = false;
  if (tab.id === state.activeProjectTabId) {
    state.projectTitle = cleanTitle;
    updateProjectNameStatus();
    if (options.persist) {
      state.projectDirty = true;
      tab.dirty = true;
      tab.snapshot = currentProjectTabSnapshot();
      setProjectStatus(state.projectPath ? `当前项目：${state.projectPath}` : "未加载项目文件");
    }
  }
}

function startRenameProjectTab(tabId) {
  state.projectTabs.forEach(tab => {
    tab.renaming = tab.id === tabId;
  });
  renderProjectTabs();
}

function moveProjectTab(draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return false;
  const fromIndex = state.projectTabs.findIndex(tab => tab.id === draggedId);
  const toIndex = state.projectTabs.findIndex(tab => tab.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return false;
  const [tab] = state.projectTabs.splice(fromIndex, 1);
  state.projectTabs.splice(toIndex, 0, tab);
  renderProjectTabs();
  return true;
}

function setProjectStatus(message, dirty = state.projectDirty) {
  els.projectStatus.textContent = dirty ? `${message} · 有未保存更改` : message;
}

function markProjectDirty() {
  state.projectDirty = true;
  const label = state.serverProjectId ? `服务器项目：${state.projectTitle || state.serverProjectId} · rev ${state.projectRevision || "?"}` :
    state.projectPath ? `当前项目：${state.projectPath}` : "未加载项目文件";
  const tab = state.projectTabs.find(item => item.id === state.activeProjectTabId);
  if (tab) {
    tab.dirty = true;
    tab.snapshot = currentProjectTabSnapshot();
    renderProjectTabs();
  }
  setProjectStatus(label);
  updateProjectNameStatus();
}

function markProjectSaved(message) {
  state.projectDirty = false;
  const tab = state.projectTabs.find(item => item.id === state.activeProjectTabId);
  if (tab) {
    tab.path = state.projectPath || tab.path;
    tab.title = state.projectTitle || tab.title || projectTabTitle(tab.path);
    tab.dirty = false;
    tab.snapshot = currentProjectTabSnapshot();
    renderProjectTabs();
  }
  setProjectStatus(message, false);
  updateProjectNameStatus();
}

function updateProjectNameStatus() {
  if (els.projectNameStatus) els.projectNameStatus.textContent = activeProjectName();
}

function selectedBrowserPhotoFiles() {
  return [...(els.photoFolderChooser?.files || [])].filter(file => Core.isImagePath(file.name || file.webkitRelativePath || ""));
}

function relativePathForSelectedFile(file) {
  const files = selectedBrowserPhotoFiles();
  const rawPaths = files.map(item => item.webkitRelativePath || item.name || "");
  const firstParts = rawPaths.map(path => path.split(/[\\/]/).filter(Boolean)[0]).filter(Boolean);
  const stripSelectedRoot = firstParts.length > 0 && firstParts.every(part => part === firstParts[0]) &&
    rawPaths.some(path => path.split(/[\\/]/).filter(Boolean).length > 1);
  const rawPath = file.webkitRelativePath || file.name || "";
  const parts = rawPath.split(/[\\/]/).filter(Boolean);
  return normalizePathSlashes(stripSelectedRoot ? parts.slice(1).join("/") : parts.join("/"));
}

async function uploadProjectAsset(projectPath, kind, path, file, contentType = "application/octet-stream") {
  const query = new URLSearchParams({ projectPath, kind, path });
  const response = await fetch(`/api/project-assets?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: file
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "项目资源保存失败。");
  return result;
}

async function copyProjectPhotosFromServerRoot(projectPath, root) {
  const response = await fetch("/api/copy-project-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, root })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "项目照片复制失败。");
  return result;
}

async function writeFileToDirectory(directoryHandle, fileName, file) {
  const handle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
}

async function ensureNestedDirectory(rootHandle, parts = []) {
  let handle = rootHandle;
  for (const part of parts.filter(Boolean)) {
    handle = await handle.getDirectoryHandle(part, { create: true });
  }
  return handle;
}

async function persistProjectAssetsToSelectedFolder(projectDirHandle, project) {
  if (state.sourceCsvFile) {
    const dataDir = await projectDirHandle.getDirectoryHandle("data", { create: true });
    await writeFileToDirectory(dataDir, state.sourceCsvName || state.sourceCsvFile.name || "source.csv", state.sourceCsvFile);
    project.sourceCsv = joinPath("data", state.sourceCsvName || state.sourceCsvFile.name || "source.csv");
  }
  const files = selectedBrowserPhotoFiles();
  if (files.length) {
    for (const [index, file] of files.entries()) {
      const relative = relativePathForSelectedFile(file);
      if (!relative) continue;
      const parts = relative.split("/").filter(Boolean);
      const fileName = parts.pop();
      const dir = await ensureNestedDirectory(projectDirHandle, ["photos", ...parts]);
      await writeFileToDirectory(dir, fileName, file);
      if ((index + 1) % 10 === 0 || index === files.length - 1) {
        setProjectStatus(`正在整理照片 ${index + 1} / ${files.length}`, true);
      }
    }
    project.photoRoot = "photos";
    els.photoRootInput.value = "photos";
  }
  return project;
}

async function persistProjectAssetsToServerProject(projectPath, project) {
  if (state.sourceCsvFile) {
    const csvName = state.sourceCsvName || state.sourceCsvFile.name || "source.csv";
    const result = await uploadProjectAsset(projectPath, "csv", csvName, state.sourceCsvFile, state.sourceCsvFile.type || "text/csv");
    project.sourceCsv = result.path || joinPath("data", csvName);
  }
  const files = selectedBrowserPhotoFiles();
  if (files.length) {
    for (const [index, file] of files.entries()) {
      const relative = relativePathForSelectedFile(file);
      if (!relative) continue;
      await uploadProjectAsset(projectPath, "photo", relative, file, file.type || "application/octet-stream");
      if ((index + 1) % 10 === 0 || index === files.length - 1) {
        setProjectStatus(`正在整理照片 ${index + 1} / ${files.length}`, true);
      }
    }
    project.photoRoot = "photos";
    els.photoRootInput.value = "photos";
    return project;
  }
  const root = els.photoRootInput?.value?.trim?.() || "";
  if (root && /^[A-Za-z]:[\\/]|^\//.test(root)) {
    project.photoRoot = root;
    return project;
  }
  return project;
}

async function saveProject() {
  state.projectTitle = activeProjectName();
  updateProjectNameStatus();
  let project = projectDocumentSnapshot();
  project.title = state.projectTitle;
  if (state.serverProjectId) {
    await writeServerProject(project, "已保存项目");
    return;
  }
  if (state.projectFolderHandle) {
    await writeProjectToSelectedFolder(project, "已保存项目");
    return;
  }
  const path = selectedProjectPath();
  project = await persistProjectAssetsToServerProject(path, project);
  await writeProject(path, project, "已保存项目");
}

async function writeProjectToSelectedFolder(project, successPrefix) {
  const projectName = activeProjectName();
  const fileName = selectedProjectFileName();
  const projectDir = await state.projectFolderHandle.getDirectoryHandle(projectName, { create: true });
  await persistProjectAssetsToSelectedFolder(projectDir, project);
  const handle = await projectDir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(project, null, 2));
  await writable.close();
  const folderLabel = state.projectFolderLabel || state.projectFolderHandle.name || "本地文件夹";
  setProjectPath(`browser-folder:${folderLabel}/${projectName}/${fileName}`);
  markProjectSaved(`${successPrefix}：${folderLabel}/${projectName}/${fileName}`);
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

async function readProjectFromSelectedFolder(fileName = selectedProjectFileName()) {
  if (!state.projectFolderHandle) throw new Error("未选择项目文件夹。");
  const handle = await state.projectFolderHandle.getFileHandle(sanitizeProjectFileName(fileName));
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}

async function saveCurrentProjectConfig() {
  if (state.serverProjectId) {
    await writeServerProject({
      ...projectDocumentSnapshot(),
      rows: normalizeRowsForSave(state.rows),
      mappingRows: normalizeRowsForSave(state.mappingRows),
      savedAt: new Date().toISOString(),
      dashboardConfig: dashboardConfigSnapshot()
    }, "已保存当前配置");
    return;
  }
  if (state.projectFolderHandle) {
    let project = null;
    try {
      project = await readProjectFromSelectedFolder(selectedProjectFileName());
    } catch {
      project = null;
    }
    if (!project) project = projectDocumentSnapshot();
    const mappingConfig = mappingConfigSnapshot();
    await writeProjectToSelectedFolder({
      ...project,
      title: state.projectTitle || project.title || projectTabTitle(selectedProjectFileName()),
      savedAt: new Date().toISOString(),
      photoRoot: mappingConfig.photoRoot,
      mappingMode: mappingConfig.mappingMode,
      mappingFields: mappingConfig.mappingFields,
      mappingViews: mappingConfig.mappingViews,
      protocolTemplate: state.protocolTemplate,
      dashboardConfig: dashboardConfigSnapshot()
    }, "已保存当前配置");
    return;
  }
  const path = selectedProjectPath();
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
    title: state.projectTitle || project.title || projectTabTitle(path),
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
  saveActiveProjectTabSnapshot();
  if (!path && state.projectFolderHandle) {
    const fileName = selectedProjectFileName();
    const project = await readProjectFromSelectedFolder(fileName);
    await applyLoadedProject(`browser-folder:${state.projectFolderLabel || state.projectFolderHandle.name || "本地文件夹"}/${fileName}`, project);
    return;
  }
  const projectPath = path || selectedProjectPath();
  const response = await fetch(`/api/load-project?path=${encodeURIComponent(projectPath)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "项目加载失败。");
  await applyLoadedProject(result.path, result.project);
}

async function applyLoadedProject(path, rawProject, options = {}) {
  const project = Core.sanitizeProjectDocument(rawProject);
  state.activeProjectTabId = "";
  setProjectPath(path);
  state.projectTitle = project.title || projectTabTitle(path);
  state.rows = project.rows.map(row => ({ ...row }));
  state.mappingRows = project.mappingRows.map(row => ({ ...row }));
  state.mappedRows = [];
  state.mappingFiles = cloneStateData(options.mappingFiles || []);
  state.mappingViews = project.mappingViews;
  state.photoMappingOverrides = project.photoMappingOverrides;
  state.protocolTemplate = project.protocolTemplate;
  state.sourceCsvFile = null;
  state.sourceCsvName = project.sourceCsv ? project.sourceCsv.split(/[\\/]/).pop() : "";
  state.sourceCsvText = "";
  if (els.mappingCsvStatus) {
    els.mappingCsvStatus.textContent = project.sourceCsv ?
      `项目内 CSV：${project.sourceCsv}` :
      "当前项目没有记录源 CSV；重新选择 CSV 后保存会复制到项目 data 文件夹。";
  }
  els.photoRootInput.value = project.photoRoot;
  els.mappingMode.value = project.mappingMode;
  state.includeBareEarPhotos = Boolean(project.mappingFields.includeBareEarPhotos);
  state.bareEarConfig = sanitizeBareEarConfig(project.mappingFields.bareEarConfig);
  state.singleEarMode = Boolean(project.mappingFields.singleEarMode);
  els.includeBareEarPhotos.checked = state.includeBareEarPhotos;
  applyBareEarConfigToControls();
  els.singleEarMode.checked = state.singleEarMode;
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
  rebuildPhotoPathIndex(state.mappingFiles);
  if (!options.skipPhotoScan && project.photoRoot && !project.photoRoot.startsWith("browser-folder:")) {
    try {
      await scanPhotoRoot();
    } catch (error) {
      setProjectStatus(`项目已加载，但照片目录未授权：${error.message}`);
    }
  }
  markProjectSaved(`已加载：${path}`);
  upsertProjectTab(path, { title: state.projectTitle });
  els.dataSourceLabel.textContent = "项目数据";
  switchPage("dashboard");
}

async function autoLoadProjectsFolder() {
  if (state.serverProjectId || window.location.protocol === "file:") return false;
  try {
    const response = await fetch("/api/list-projects");
    if (!response.ok) return false;
    const result = await response.json();
    const projects = Array.isArray(result.projects) ? result.projects : [];
    if (!projects.length) {
      const roots = Array.isArray(result.roots) ? result.roots.map(root => `${root.path}${root.exists ? "" : "（不存在）"}`).join("；") : "未返回扫描目录";
      setProjectStatus(`未发现项目 JSON。当前扫描目录：${roots}。也可以点“选择项目根目录”直接加载。`, false);
      return false;
    }
    let loaded = 0;
    const errors = [];
    for (const project of projects) {
      if (!project.path) continue;
      try {
        await loadProject(project.path);
        loaded += 1;
      } catch (error) {
        errors.push(`${project.title || project.path}：${error.message}`);
      }
    }
    if (loaded) {
      setProjectStatus(errors.length ?
        `已自动加载 ${loaded} 个项目，${errors.length} 个失败。` :
        `已自动加载 projects 文件夹中的 ${loaded} 个项目。`, false);
      showProjectRecoveryActions(errors.length > 0);
      return true;
    }
    if (errors.length) setProjectStatus(`projects 自动加载失败：${errors.join("；")}`);
  } catch {
    return false;
  }
  return false;
}

async function loadServerProject() {
  if (!state.serverProjectId) throw new Error("缺少服务器项目 ID。");
  saveActiveProjectTabSnapshot();
  const response = await fetch(`/api/server/projects/${encodeURIComponent(state.serverProjectId)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "服务器项目加载失败。");
  const project = Core.sanitizeProjectDocument(result.project);
  state.projectRevision = result.revision;
  state.projectTitle = result.title || project.title || state.serverProjectId;
  state.rows = project.rows.map(row => ({ ...row }));
  state.mappingRows = project.mappingRows.map(row => ({ ...row }));
  state.mappedRows = [];
  state.mappingViews = project.mappingViews;
  state.photoMappingOverrides = project.photoMappingOverrides;
  state.protocolTemplate = project.protocolTemplate;
  state.sourceCsvFile = null;
  state.sourceCsvName = project.sourceCsv ? project.sourceCsv.split(/[\\/]/).pop() : "";
  state.sourceCsvText = "";
  if (els.mappingCsvStatus) {
    els.mappingCsvStatus.textContent = project.sourceCsv ?
      `项目内 CSV：${project.sourceCsv}` :
      "当前项目没有记录源 CSV；重新选择 CSV 后保存会复制到项目 data 文件夹。";
  }
  els.photoRootInput.value = project.photoRoot;
  els.mappingMode.value = project.mappingMode;
  state.includeBareEarPhotos = Boolean(project.mappingFields.includeBareEarPhotos);
  state.bareEarConfig = sanitizeBareEarConfig(project.mappingFields.bareEarConfig);
  state.singleEarMode = Boolean(project.mappingFields.singleEarMode);
  els.includeBareEarPhotos.checked = state.includeBareEarPhotos;
  applyBareEarConfigToControls();
  els.singleEarMode.checked = state.singleEarMode;
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
  els.projectPathInput.value = state.serverProjectId;
  syncProjectFileNameFromPath(state.serverProjectId);
  if (els.chooseProjectFolderButton) els.chooseProjectFolderButton.disabled = true;
  updateProjectFolderStatus("服务器项目模式：项目由服务器管理。");
  markProjectSaved(`已加载服务器项目：${state.projectTitle} · rev ${state.projectRevision}`);
  upsertProjectTab(state.serverProjectId, { title: state.projectTitle || state.serverProjectId });
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
  if (clean.comparisonMetric) state.comparisonMetric = clean.comparisonMetric;
  if (typeof clean.comparisonAutoDevices === "boolean") state.comparisonAutoDevices = clean.comparisonAutoDevices;
  if (clean.comparisonDeviceA) state.comparisonDeviceA = clean.comparisonDeviceA;
  if (clean.comparisonDeviceB) state.comparisonDeviceB = clean.comparisonDeviceB;
  if (Number.isFinite(Number(clean.comparisonThreshold))) state.comparisonThreshold = Number(clean.comparisonThreshold);
  state.comparisonGroupLayouts = clean.comparisonGroupLayouts || {};
  state.photoCompareVariable = clean.photoCompareVariable || state.photoCompareVariable;
  state.photoCompareLevelA = clean.photoCompareLevelA || state.photoCompareLevelA;
  state.photoCompareLevelB = clean.photoCompareLevelB || state.photoCompareLevelB;
  state.photoCompareView = clean.photoCompareView || state.photoCompareView;
  if (Number.isFinite(Number(clean.photoComparePhotoSize))) state.photoComparePhotoSize = Number(clean.photoComparePhotoSize);
  if (Number.isFinite(Number(clean.photoComparePositionX))) state.photoComparePositionX = Number(clean.photoComparePositionX);
  if (Number.isFinite(Number(clean.photoComparePositionY))) state.photoComparePositionY = Number(clean.photoComparePositionY);
  if (Number.isFinite(Number(clean.photoCompareZoom))) state.photoCompareZoom = Number(clean.photoCompareZoom);
  state.photoComparePanelSettings = clean.photoComparePanelSettings || state.photoComparePanelSettings;
  state.analysisMode = clean.analysisMode || state.analysisMode;
  state.multiProjectA = clean.multiProjectA || state.multiProjectA;
  state.multiProjectB = clean.multiProjectB || state.multiProjectB;
  state.multiUserField = clean.multiUserField || state.multiUserField;
  state.multiFlowMetricA = clean.multiFlowMetricA || state.multiFlowMetricA;
  state.multiFlowMetricB = clean.multiFlowMetricB || state.multiFlowMetricB;
  if (Number.isFinite(Number(clean.multiFlowThreshold))) state.multiFlowThreshold = Number(clean.multiFlowThreshold);
  state.multiFlowMappings = Array.isArray(clean.multiFlowMappings) ? clean.multiFlowMappings : state.multiFlowMappings;
  state.multiFlowSelectedKey = clean.multiFlowSelectedKey || state.multiFlowSelectedKey;
  state.userPhotoPositions = clean.userPhotoPositions || {};
  state.userFilter = Array.isArray(clean.userFilter) ? clean.userFilter : null;
  state.deviceOrderMode = clean.deviceOrderMode || "source";
  state.userOrder = Array.isArray(clean.userOrder) ? clean.userOrder : [];
  state.userNotes = clean.userNotes || {};
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
  document.documentElement.style.setProperty("--photo-position-x", `${state.layout.photoPositionX ?? 50}%`);
  document.documentElement.style.setProperty("--photo-position-y", `${state.layout.photoPositionY ?? 50}%`);
  document.documentElement.style.setProperty("--photo-zoom", `${(state.layout.photoZoom ?? 100) / 100}`);
  document.body.classList.toggle("capture-mode", sanitizeDetailPhotoMode(state.layout.detailPhotoMode) === "capture");
  if (els.fontSizeControl) els.fontSizeControl.value = state.layout.fontSize;
  if (els.fontSizeValue) els.fontSizeValue.value = `${state.layout.fontSize}px`;
  if (els.photoSizeControl) els.photoSizeControl.value = state.layout.photoSize;
  if (els.photoSizeValue) els.photoSizeValue.value = `${state.layout.photoSize}px`;
  if (els.photoZoomControl) els.photoZoomControl.value = state.layout.photoZoom ?? 100;
  if (els.photoZoomValue) els.photoZoomValue.value = `${state.layout.photoZoom ?? 100}%`;
  if (els.photoPositionXControl) els.photoPositionXControl.value = state.layout.photoPositionX ?? 50;
  if (els.photoPositionXValue) els.photoPositionXValue.value = `${state.layout.photoPositionX ?? 50}%`;
  if (els.photoPositionYControl) els.photoPositionYControl.value = state.layout.photoPositionY ?? 50;
  if (els.photoPositionYValue) els.photoPositionYValue.value = `${state.layout.photoPositionY ?? 50}%`;
  if (els.globalCenterValue) els.globalCenterValue.textContent = `全局中心 ${state.layout.photoPositionX ?? 50}%, ${state.layout.photoPositionY ?? 50}%`;
  if (els.detailPhotoModeControl) els.detailPhotoModeControl.value = sanitizeDetailPhotoMode(state.layout.detailPhotoMode);
  if (els.detailPhotoModeValue) els.detailPhotoModeValue.value = state.layout.detailPhotoMode === "capture" ? "原图" : "预览";
  document.querySelectorAll(".layout-font-size-control").forEach(input => { input.value = state.layout.fontSize; });
  document.querySelectorAll(".layout-font-size-value").forEach(output => { output.value = `${state.layout.fontSize}px`; });
  document.querySelectorAll(".layout-photo-size-control").forEach(input => { input.value = state.layout.photoSize; });
  document.querySelectorAll(".layout-photo-size-value").forEach(output => { output.value = `${state.layout.photoSize}px`; });
  document.querySelectorAll(".layout-photo-zoom-control").forEach(input => { input.value = state.layout.photoZoom ?? 100; });
  document.querySelectorAll(".layout-photo-zoom-value").forEach(output => { output.value = `${state.layout.photoZoom ?? 100}%`; });
  document.querySelectorAll(".layout-photo-position-x-control").forEach(input => { input.value = state.layout.photoPositionX ?? 50; });
  document.querySelectorAll(".layout-photo-position-x-value").forEach(output => { output.value = `${state.layout.photoPositionX ?? 50}%`; });
  document.querySelectorAll(".layout-photo-position-y-control").forEach(input => { input.value = state.layout.photoPositionY ?? 50; });
  document.querySelectorAll(".layout-photo-position-y-value").forEach(output => { output.value = `${state.layout.photoPositionY ?? 50}%`; });
  document.querySelectorAll(".layout-global-center-value").forEach(output => {
    output.textContent = `全局中心 ${state.layout.photoPositionX ?? 50}%, ${state.layout.photoPositionY ?? 50}%`;
  });
  document.querySelectorAll(".layout-detail-photo-mode-control").forEach(select => { select.value = sanitizeDetailPhotoMode(state.layout.detailPhotoMode); });
  document.querySelectorAll(".layout-detail-photo-mode-value").forEach(output => { output.value = state.layout.detailPhotoMode === "capture" ? "原图" : "预览"; });
  syncVisiblePhotoPositionControls();
}

function syncVisiblePhotoPositionControls() {
  if (!els.detailBody) return;
  els.detailBody.querySelectorAll(".photo-position-controls").forEach(controls => {
    const user = controls.dataset.user || "";
    if (state.userPhotoPositions[user]) return;
    const position = userPhotoPosition(user);
    controls.querySelectorAll(".user-photo-position").forEach(input => {
      const value = input.dataset.axis === "x" ? position.x : position.y;
      input.value = value;
      input.nextElementSibling.value = `${value}%`;
    });
    const hint = controls.querySelector(".photo-center-hint");
    if (hint) hint.textContent = `中心 ${position.x}%, ${position.y}%`;
  });
}

function renderColumnConfig() {
  const html = state.layout.columns.map(column => `
    <div class="column-config-row" data-column-id="${attrEscape(column.id)}" draggable="true">
      <span class="column-drag-handle" aria-label="拖拽移动${attrEscape(column.label)}" title="拖拽排序">⋮⋮</span>
      <input class="column-visible" type="checkbox" aria-label="显示${attrEscape(column.label)}" ${column.visible ? "checked" : ""}>
      <label>${escapeHtml(column.label)}${column.userLevel ? " · 用户级" : ""}</label>
      <input class="column-width" type="number" min="60" max="500" step="10" value="${column.width}" aria-label="${attrEscape(column.label)}列宽">
    </div>
  `).join("");
  els.columnConfigList.innerHTML = html;
  document.querySelectorAll(".synced-column-config-list").forEach(list => {
    list.innerHTML = html;
  });
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
  if (columnDragScroll.list) (activeColumnConfigList || els.columnConfigList).scrollTop += columnDragScroll.list;
  if (columnDragScroll.page) window.scrollBy(0, columnDragScroll.page);
  columnDragScrollFrame = requestAnimationFrame(runColumnDragAutoScroll);
}

function updateColumnDragAutoScroll(clientY, list = activeColumnConfigList || els.columnConfigList) {
  const edge = 48;
  const listRect = list.getBoundingClientRect();
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
      <span>${escapeHtml(fieldLabels[field] || field)}<small>${escapeHtml(field)}</small></span>
      <select data-field="${attrEscape(field)}">
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
  if (state.photoUrlByPath[path]) return state.photoUrlByPath[path];
  if (/^(blob:|data:|https?:|\/api\/)/i.test(path)) return path;
  const projectPhoto = projectPhotoUrl(path);
  if (projectPhoto) return projectPhoto;
  const rooted = rootedPhotoPath(path);
  if (rooted) return `/api/photo?path=${encodeURIComponent(rooted)}`;
  if (/^[A-Za-z]:[\\/]|^\//.test(path)) return `/api/photo?path=${encodeURIComponent(path)}`;
  return path;
}

function photoThumbUrl(path) {
  const stored = state.photoRelativeByUrl[path] || normalizePathSlashes(path);
  return state.thumbnailUrls[path] || state.thumbnailUrls[stored] || photoUrl(path);
}

function normalizePathSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}

function isRuntimePhotoUrl(value) {
  return /^(blob:|https?:|\/api\/)/i.test(String(value || ""));
}

function photoFileStoredPath(file = {}) {
  return normalizePathSlashes(file.relative_path || file.path || file.absolute_path || "");
}

function photoFileRuntimeUrl(file = {}) {
  return file.url || file.absolute_path || file.path || file.relative_path || "";
}

function rebuildPhotoPathIndex(files = state.mappingFiles) {
  state.photoUrlByPath = {};
  state.photoRelativeByUrl = {};
  (files || []).forEach(file => {
    const stored = photoFileStoredPath(file);
    const runtimeUrl = photoFileRuntimeUrl(file);
    if (!stored || !runtimeUrl) return;
    state.photoUrlByPath[stored] = runtimeUrl;
    [runtimeUrl, file.absolute_path, file.url, file.path].filter(Boolean).forEach(value => {
      state.photoRelativeByUrl[value] = stored;
      state.photoUrlByPath[value] = runtimeUrl;
    });
  });
}

function projectDirectoryPath() {
  const path = state.projectPath || els.projectPathInput?.value || "";
  if (String(path).startsWith("browser-folder:")) return "";
  if (!path || !/[\\/]/.test(path)) return "";
  return normalizePathSlashes(path).replace(/\/[^/]*$/, "");
}

function joinPath(base, relative) {
  if (!base || !relative) return "";
  return `${normalizePathSlashes(base).replace(/\/+$/, "")}/${normalizePathSlashes(relative).replace(/^\/+/, "")}`;
}

function safeRelativeRootForProjectPhoto(root) {
  const normalized = normalizePathSlashes(root || "photos").replace(/^\/+|\/+$/g, "") || "photos";
  if (!normalized || normalized.startsWith("browser-folder:") || normalized.startsWith("server:")) return "";
  if (/^[A-Za-z]:[\\/]|^\//.test(root || "")) return "";
  if (normalized.split("/").includes("..")) return "";
  return normalized;
}

function projectPhotoUrl(relativePath) {
  if (!relativePath || isRuntimePhotoUrl(relativePath) || /^[A-Za-z]:[\\/]|^\//.test(relativePath)) return "";
  if (state.photoUrlByPath[relativePath]) return "";
  const root = safeRelativeRootForProjectPhoto(els.photoRootInput?.value?.trim?.() || "photos");
  if (!root) return "";
  const project = state.projectPath && !String(state.projectPath).startsWith("browser-folder:") ? normalizePathSlashes(state.projectPath) : "";
  const projectQuery = project ? `&project=${encodeURIComponent(project)}` : "";
  return `/api/project-photo?root=${encodeURIComponent(root)}&path=${encodeURIComponent(normalizePathSlashes(relativePath))}${projectQuery}`;
}

function rootedPhotoPath(relativePath) {
  if (!relativePath || isRuntimePhotoUrl(relativePath) || /^[A-Za-z]:[\\/]|^\//.test(relativePath)) return "";
  const root = els.photoRootInput?.value?.trim?.() || "";
  if (!root || root.startsWith("browser-folder:") || root.startsWith("server:")) return "";
  if (/^[A-Za-z]:[\\/]|^\//.test(root)) return joinPath(root, relativePath);
  const projectDir = projectDirectoryPath();
  return projectDir ? joinPath(projectDir, joinPath(root, relativePath)) : joinPath(root, relativePath);
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

function cleanPhotoCompareValue(value) {
  return String(value ?? "").trim();
}

function photoCompareFieldValues(field, rows = state.rows) {
  const values = new Set();
  (rows || []).forEach(row => {
    const value = cleanPhotoCompareValue(row?.[field]);
    if (value) values.add(value);
  });
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function isPhotoCompareIdentifierField(field) {
  const key = cleanPhotoCompareValue(field);
  const label = cleanPhotoCompareValue(fieldLabels[field] || field);
  if (!key) return true;
  if (field === state.userIdField || fieldRole(field) === "user_id") return true;
  const identifierPattern = /^(id|user|user_id|participant|participant_id|subject|subject_id|record_id|name|姓名|用户|用户编号|用户id|受试者|受试者编号)$/i;
  return identifierPattern.test(key) || identifierPattern.test(label);
}

function isBetweenUserVariable(field, rows = state.rows) {
  const byUser = new Map();
  for (const row of rows || []) {
    const user = cleanPhotoCompareValue(row?.[state.userIdField]);
    const value = cleanPhotoCompareValue(row?.[field]);
    if (!user || !value) continue;
    if (!byUser.has(user)) byUser.set(user, value);
    if (byUser.get(user) !== value) return false;
  }
  return byUser.size > 0;
}

function isPhotoCompareGroupField(field) {
  if (!field || isPhotoCompareIdentifierField(field) || state.photoFields.includes(field) || isPhotoField(field)) return false;
  const role = fieldRole(field);
  if (["device", "metric", "pressure", "photo", "ignore"].includes(role)) return false;
  if (!["user", "dimension"].includes(role)) return false;
  if (!isBetweenUserVariable(field)) return false;
  const values = photoCompareFieldValues(field);
  return values.length >= 2 && values.length <= 80;
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
  hydrateUserNotesFromRows();
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
  if (!state.metricFields.includes(state.comparisonMetric)) state.comparisonMetric = state.metric || state.metricFields[0] || "";
  const dynamicColumns = state.headers.filter(field => field !== USER_NOTE_FIELD).map(field => ({
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
  dynamicColumns.push({
    id: "__user_note",
    label: "备注",
    width: 150,
    visible: true,
    userLevel: true,
    photo: false,
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
    if (column.userLevel && !column.photo && column.id !== state.userIdField && column.id !== "__user_profile" && column.id !== "__user_note") column.visible = false;
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
  state.layout.columns = combined;
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
  refreshComparisonControls();
  refreshPhotoCompareControls();
  renderComparisonGlobalColumns();
  renderViewControls();
}

function renderViewControls() {
  els.globalViewControl.hidden = state.photoFields.length === 0;
  els.resetViewsButton.hidden = state.photoFields.length === 0;
  const options = photoViewOptions();
  els.globalViewSelect.innerHTML = options.map(option =>
    `<option value="${attrEscape(option.value)}" ${option.value === state.globalView ? "selected" : ""}>${escapeHtml(option.label)}</option>`
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

function clampPercent(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function clampPhotoZoom(value, fallback = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(50, Math.min(250, Math.round(number)));
}

function userPhotoPosition(user) {
  const custom = state.userPhotoPositions[user];
  return {
    x: clampPercent(custom?.x, clampPercent(state.layout.photoPositionX, 50)),
    y: clampPercent(custom?.y, clampPercent(state.layout.photoPositionY, 50)),
    zoom: clampPhotoZoom(custom?.zoom, clampPhotoZoom(state.layout.photoZoom, 100))
  };
}

function updateUserPhotoCenter(user, x, y) {
  if (!user) return;
  const current = userPhotoPosition(user);
  const next = {
    x: clampPercent(x, current.x),
    y: clampPercent(y, current.y),
    zoom: current.zoom
  };
  state.userPhotoPositions[user] = next;
  document.querySelectorAll(`[data-photo-user="${CSS.escape(user)}"]`).forEach(gallery => {
    gallery.style.setProperty("--user-photo-position-x", `${next.x}%`);
    gallery.style.setProperty("--user-photo-position-y", `${next.y}%`);
  });
  document.querySelectorAll(`.photo-position-controls[data-user="${CSS.escape(user)}"]`).forEach(controls => {
    controls.querySelectorAll(".user-photo-position").forEach(input => {
      const position = input.dataset.axis === "x" ? next.x : next.y;
      input.value = position;
      input.nextElementSibling.value = `${position}%`;
    });
    const hint = controls.querySelector(".photo-center-hint");
    if (hint) hint.textContent = `中心 ${next.x}%, ${next.y}%`;
    controls.querySelector(".photo-position-reset")?.removeAttribute("disabled");
  });
}

function updateUserPhotoZoom(user, value) {
  if (!user) return;
  const current = userPhotoPosition(user);
  const next = {
    x: current.x,
    y: current.y,
    zoom: clampPhotoZoom(value, current.zoom)
  };
  state.userPhotoPositions[user] = next;
  document.querySelectorAll(`[data-photo-user="${CSS.escape(user)}"]`).forEach(gallery => {
    gallery.style.setProperty("--user-photo-position-x", `${next.x}%`);
    gallery.style.setProperty("--user-photo-position-y", `${next.y}%`);
    gallery.style.setProperty("--user-photo-zoom", `${next.zoom / 100}`);
  });
  document.querySelectorAll(`.photo-position-controls[data-user="${CSS.escape(user)}"]`).forEach(controls => {
    controls.querySelectorAll(".user-photo-zoom").forEach(input => {
      input.value = next.zoom;
      const output = controls.querySelector(".user-photo-zoom-value");
      if (output) output.value = `${next.zoom}%`;
    });
    controls.querySelector(".photo-position-reset")?.removeAttribute("disabled");
  });
}

function updateUserPhotoPosition(user, axis, value) {
  if (!user || !["x", "y"].includes(axis)) return;
  const current = userPhotoPosition(user);
  updateUserPhotoCenter(user, axis === "x" ? value : current.x, axis === "y" ? value : current.y);
}

function updateGlobalPhotoCenter(x, y) {
  state.layout.photoPositionX = clampPercent(x, state.layout.photoPositionX ?? 50);
  state.layout.photoPositionY = clampPercent(y, state.layout.photoPositionY ?? 50);
  applyLayoutVariables();
  saveLayout();
}

function photoCenterFromPointer(event, image) {
  const frame = image.closest(".photo-image-frame") || image;
  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const user = image.dataset.photoCenterUser || "";
  const current = userPhotoPosition(user);
  const zoomRatio = Math.max(0.01, current.zoom / 100);
  const clickX = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
  const clickY = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
  return {
    x: clampPercent(current.x + (clickX - current.x) / zoomRatio),
    y: clampPercent(current.y + (clickY - current.y) / zoomRatio)
  };
}

function handleDetailPhotoCenterClick(event) {
  const image = event.target.closest("img[data-photo-center-user]");
  if (!image) return false;
  const center = photoCenterFromPointer(event, image);
  if (!center) return false;
  if (event.shiftKey) {
    updateGlobalPhotoCenter(center.x, center.y);
  } else {
    updateUserPhotoCenter(image.dataset.photoCenterUser || "", center.x, center.y);
  }
  markProjectDirty();
  return true;
}

function resetUserPhotoPosition(user) {
  if (!user) return;
  delete state.userPhotoPositions[user];
  document.querySelectorAll(`[data-photo-user="${CSS.escape(user)}"]`).forEach(gallery => {
    gallery.style.removeProperty("--user-photo-position-x");
    gallery.style.removeProperty("--user-photo-position-y");
    gallery.style.removeProperty("--user-photo-zoom");
  });
  const globalPosition = userPhotoPosition(user);
  document.querySelectorAll(`.photo-position-controls[data-user="${CSS.escape(user)}"]`).forEach(controls => {
    controls.querySelectorAll(".user-photo-position").forEach(input => {
      const position = input.dataset.axis === "x" ? globalPosition.x : globalPosition.y;
      input.value = position;
      input.nextElementSibling.value = `${position}%`;
    });
    const hint = controls.querySelector(".photo-center-hint");
    if (hint) hint.textContent = `中心 ${globalPosition.x}%, ${globalPosition.y}%`;
    controls.querySelectorAll(".user-photo-zoom").forEach(input => {
      input.value = globalPosition.zoom;
      const output = controls.querySelector(".user-photo-zoom-value");
      if (output) output.value = `${globalPosition.zoom}%`;
    });
    controls.querySelector(".photo-position-reset")?.setAttribute("disabled", "");
  });
}

function resetAllUserPhotoPositions() {
  if (!Object.keys(state.userPhotoPositions || {}).length) return false;
  state.userPhotoPositions = {};
  document.querySelectorAll("[data-photo-user]").forEach(gallery => {
    gallery.style.removeProperty("--user-photo-position-x");
    gallery.style.removeProperty("--user-photo-position-y");
    gallery.style.removeProperty("--user-photo-zoom");
  });
  render();
  return true;
}

function selectedUsersFromHeader(root = els.detailHead) {
  return [...root.querySelectorAll(".user-filter-checkbox:checked")].map(input => input.value);
}

function filteredRows() {
  const allowedUsers = Array.isArray(state.userFilter) ? new Set(state.userFilter.map(String)) : null;
  return state.rows.filter(row => {
    if (allowedUsers && !allowedUsers.has(String(row[state.userIdField] ?? ""))) return false;
    return Object.entries(state.columnFilters).every(([field, value]) =>
      !value || String(row[field] ?? "") === value
    );
  });
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
    report.items.slice(0, 12).map(item => `<div class="quality-item ${attrEscape(item.severity)}">
      <strong>${item.severity === "error" ? "错误" : "提醒"}</strong>
      <span>${escapeHtml(item.message)}</span>
    </div>`).join("") +
    (report.items.length > 12 ? `<div class="quality-more">还有 ${report.items.length - 12} 条问题未展开。</div>` : "") :
    `<div class="quality-empty">当前数据通过基础检查：用户编号、设备条件、评分范围和组间变量一致性均正常。</div>`;
}

function renderPivot(groups) {
  const summaryFields = ["satisfaction_score", "comfort_score", "stability_score"].filter(field => state.headers.includes(field));
  els.pivotHead.innerHTML = `<tr>
    <th>${escapeHtml(fieldLabels[state.primaryDimension] || state.primaryDimension)}</th>
    ${state.secondaryDimension ? `<th>${escapeHtml(fieldLabels[state.secondaryDimension] || state.secondaryDimension)}</th>` : ""}
    <th>记录数</th><th>${escapeHtml(fieldLabels[state.metric] || state.metric)}均值</th>
    ${summaryFields.map(field => `<th>${escapeHtml(fieldLabels[field] || field)}</th>`).join("")}
  </tr>`;
  els.pivotBody.innerHTML = groups.map(group => `
    <tr data-group-key="${attrEscape(group.key)}" class="${state.selectedGroup === group.key ? "active" : ""}">
      <td class="pivot-key">${escapeHtml(group.values[0])}</td>
      ${state.secondaryDimension ? `<td>${escapeHtml(group.values[1])}</td>` : ""}
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
    <div class="y-axis-title">${escapeHtml(fieldLabels[metric] || metric)}均值</div>
    <div class="y-axis">${ticks.map(tick => `<span style="top:${(axisMax - tick) / range * 100}%">${tick.toFixed(1)}</span>`).join("")}</div>
    <div class="plot-area">
      <div class="grid-lines">${ticks.map(tick => `<i style="top:${(axisMax - tick) / range * 100}%"></i>`).join("")}</div>
      <div class="column-chart">${summaries.slice(0, 12).map(({ group, mean, sd, n }) => {
    const value = mean;
    const errorTop = Math.max(0, Math.min(100, (axisMax - (mean + sd)) / range * 100));
    const errorBottom = Math.max(0, Math.min(100, (axisMax - (mean - sd)) / range * 100));
    return `<div class="column-item" title="${attrEscape(group.values.join(" / "))}：${value.toFixed(1)} ± ${sd.toFixed(1)}，n=${n}">
      <span class="column-value">${value.toFixed(1)}</span>
      ${state.showErrorBars ? `<span class="error-bar" style="top:${errorTop}%;height:${Math.max(0, errorBottom - errorTop)}%"></span>` : ""}
      <div class="column-bar" style="height:${Math.max(0, (value - axisMin) / range * 100)}%"></div>
      <span class="column-label">${escapeHtml(group.values.join(" / "))}<small>n=${n}</small></span>
    </div>`;
  }).join("")}</div>
    </div>
    <div class="x-axis-title">${escapeHtml(fieldLabels[state.primaryDimension] || state.primaryDimension)}${state.secondaryDimension ? ` × ${escapeHtml(fieldLabels[state.secondaryDimension] || state.secondaryDimension)}` : ""}</div>
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

function pressureUserNameField() {
  return state.headers.find(field => field !== state.userIdField && /^(name|姓名|user_name|用户姓名)$/i.test(field)) || "";
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
      postauricular: [206, 165],
      "auricle-front": [116, 135],
      "auricle-upper": [176, 70],
      "postauricular-middle": [205, 172],
      "lobe-rear": [172, 286],
      "auricle-outer": [226, 156]
    },
    rear: {
      postauricular: [148, 175],
      helix: [188, 94],
      "upper-ear": [170, 78],
      lobe: [150, 280],
      "auricle-front": [118, 145],
      "auricle-upper": [176, 78],
      "postauricular-middle": [154, 178],
      "lobe-rear": [155, 286],
      "auricle-outer": [198, 152]
    },
    top: {
      "upper-ear": [158, 116],
      helix: [210, 130],
      postauricular: [145, 186],
      concha: [160, 158],
      "auricle-front": [174, 128],
      "auricle-upper": [158, 100],
      "postauricular-middle": [144, 184],
      "lobe-rear": [150, 242],
      "auricle-outer": [214, 144]
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

function radarPoint(center, radius, index, total, value) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, total);
  const distance = radius * Math.max(0, Math.min(10, value)) / 10;
  return [
    center + Math.cos(angle) * distance,
    center + Math.sin(angle) * distance
  ];
}

function radarPolygonPoints(sites, metric) {
  const center = 210;
  const radius = 130;
  return sites.map((site, index) => {
    const [x, y] = radarPoint(center, radius, index, sites.length, site[metric]);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function radarSignedPoint(center, radius, index, total, value, maxAbs) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index / total);
  const normalized = maxAbs > 0 ? (value + maxAbs) / (2 * maxAbs) : 0.5;
  const distance = radius * Math.max(0, Math.min(1, normalized));
  return [
    center + Math.cos(angle) * distance,
    center + Math.sin(angle) * distance
  ];
}

function radarSignedPolygonPoints(sites, maxAbs) {
  const center = 210;
  const radius = 130;
  return sites.map((site, index) => {
    const [x, y] = radarSignedPoint(center, radius, index, sites.length, site.meanDiff, maxAbs);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function pressureRadarSampleGroups(site) {
  const groups = new Map();
  (site.samples || []).forEach(sample => {
    const key = Number(sample.score).toFixed(1);
    if (!groups.has(key)) groups.set(key, { score: Number(sample.score), users: [] });
    if (sample.user) groups.get(key).users.push(sample.user);
  });
  return [...groups.values()].sort((a, b) => a.score - b.score);
}

function renderPressureRadarCard(deviceRadar) {
  const sites = deviceRadar.sites;
  const center = 210;
  const radius = 130;
  const minSite = [...sites].sort((a, b) => a.minScore - b.minScore || a.meanScore - b.meanScore)[0];
  const gridValues = [2, 4, 6, 8, 10];
  const grid = gridValues.map(value =>
    `<circle class="pressure-radar-ring" cx="${center}" cy="${center}" r="${radius * value / 10}"></circle>`
  ).join("");
  const scaleLabels = [0, ...gridValues].map(value => {
    const y = center - radius * value / 10;
    return `<text class="pressure-radar-scale" x="${center + 8}" y="${y.toFixed(1)}" text-anchor="start">${value}</text>`;
  }).join("");
  const axes = sites.map((site, index) => {
    const [x, y] = radarPoint(center, radius, index, sites.length, 10);
    const [labelX, labelY] = radarPoint(center, radius + 32, index, sites.length, 10);
    const anchor = Math.abs(labelX - center) < 8 ? "middle" : labelX > center ? "start" : "end";
    return `<g>
      <line class="pressure-radar-axis" x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>
      <text class="pressure-radar-label" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${escapeHtml(site.label)}</text>
    </g>`;
  }).join("");
  const samples = sites.map((site, index) =>
    pressureRadarSampleGroups(site).map(group => {
      const [x, y] = radarPoint(center, radius, index, sites.length, group.score);
      const users = [...new Set(group.users.filter(Boolean))];
      const names = users.length ? users.join("，") : "未记录姓名";
      const dotRadius = Math.min(6.5, 2.5 + Math.sqrt(Math.max(1, group.users.length)) * 1.15);
      return `<circle class="pressure-radar-sample" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius.toFixed(1)}">
        <title>${escapeHtml(site.label)} · 原始分数 ${group.score.toFixed(1)}：${group.users.length} 人 · ${escapeHtml(names)}</title>
      </circle>`;
    }).join("")
  ).join("");
  return `<article class="pressure-radar-card">
    <div class="pressure-radar-title">
      <strong>${escapeHtml(deviceRadar.device)}</strong>
      <small>${sites.length} 个位点 · 最低 ${minSite ? `${escapeHtml(minSite.label)} ${minSite.minScore.toFixed(1)}` : "无数据"}</small>
    </div>
    <svg viewBox="0 0 420 420" role="img" aria-label="${attrEscape(`${deviceRadar.device}挤压雷达图`)}">
      ${grid}
      ${axes}
      ${scaleLabels}
      <polygon class="pressure-radar-mean" points="${radarPolygonPoints(sites, "meanScore")}"></polygon>
      <polygon class="pressure-radar-min" points="${radarPolygonPoints(sites, "minScore")}"></polygon>
      ${samples}
    </svg>
    <div class="pressure-radar-legend">
	      <span><i class="mean"></i>平均原始分数</span>
	      <span><i class="min"></i>最低原始分数</span>
	    </div>
	  </article>`;
}

function renderPressureRadarDiffCard(radar) {
  if (radar.length < 2) return "";
  const [deviceA, deviceB] = radar;
  const sitesB = new Map(deviceB.sites.map(site => [site.siteKey, site]));
  const sites = deviceA.sites
    .map(siteA => {
      const siteB = sitesB.get(siteA.siteKey);
      if (!siteB) return null;
      return {
        siteKey: siteA.siteKey,
        label: siteA.label,
        meanDiff: siteB.meanScore - siteA.meanScore,
        meanA: siteA.meanScore,
        meanB: siteB.meanScore
      };
    })
    .filter(Boolean);
  if (sites.length < 3) return "";
  const center = 210;
  const radius = 130;
  const maxAbs = Math.max(1, ...sites.map(site => Math.abs(site.meanDiff)));
  const grid = [0, maxAbs / 2, maxAbs].map((value, index) =>
    `<circle class="pressure-radar-ring ${index === 0 ? "zero" : ""}" cx="${center}" cy="${center}" r="${(radius * (value + maxAbs) / (2 * maxAbs)).toFixed(1)}"></circle>`
  ).join("");
  const scaleLabels = [
    { value: -maxAbs, r: 0 },
    { value: 0, r: radius / 2 },
    { value: maxAbs, r: radius }
  ].map(item => {
    const y = center - item.r;
    return `<text class="pressure-radar-scale" x="${center + 8}" y="${y.toFixed(1)}" text-anchor="start">${item.value > 0 ? "+" : ""}${item.value.toFixed(1)}</text>`;
  }).join("");
  const axes = sites.map((site, index) => {
    const [x, y] = radarPoint(center, radius, index, sites.length, 10);
    const [labelX, labelY] = radarPoint(center, radius + 34, index, sites.length, 10);
    const anchor = Math.abs(labelX - center) < 8 ? "middle" : labelX > center ? "start" : "end";
    return `<g>
      <line class="pressure-radar-axis" x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>
      <text class="pressure-radar-label" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">
        <title>${escapeHtml(site.label)} · ${escapeHtml(deviceB.device)} - ${escapeHtml(deviceA.device)} = ${site.meanDiff.toFixed(1)}</title>
        ${escapeHtml(site.label)}
      </text>
    </g>`;
  }).join("");
  const values = sites.map((site, index) => {
    const [x, y] = radarSignedPoint(center, radius, index, sites.length, site.meanDiff, maxAbs);
    return `<circle class="pressure-radar-diff-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4">
      <title>${escapeHtml(site.label)}：${escapeHtml(deviceB.device)} ${site.meanB.toFixed(1)} - ${escapeHtml(deviceA.device)} ${site.meanA.toFixed(1)} = ${site.meanDiff.toFixed(1)}</title>
    </circle>`;
  }).join("");
  return `<article class="pressure-radar-card pressure-radar-diff-card">
    <div class="pressure-radar-title">
      <strong>设备差值雷达</strong>
      <small>${escapeHtml(deviceB.device)} - ${escapeHtml(deviceA.device)} · 平均原始分数差</small>
    </div>
    <svg viewBox="0 0 420 420" role="img" aria-label="${attrEscape(`${deviceB.device}减${deviceA.device}挤压平均分差雷达图`)}">
      ${grid}
      ${axes}
      ${scaleLabels}
      <polygon class="pressure-radar-diff" points="${radarSignedPolygonPoints(sites, maxAbs)}"></polygon>
      ${values}
    </svg>
    <div class="pressure-radar-legend">
      <span><i class="diff"></i>平均分差：${escapeHtml(deviceB.device)} - ${escapeHtml(deviceA.device)}</span>
    </div>
  </article>`;
}

function renderPressureRadar(rows, fields) {
  if (!els.pressureRadar) return;
  const radar = Core.pressureRadarByDevice(rows, fields, deviceField(), {
    labels: fieldLabels,
    userField: state.userIdField,
    userNameField: pressureUserNameField()
  });
  els.pressureRadar.innerHTML = radar.length ?
    [renderPressureRadarDiffCard(radar), ...radar.map(renderPressureRadarCard)].filter(Boolean).join("") :
    '<div class="empty-state">当前筛选条件下没有可绘制的设备挤压雷达。</div>';
}

function renderPressureMechanism() {
  if (!els.pressureHeatmaps) return;
  refreshPressureControls();
  const fields = pressureFields();
  const rows = pressureMechanismRows();
  if (!state.rows.length) {
    els.pressureSummary.textContent = "尚未加载数据";
    if (els.pressureRadar) els.pressureRadar.innerHTML = '<div class="empty-state">请先在 01 页加载项目或应用照片映射数据。</div>';
    els.pressureHeatmaps.innerHTML = '<div class="empty-state">请先在 01 页加载项目或应用照片映射数据。</div>';
    els.pressureRanking.innerHTML = "";
    return;
  }
  if (!fields.length) {
    els.pressureSummary.textContent = "未识别到挤压字段";
    if (els.pressureRadar) els.pressureRadar.innerHTML = '<div class="empty-state">请在 02 页“字段角色”中把挤压列设为“挤压程度”。</div>';
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
  renderPressureRadar(rows, fields);
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

function refreshComparisonControls() {
  if (!els.comparisonMetricSelect) return;
  const compareDeviceField = deviceField();
  const devices = compareDeviceField ? unique(compareDeviceField) : [];
  const previousMetric = state.comparisonMetric || state.metric;
  fillSelect(els.comparisonMetricSelect, state.metricFields, false, fieldLabels);
  state.comparisonMetric = state.metricFields.includes(previousMetric) ? previousMetric : state.metricFields[0] || "";
  els.comparisonMetricSelect.value = state.comparisonMetric;

  fillSelect(els.comparisonDeviceA, devices, false, fieldLabels);
  fillSelect(els.comparisonDeviceB, devices, false, fieldLabels);
  els.comparisonAutoDevices.checked = state.comparisonAutoDevices;
  els.comparisonDeviceA.disabled = state.comparisonAutoDevices;
  els.comparisonDeviceB.disabled = state.comparisonAutoDevices;
  if (!devices.includes(state.comparisonDeviceA)) state.comparisonDeviceA = devices[0] || "";
  if (!devices.includes(state.comparisonDeviceB) || state.comparisonDeviceB === state.comparisonDeviceA) {
    state.comparisonDeviceB = devices.find(device => device !== state.comparisonDeviceA) || "";
  }
  els.comparisonDeviceA.value = state.comparisonDeviceA;
  els.comparisonDeviceB.value = state.comparisonDeviceB;
  els.comparisonThreshold.value = state.comparisonThreshold;
}

function comparisonScore(value, preferred) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `<span class="preference-score ${preferred ? "good" : ""}">${Number(value).toFixed(1)}</span>`;
}

function comparisonProfile(userRows = []) {
  const row = userRows[0] || {};
  const fields = state.layout.columns.filter(column =>
    column.userLevel && !column.derived && !column.photo && column.id !== state.userIdField
  ).slice(0, 6);
  return `<div class="profile-tags">${fields.map(column =>
    row[column.id] === "" || row[column.id] == null ? "" : `<span class="profile-tag"><b>${attrEscape(column.label)}</b>${attrEscape(row[column.id])}</span>`
  ).join("") || "—"}</div>`;
}

function comparisonPressure(rows = []) {
  const fields = pressureFields();
  if (!fields.length) return "—";
  const tags = rows.flatMap(row => fields.map(field =>
    pressureTag(Core.pressureSiteLabel(field, fieldLabels[field]), row[field])
  )).filter(Boolean);
  return `<div class="pressure-tags">${tags.slice(0, 8).join("") || "—"}</div>`;
}

function comparisonPhotoStrip(item, result) {
  const rows = [
    { label: result.deviceA || "设备 A", row: item.rowsA[0] },
    { label: result.deviceB || "设备 B", row: item.rowsB[0] }
  ];
  return `<div class="preference-photo-strip">${rows.map(({ label, row }) => {
    const selected = parsePhotoViewValue(state.globalView || state.photoFields[0] || "");
    const field = row && rowMatchesPhotoView(row, selected) ? selected.field : state.photoFields.find(photoField => row?.[photoField]);
    const src = field ? photoUrl(row[field]) : "";
    return `<figure>
      ${src ? `<img class="photo-preview-trigger" src="${attrEscape(src)}" alt="${attrEscape(`${item.user} ${label}`)}" loading="lazy" decoding="async" tabindex="0" role="button" data-preview-src="${attrEscape(src)}" data-preview-caption="${attrEscape(`${item.user} · ${label}`)}">` : `<div class="missing-photo">无图</div>`}
      <figcaption>${attrEscape(label)}</figcaption>
    </figure>`;
  }).join("")}</div>`;
}

function defaultComparisonGroupLayout() {
  return {
    fontSize: 11,
    photoSize: 72,
    columns: Object.fromEntries(comparisonTableColumns.map(column => [column.id, { visible: true, width: column.width }]))
  };
}

function comparisonGroupLayout(groupKey) {
  const defaults = defaultComparisonGroupLayout();
  const saved = state.comparisonGroupLayouts[groupKey] || {};
  const columns = { ...defaults.columns };
  Object.entries(saved.columns || {}).forEach(([id, value]) => {
    if (!columns[id]) return;
    columns[id] = {
      visible: typeof value.visible === "boolean" ? value.visible : columns[id].visible,
      width: Math.max(50, Math.min(500, Number(value.width) || columns[id].width))
    };
  });
  return {
    fontSize: Math.max(9, Math.min(18, Number(saved.fontSize) || defaults.fontSize)),
    photoSize: Math.max(50, Math.min(180, Number(saved.photoSize) || defaults.photoSize)),
    columns
  };
}

function comparisonTableSettings(groupKey, layout) {
  return `<details class="preference-table-config">
    <summary>表格设置</summary>
    <div class="preference-config-panel">
      <label>字号<input class="comparison-table-font" data-group-key="${attrEscape(groupKey)}" type="number" min="9" max="18" step="1" value="${layout.fontSize}"></label>
      <label>照片<input class="comparison-table-photo" data-group-key="${attrEscape(groupKey)}" type="number" min="50" max="180" step="10" value="${layout.photoSize}"></label>
      <div class="preference-column-toggles">
        ${comparisonTableColumns.map(column => {
          const columnLayout = layout.columns[column.id];
          return `<label>
            <input class="comparison-column-visible" data-group-key="${attrEscape(groupKey)}" data-column-id="${column.id}" type="checkbox" ${columnLayout.visible ? "checked" : ""}>
            ${column.label}
            <input class="comparison-column-width" data-group-key="${attrEscape(groupKey)}" data-column-id="${column.id}" type="number" min="50" max="500" step="10" value="${columnLayout.width}">
          </label>`;
        }).join("")}
      </div>
    </div>
  </details>`;
}

function renderComparisonGlobalColumns() {
  if (!els.comparisonGlobalColumns) return;
  const defaults = defaultComparisonGroupLayout();
  els.comparisonGlobalFontSize.value = defaults.fontSize;
  els.comparisonGlobalPhotoSize.value = defaults.photoSize;
  els.comparisonGlobalColumns.innerHTML = comparisonTableColumns.map(column => `
    <label>
      <input class="comparison-global-column-visible" data-column-id="${column.id}" type="checkbox" checked>
      ${column.label}
      <input class="comparison-global-column-width" data-column-id="${column.id}" type="number" min="50" max="500" step="10" value="${column.width}">
    </label>
  `).join("");
}

function comparisonVerdict(item, result) {
  if (item.scoreA == null || item.scoreB == null) return "数据不完整";
  if (item.diff > result.threshold) return "A设备好";
  if (item.diff < -result.threshold) return "B设备好";
  return "无明显差异";
}

function comparisonSuppressionRatio(result) {
  const counts = Object.fromEntries((result.groups || []).map(group => [group.key, group.n || 0]));
  const neutral = counts.close || 0;
  const numerator = (counts.aBetter || 0) + neutral;
  const denominator = (counts.bBetter || 0) + neutral;
  return {
    numerator,
    denominator,
    value: denominator ? numerator / denominator : null
  };
}

function comparisonDeviceRows(item, result) {
  const buildRows = (rows, device, side) => rows.length ? rows.map(row => ({ row, device, side, missing: false })) : [{ row: null, device, side, missing: true }];
  return [
    ...buildRows(item.rowsA || [], result.deviceA || "设备 A", "A"),
    ...buildRows(item.rowsB || [], result.deviceB || "设备 B", "B")
  ];
}

function comparisonCell(columnId, item, result, deviceRow, rowIndex, rowSpan) {
  const preferredA = item.diff != null && item.diff > 0;
  const preferredB = item.diff != null && item.diff < 0;
  const row = deviceRow.row || {};
  const score = deviceRow.side === "A" ? row[state.comparisonMetric] ?? item.scoreA : row[state.comparisonMetric] ?? item.scoreB;
  if (columnId === "user") return rowIndex === 0 ? `<td rowspan="${rowSpan}"><strong>${escapeHtml(item.user)}</strong></td>` : "";
  if (columnId === "verdict") return rowIndex === 0 ? `<td rowspan="${rowSpan}"><span class="preference-verdict ${attrEscape(result.groups.find(group => group.users.includes(item))?.key || "")}">${escapeHtml(comparisonVerdict(item, result))}</span></td>` : "";
  if (columnId === "device") return `<td><strong>${escapeHtml(deviceRow.device || "—")}</strong>${deviceRow.missing ? '<small class="preference-missing-row">缺少该设备数据</small>' : ""}</td>`;
  if (columnId === "score") return `<td>${comparisonScore(score, deviceRow.side === "A" ? preferredA : preferredB)}</td>`;
  if (columnId === "diff") return rowIndex === 0 ? `<td rowspan="${rowSpan}"><span class="preference-diff">${item.diff == null ? "—" : item.diff.toFixed(1)}</span></td>` : "";
  if (columnId === "profile") return rowIndex === 0 ? `<td rowspan="${rowSpan}">${comparisonProfile(item.rows)}</td>` : "";
  if (columnId === "pressure") return `<td>${deviceRow.missing ? "—" : comparisonPressure([row])}</td>`;
  if (columnId === "photos") return rowIndex === 0 ? `<td class="photo-cell preference-photo-cell" rowspan="${rowSpan}">${item.rows.length ? photoGalleryContent({ label: "照片" }, item.rows) : "—"}</td>` : "";
  if (columnId === "note") return rowIndex === 0 ? userNoteCell(item.user, rowSpan) : "";
  return "<td>—</td>";
}

function renderComparisonDetails(result) {
  els.comparisonDetails.innerHTML = result.groups.map(group => `
    ${(() => {
      const verdictByUser = new Map(group.users.map(item => [String(item.user), {
        verdict: comparisonVerdict(item, result),
        diff: item.diff,
        groupKey: group.key
      }]));
      const table = buildDetailTableParts(group.rows, group.rows, {
        extraColumns: [comparisonVerdictColumn],
        verdictByUser
      });
      return `<section class="preference-detail-group" data-group-key="${attrEscape(group.key)}">
      <header>
        <h3>${attrEscape(group.label)}</h3>
        <span>${group.n} 位用户 · ${group.meanDiff == null ? "差值 —" : `平均差值 ${group.meanDiff.toFixed(1)}`}</span>
      </header>
      <div class="detail-table-wrap preference-detail-table-wrap">
        <table class="detail-table preference-detail-table">
          <colgroup>${table.colgroup}</colgroup>
          <thead>${table.head}</thead>
          <tbody>${table.body}</tbody>
        </table>
      </div>
    </section>`;
    })()}
  `).join("");
  observeDetailPhotos();
}

function renderComparisonPreference() {
  if (!els.comparisonMetricSelect) return;
  refreshComparisonControls();
  const compareDeviceField = deviceField();
  if (!state.rows.length) {
    els.comparisonSummary.textContent = "尚未加载数据";
    els.comparisonDeviceRanking.innerHTML = '<div class="empty-state">请先加载项目或应用照片映射数据。</div>';
    els.comparisonGroupCards.innerHTML = "";
    els.comparisonDetails.innerHTML = "";
    return;
  }
  if (!compareDeviceField || !state.comparisonMetric) {
    els.comparisonSummary.textContent = "缺少设备字段或评分指标";
    els.comparisonDeviceRanking.innerHTML = '<div class="empty-state">请在 02 页字段角色中确认设备字段和评分指标。</div>';
    els.comparisonGroupCards.innerHTML = "";
    els.comparisonDetails.innerHTML = "";
    return;
  }

  const result = Core.compareDevicesWithinUsers(filteredRows(), {
    userField: state.userIdField,
    deviceField: compareDeviceField,
    metric: state.comparisonMetric,
    deviceA: state.comparisonAutoDevices ? "" : state.comparisonDeviceA,
    deviceB: state.comparisonAutoDevices ? "" : state.comparisonDeviceB,
    threshold: state.comparisonThreshold
  });
  if (state.comparisonAutoDevices) {
    state.comparisonDeviceA = result.deviceA;
    state.comparisonDeviceB = result.deviceB;
    els.comparisonDeviceA.value = result.deviceA;
    els.comparisonDeviceB.value = result.deviceB;
  }

  const metricLabel = fieldLabels[state.comparisonMetric] || state.comparisonMetric;
  els.comparisonTitle.textContent = `${result.deviceA || "设备 A"} vs ${result.deviceB || "设备 B"} · ${metricLabel}`;
  els.comparisonSummary.textContent = `${result.eligibleUsers} 位可配对用户 · ${result.incompleteUsers} 位数据不完整`;
  els.comparisonDeviceRanking.innerHTML = result.devices.length ? result.devices.slice(0, 8).map((item, index) => `
    <div class="preference-rank-row ${item.device === result.deviceA ? "best" : item.device === result.deviceB ? "worst" : ""}">
      <b>${index + 1}</b>
      <strong>${attrEscape(item.device)}</strong>
      <span>${item.mean.toFixed(1)} ± ${item.sd.toFixed(1)} · n=${item.n}</span>
    </div>
  `).join("") : '<div class="empty-state">当前数据没有可排名设备。</div>';

  const ratio = comparisonSuppressionRatio(result);
  els.comparisonGroupCards.innerHTML = `<div class="preference-ratio-badge">
    <span>压制比</span>
    <strong>${ratio.value == null ? "—" : ratio.value.toFixed(2)}</strong>
    <small>(${ratio.numerator} / ${ratio.denominator})</small>
  </div>` + result.groups.map(group => `
    <article class="preference-group-card ${group.key}">
      <h3>${attrEscape(group.label)}</h3>
      <div class="group-count">${group.n}</div>
      <p>${group.meanA == null ? "A均值 —" : `A均值 ${group.meanA.toFixed(1)}`} · ${group.meanB == null ? "B均值 —" : `B均值 ${group.meanB.toFixed(1)}`}</p>
      <p>${group.meanDiff == null ? "平均差值 —" : `平均差值 ${group.meanDiff.toFixed(1)}`} · 阈值 ${result.threshold}</p>
    </article>
  `).join("");
  renderComparisonDetails(result);
}

function photoCompareVariables() {
  return state.headers.filter(isPhotoCompareGroupField);
}

function photoCompareLevels(field = state.photoCompareVariable) {
  if (!field) return [];
  return photoCompareFieldValues(field);
}

function refreshPhotoCompareControls() {
  if (!els.photoCompareVariable) return;
  const variables = photoCompareVariables();
  if (!variables.includes(state.photoCompareVariable)) state.photoCompareVariable = variables[0] || "";
  fillSelect(els.photoCompareVariable, variables, false, fieldLabels);
  els.photoCompareVariable.value = state.photoCompareVariable;

  const levels = photoCompareLevels();
  if (!levels.includes(state.photoCompareLevelA)) state.photoCompareLevelA = levels[0] || "";
  if (!levels.includes(state.photoCompareLevelB) || state.photoCompareLevelB === state.photoCompareLevelA) {
    state.photoCompareLevelB = levels.find(level => level !== state.photoCompareLevelA) || levels[1] || "";
  }
  fillSelect(els.photoCompareLevelA, levels, false, {});
  fillSelect(els.photoCompareLevelB, levels, false, {});
  els.photoCompareLevelA.value = state.photoCompareLevelA;
  els.photoCompareLevelB.value = state.photoCompareLevelB;

  const viewOptions = photoViewOptions();
  const validViews = viewOptions.map(option => option.value);
  if (!validViews.includes(state.photoCompareView)) {
    state.photoCompareView = validViews.includes(state.globalView) ? state.globalView : validViews[0] || "";
  }
  els.photoCompareView.innerHTML = viewOptions.map(option =>
    `<option value="${attrEscape(option.value)}" ${option.value === state.photoCompareView ? "selected" : ""}>${escapeHtml(option.label)}</option>`
  ).join("");
  const tune = (input, output, value, suffix = "") => {
    if (!input) return;
    input.value = value;
    if (output) output.value = `${value}${suffix}`;
  };
  tune(els.photoComparePhotoSize, els.photoComparePhotoSizeValue, state.photoComparePhotoSize, "px");
  tune(els.photoComparePositionX, els.photoComparePositionXValue, state.photoComparePositionX, "%");
  tune(els.photoComparePositionY, els.photoComparePositionYValue, state.photoComparePositionY, "%");
  tune(els.photoCompareZoom, els.photoCompareZoomValue, state.photoCompareZoom, "%");
}

function photoCompareRowForView(rows = [], viewValue = state.photoCompareView) {
  const selected = parsePhotoViewValue(viewValue || state.globalView || state.photoFields[0] || "");
  return rows.find(row => rowMatchesPhotoView(row, selected)) ||
    rows.find(row => state.photoFields.some(field => row[field])) ||
    null;
}

function photoComparePanelSettings(side) {
  const panel = state.photoComparePanelSettings?.[side] || {};
  return {
    view: panel.view || state.photoCompareView || state.globalView || state.photoFields[0] || "",
    photoSize: Math.max(90, Math.min(260, Number(panel.photoSize) || state.photoComparePhotoSize || 150)),
    positionX: clampPercent(panel.positionX, state.photoComparePositionX),
    positionY: clampPercent(panel.positionY, state.photoComparePositionY),
    zoom: clampPhotoZoom(panel.zoom, state.photoCompareZoom)
  };
}

function setPhotoComparePanelSetting(side, key, value) {
  const next = { ...(state.photoComparePanelSettings?.[side] || {}) };
  if (key === "view") next.view = value || "";
  if (key === "photoSize") next.photoSize = Math.max(90, Math.min(260, Number(value) || state.photoComparePhotoSize));
  if (key === "positionX") next.positionX = clampPercent(value, state.photoComparePositionX);
  if (key === "positionY") next.positionY = clampPercent(value, state.photoComparePositionY);
  if (key === "zoom") next.zoom = clampPhotoZoom(value, state.photoCompareZoom);
  state.photoComparePanelSettings = { ...state.photoComparePanelSettings, [side]: next };
}

function photoCompareFigure(user, row, panel) {
  const viewValue = panel.view || state.photoCompareView || "";
  const selected = parsePhotoViewValue(viewValue);
  const field = row && rowMatchesPhotoView(row, selected) ? selected.field :
    state.photoFields.find(photoField => row?.[photoField]);
  const src = field ? photoUrl(row[field]) : "";
  const caption = [user, state.viewLabels[field] || ""].filter(Boolean).join(" · ");
  return `<figure class="photo-compare-figure">
    <figcaption>${escapeHtml(user || "—")}</figcaption>
    <div class="photo-compare-frame">
      ${src ? `<img class="photo-preview-trigger" src="${attrEscape(src)}" alt="${attrEscape(caption)}" loading="lazy" decoding="async" tabindex="0" role="button" data-preview-src="${attrEscape(src)}" data-preview-caption="${attrEscape(caption)}">` : `<div class="missing-photo">无图</div>`}
    </div>
  </figure>`;
}

function photoCompareRowsForLevel(level, panel) {
  const variable = state.photoCompareVariable;
  if (!variable || !level) return [];
  const users = new Map();
  filteredRows().forEach(row => {
    const user = cleanPhotoCompareValue(row[state.userIdField]);
    if (cleanPhotoCompareValue(row[variable]) !== cleanPhotoCompareValue(level)) return;
    if (!user) return;
    if (!users.has(user)) users.set(user, []);
    users.get(user).push(row);
  });
  const order = new Map(syncUserOrder([...users.keys()]).map((user, index) => [String(user), index]));
  return [...users.entries()]
    .sort(([userA], [userB]) => (order.get(String(userA)) ?? 0) - (order.get(String(userB)) ?? 0))
    .map(([user, rows]) => ({ user, row: photoCompareRowForView(rows, panel.view), hasPhoto: Boolean(photoCompareRowForView(rows, panel.view)) }));
}

function renderPhotoComparePanel(side, level) {
  const panel = photoComparePanelSettings(side);
  const rows = photoCompareRowsForLevel(level, panel);
  const shown = rows.filter(item => item.hasPhoto);
  const viewOptions = photoViewOptions();
  const style = `--compare-photo-size:${panel.photoSize}px;--compare-position-x:${panel.positionX}%;--compare-position-y:${panel.positionY}%;--compare-zoom:${panel.zoom / 100};`;
  return `<section class="photo-compare-column" style="${attrEscape(style)}">
    <header class="photo-compare-column-head">
      <div>
        <span>${side === "a" ? "左侧水平" : "右侧水平"}</span>
        <h3>${escapeHtml(level || "—")}</h3>
        <small>${shown.length} / ${rows.length} 位有图</small>
      </div>
      <div class="photo-compare-panel-controls" data-photo-compare-side="${attrEscape(side)}">
        <label>视角<select class="photo-compare-side-control" data-setting="view">${viewOptions.map(option =>
          `<option value="${attrEscape(option.value)}" ${option.value === panel.view ? "selected" : ""}>${escapeHtml(option.label)}</option>`
        ).join("")}</select></label>
        <label>大小<input class="photo-compare-side-control" data-setting="photoSize" type="range" min="90" max="260" step="10" value="${panel.photoSize}"><output>${panel.photoSize}px</output></label>
        <label>横向<input class="photo-compare-side-control" data-setting="positionX" type="range" min="0" max="100" step="1" value="${panel.positionX}"><output>${panel.positionX}%</output></label>
        <label>纵向<input class="photo-compare-side-control" data-setting="positionY" type="range" min="0" max="100" step="1" value="${panel.positionY}"><output>${panel.positionY}%</output></label>
        <label>缩放<input class="photo-compare-side-control" data-setting="zoom" type="range" min="50" max="250" step="5" value="${panel.zoom}"><output>${panel.zoom}%</output></label>
      </div>
    </header>
    <div class="photo-compare-wall">
      ${shown.length ? shown.map(item => photoCompareFigure(item.user, item.row, panel)).join("") : '<div class="empty-state">当前水平没有匹配照片。</div>'}
    </div>
  </section>`;
}

function renderPhotoComparePage() {
  if (!els.photoCompareGrid) return;
  refreshPhotoCompareControls();
  if (!state.rows.length) {
    els.photoCompareTitle.textContent = "照片对比";
    els.photoCompareSummary.textContent = "尚未加载数据";
    els.photoCompareGrid.innerHTML = '<div class="empty-state">请先加载项目或应用照片映射数据。</div>';
    return;
  }
  if (!state.photoFields.length) {
    els.photoCompareTitle.textContent = "照片对比";
    els.photoCompareSummary.textContent = "当前数据没有照片字段";
    els.photoCompareGrid.innerHTML = '<div class="empty-state">请先在照片映射页生成并应用照片字段。</div>';
    return;
  }
  if (!state.photoCompareVariable) {
    els.photoCompareTitle.textContent = "照片对比";
    els.photoCompareSummary.textContent = "没有可对比变量";
    els.photoCompareGrid.innerHTML = '<div class="empty-state">当前数据没有至少两个水平的组间变量；设备、条件等组内变量请在详情页比较。</div>';
    return;
  }

  const variableLabel = fieldLabels[state.photoCompareVariable] || state.photoCompareVariable;
  els.photoCompareTitle.textContent = `${variableLabel} · ${state.photoCompareLevelA || "左侧"} vs ${state.photoCompareLevelB || "右侧"}`;
  els.photoCompareSummary.textContent = `仅展示组间变量；组内设备/条件对比请使用 02 详情页。`;
  els.photoCompareGrid.innerHTML = `
    ${renderPhotoComparePanel("a", state.photoCompareLevelA)}
    ${renderPhotoComparePanel("b", state.photoCompareLevelB)}
  `;
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
  return `<span class="pressure-tag ${pressureClass(value)}" title="${attrEscape(pressureTitle(value))}">${escapeHtml(label)}：${score}</span>`;
}

function groupByUser(rows) {
  const users = new Map();
  rows.forEach(row => {
    const user = row[state.userIdField];
    if (!users.has(user)) users.set(user, []);
    users.get(user).push(row);
  });
  const order = new Map((state.userOrder || []).map((user, index) => [String(user), index]));
  return [...users.entries()]
    .sort(([userA], [userB]) => {
      const a = order.has(String(userA)) ? order.get(String(userA)) : Number.MAX_SAFE_INTEGER;
      const b = order.has(String(userB)) ? order.get(String(userB)) : Number.MAX_SAFE_INTEGER;
      return a - b;
    })
    .map(([, userRows]) => sortUserDeviceRows(userRows));
}

function syncUserOrder(users = allUserNames()) {
  const current = new Set(users.map(String));
  const ordered = (state.userOrder || []).filter(user => current.has(String(user))).map(String);
  users.map(String).forEach(user => {
    if (!ordered.includes(user)) ordered.push(user);
  });
  state.userOrder = ordered;
  return state.userOrder;
}

function moveUserOrder(draggedUser, targetUser) {
  if (!draggedUser || !targetUser || draggedUser === targetUser) return false;
  const users = syncUserOrder();
  const fromIndex = users.indexOf(String(draggedUser));
  const toIndex = users.indexOf(String(targetUser));
  if (fromIndex < 0 || toIndex < 0) return false;
  const [user] = users.splice(fromIndex, 1);
  users.splice(toIndex, 0, user);
  state.userOrder = users;
  return true;
}

function userNoteCell(user, rowSpan) {
  const note = state.userNotes[user] || "";
  return `<td class="user-note-cell" rowspan="${rowSpan}">
    <textarea class="user-note-input" data-user="${attrEscape(user)}" placeholder="添加备注…">${attrEscape(note)}</textarea>
  </td>`;
}

function sortUserDeviceRows(userRows = []) {
  const field = deviceField();
  if (!field || state.deviceOrderMode === "source") return userRows;
  return userRows.slice().sort((a, b) => {
    const result = String(a[field] || "").localeCompare(String(b[field] || ""), "zh-CN", { numeric: true, sensitivity: "base" });
    return state.deviceOrderMode === "desc" ? -result : result;
  });
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
      row[item.id] === "" ? "" : `<span class="profile-tag"><b>${escapeHtml(item.label)}</b>${escapeHtml(row[item.id])}</span>`
    ).join("") || "—"}</div></td>`;
  }
  if (fieldRole(field) === "pressure") {
    return `<td class="${classes}"><span class="pressure ${pressureClass(value)}" title="${attrEscape(pressureTitle(value))}">${value === "" ? "—" : `${escapeHtml(value)}分`}</span></td>`;
  }
  if (/score$|rating$|satisfaction|comfort|stability/i.test(field) && isNumericField(field)) {
    return `<td class="${classes}"><span class="score ${scoreClass(value)}">${escapeHtml(value) || "—"}</span></td>`;
  }
  return `<td class="${classes}">${field === state.userIdField ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(value) || "—"}</td>`;
}

function photoGalleryContent(column, userRows) {
  const user = userRows[0][state.userIdField];
  const deviceField = state.headers.includes("device_name") ? "device_name" :
    state.headers.find(field => /device|condition|设备|条件/i.test(field));
  const earField = earSideField();
  const userOptions = photoViewOptions(userRows);
  const selectedValue = state.userViews[user] || state.globalView || userOptions[0]?.value || state.photoFields[0];
  const selectedView = parsePhotoViewValue(selectedValue);
  const position = userPhotoPosition(user);
  const customPosition = Boolean(state.userPhotoPositions[user]);
  const customStyle = customPosition ?
    `--user-photo-position-x:${position.x}%;--user-photo-position-y:${position.y}%;--user-photo-zoom:${position.zoom / 100};` :
    "";
  const items = userRows.filter(row => rowMatchesPhotoView(row, selectedView)).map(row => {
    const caption = [earField ? row[earField] : "", row[deviceField] || column.label].filter(Boolean).join(" · ");
    const src = photoUrl(row[selectedView.field]);
    return `
    <figure class="photo-thumb">
      <span class="photo-image-frame">
        <img class="ear-photo detail-photo-lazy photo-preview-trigger" src="${detailPhotoPlaceholder()}" data-src="${attrEscape(src)}" alt="${attrEscape(`${row[state.userIdField]} ${caption}`)}" loading="lazy" decoding="async" tabindex="0" role="button" data-preview-src="${attrEscape(src)}" data-preview-caption="${attrEscape(`${row[state.userIdField]} ${caption}`)}" data-photo-center-user="${attrEscape(user)}">
      </span>
      <figcaption>${escapeHtml(caption)}</figcaption>
    </figure>`;
  }).join("");
  const options = userOptions.map(option =>
    `<option value="${attrEscape(option.value)}" ${state.userViews[user] === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
  ).join("");
  return `<div class="photo-cell-layout">
      <div class="photo-gallery" data-photo-user="${attrEscape(user)}" style="--photo-count:${Math.max(1, userRows.length)};${customStyle}">${items || "—"}</div>
      <aside class="photo-cell-controls" aria-label="${attrEscape(user)}照片显示控制">
        <select class="user-view-select" data-user="${attrEscape(user)}" aria-label="${attrEscape(user)}照片视角">
          <option value="">跟随全局</option>${options}
        </select>
        <div class="photo-position-controls" data-user="${attrEscape(user)}">
          <span class="photo-center-hint">中心 ${position.x}%, ${position.y}%</span>
          <label>缩放
            <input class="user-photo-zoom" data-user="${attrEscape(user)}" type="range" min="50" max="250" step="5" value="${position.zoom}">
            <output class="user-photo-zoom-value">${position.zoom}%</output>
          </label>
          <small>点击照片设为该用户中心；Shift 点击设为全局。</small>
          <button type="button" class="photo-position-reset" data-user="${attrEscape(user)}" ${customPosition ? "" : "disabled"}>跟随全局</button>
        </div>
      </aside>
    </div>`;
}

function photoGalleryCell(column, userRows) {
  return `<td class="photo-cell" rowspan="${userRows.length}">${photoGalleryContent(column, userRows)}</td>`;
}

function detailRows(allFilteredRows, groups) {
  if (!state.selectedGroup) return allFilteredRows;
  return groups.find(group => group.key === state.selectedGroup)?.rows || allFilteredRows;
}

function allUserNames() {
  return [...new Set(state.rows.map(row => row[state.userIdField]).filter(Boolean).map(String))]
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
}

function renderUserHeaderMenu(column) {
  const users = allUserNames();
  const selected = Array.isArray(state.userFilter) ? new Set(state.userFilter.map(String)) : new Set(users);
  return `<th><span>${escapeHtml(column.label)}</span>
    <details class="header-menu user-filter-menu">
      <summary>${selected.size}/${users.length} 用户</summary>
      <div class="header-menu-panel">
        <div class="header-menu-actions">
          <button type="button" class="user-filter-all">全选</button>
          <button type="button" class="user-filter-none">全不选</button>
        </div>
        <div class="user-filter-options">
          ${users.map(user => `<label><input class="user-filter-checkbox" type="checkbox" value="${attrEscape(user)}" ${selected.has(user) ? "checked" : ""}>${escapeHtml(user)}</label>`).join("")}
        </div>
      </div>
    </details>
  </th>`;
}

function renderDeviceHeaderMenu(column) {
  return `<th><span>${escapeHtml(column.label)}</span>
    <select class="device-order-select" aria-label="设备排序">
      <option value="source" ${state.deviceOrderMode === "source" ? "selected" : ""}>原始顺序</option>
      <option value="asc" ${state.deviceOrderMode === "asc" ? "selected" : ""}>设备名升序</option>
      <option value="desc" ${state.deviceOrderMode === "desc" ? "selected" : ""}>设备名降序</option>
    </select>
  </th>`;
}

function renderDetailHeaderCell(column, rows) {
  if (column.id === "__comparison_verdict") return `<th>${escapeHtml(column.label)}</th>`;
  if (column.id === "__user_note") return `<th class="user-note-head">${escapeHtml(column.label)}</th>`;
  if (column.derived || column.photo) return `<th>${escapeHtml(column.label)}</th>`;
  if (column.id === state.userIdField) return renderUserHeaderMenu(column);
  if (column.id === deviceField()) return renderDeviceHeaderMenu(column);
  const values = [...new Set(rows.map(row => row[column.id]).filter(value => value !== ""))].sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
  const options = values.length <= 80 ? values.map(value => `<option value="${attrEscape(value)}" ${state.columnFilters[column.id] === String(value) ? "selected" : ""}>${attrEscape(value)}</option>`).join("") : "";
  return `<th><span>${escapeHtml(column.label)}</span><select class="header-filter" data-field="${attrEscape(column.id)}" aria-label="${attrEscape(column.label)}筛选"><option value="">全部</option>${options}</select></th>`;
}

function comparisonVerdictDetailCell(column, userRows, verdictByUser) {
  const user = String(userRows[0]?.[state.userIdField] || "");
  const meta = verdictByUser?.get(user);
  const verdict = meta?.verdict || "—";
  return `<td class="comparison-verdict-cell" rowspan="${userRows.length}">
    <span class="preference-verdict ${attrEscape(meta?.groupKey || "")}">${escapeHtml(verdict)}</span>
    ${meta?.diff == null ? "" : `<small>A-B ${meta.diff.toFixed(1)}</small>`}
  </td>`;
}

function renderCustomDetailCell(column, userRows, rowIndex, context = {}) {
  if (column.id === "__comparison_verdict") {
    return rowIndex === 0 ? comparisonVerdictDetailCell(column, userRows, context.verdictByUser) : "";
  }
  return rowIndex === 0 ? `<td rowspan="${userRows.length}">—</td>` : "";
}

function buildDetailTableParts(visibleRows, sourceRows, options = {}) {
  const extraColumns = options.extraColumns || [];
  const visibleColumns = state.layout.columns.filter(column => column.visible);
  const tableColumns = [...extraColumns, ...visibleColumns];
  const maxPhotos = Math.max(1, ...groupByUser(visibleRows).map(userRows =>
    Math.max(...visibleColumns.filter(column => column.photo).map(column =>
      column.id === "__photo_view" ? userRows.filter(row => {
        const selectedValue = state.userViews[userRows[0][state.userIdField]] || state.globalView || photoViewOptions(userRows)[0]?.value;
        return rowMatchesPhotoView(row, parsePhotoViewValue(selectedValue)) || state.photoFields.some(field => row[field]);
      }).length : userRows.filter(row => row[column.id]).length
    ), 0)
  ));
  const photoControlWidth = detailPhotoMode() === "capture" ? 0 : 118;
  const columnWidths = tableColumns.map(column =>
    column.photo ? Math.max(column.width, maxPhotos * (state.layout.photoSize + 10) + photoControlWidth) : column.width
  );
  const totalWeight = columnWidths.reduce((sum, width) => sum + width, 0);
  const showSort = options.showSort !== false;
  const colgroup = `${showSort ? '<col class="user-sort-col" style="width:32px">' : ""}` +
    tableColumns.map((column, index) => `<col class="${column.id === "__user_note" ? "user-note-col" : ""}" style="width:${columnWidths[index] / totalWeight * 100}%">`).join("");
  const head = `<tr>${showSort ? '<th class="user-sort-head" title="拖动用户排序">排序</th>' : ""}${tableColumns.map(column => renderDetailHeaderCell(column, sourceRows)).join("")}</tr>`;
  const noUsersSelected = Array.isArray(state.userFilter) && state.userFilter.length === 0;
  const detailColumnCount = tableColumns.length + (showSort ? 1 : 0);
  const body = noUsersSelected ? `<tr><td colspan="${detailColumnCount}"><div class="empty-state error-state">没有用户信息被展示。请在用户列下拉菜单中至少勾选一个用户。</div></td></tr>` :
    visibleRows.length ? groupByUser(visibleRows).map(userRows =>
    userRows.map((row, rowIndex) => `<tr class="${rowIndex === 0 ? "user-group-start" : ""}" data-detail-user="${attrEscape(userRows[0][state.userIdField])}">
      ${showSort && rowIndex === 0 ? `<td class="user-sort-cell" rowspan="${userRows.length}"><button type="button" class="user-sort-handle" draggable="true" data-user="${attrEscape(userRows[0][state.userIdField])}" aria-label="拖动${attrEscape(userRows[0][state.userIdField])}排序">⋮⋮</button></td>` : ""}
      ${tableColumns.map(column => {
        if (column.custom) return renderCustomDetailCell(column, userRows, rowIndex, options);
        if (column.photo) return rowIndex === 0 ? photoGalleryCell(column, userRows) : "";
        if (column.id === "__user_note") return rowIndex === 0 ? userNoteCell(userRows[0][state.userIdField], userRows.length) : "";
        if (column.userLevel && rowIndex > 0) return "";
        const cell = detailCell(column, row);
        return column.userLevel ? cell.replace("<td", `<td rowspan="${userRows.length}"`) : cell;
      }).join("")}
    </tr>`).join("")
  ).join("") : `<tr><td colspan="${detailColumnCount}"><div class="empty-state">当前组内没有匹配记录。</div></td></tr>`;
  return { colgroup, head, body, visibleColumns: tableColumns, detailColumnCount };
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
  syncUserOrder();
  const table = buildDetailTableParts(visibleRows, rows);
  els.detailColgroup.innerHTML = table.colgroup;
  els.detailHead.innerHTML = table.head;
  els.detailBody.innerHTML = table.body;
  observeDetailPhotos();
}

function projectOptions() {
  saveActiveProjectTabSnapshot();
  return state.projectTabs
    .filter(tab => tab.snapshot?.rows?.length)
    .map(tab => ({ id: tab.id, title: tab.title || projectTabTitle(tab.path), snapshot: tab.snapshot }));
}

function projectContext(projectId) {
  const tab = state.projectTabs.find(item => item.id === projectId);
  const snapshot = tab?.snapshot;
  if (!snapshot) return null;
  const rows = cloneStateData(snapshot.rows || []);
  const headers = Object.keys(rows[0] || {});
  const fieldRoleOverrides = cloneStateData(snapshot.fieldRoleOverrides || {});
  const fieldRoles = Core.resolveFieldRoles(headers, rows, fieldRoleOverrides);
  const roleOf = field => fieldRoles[field] || Core.inferFieldRole(field, rows);
  const userIdField = headers.find(field => roleOf(field) === "user_id") || headers[0] || "";
  const photoFields = headers.filter(field => roleOf(field) === "photo");
  const layout = cloneStateData(snapshot.layout || defaultLayout());
  if (!Array.isArray(layout.columns) || !layout.columns.length) {
    layout.columns = headers.filter(field => field !== USER_NOTE_FIELD).map(field => ({
      id: field,
      label: fieldLabels[field] || field,
      width: defaultColumnWidth(field),
      visible: roleOf(field) !== "pressure" && roleOf(field) !== "photo" && roleOf(field) !== "ignore",
      userLevel: false,
      photo: photoFields.includes(field)
    }));
    if (photoFields.length) layout.columns.push({ id: "__photo_view", label: "照片", width: 360, visible: true, userLevel: true, photo: true, derived: true });
    layout.columns.push({ id: "__user_note", label: "备注", width: 150, visible: true, userLevel: true, photo: false, derived: true });
  }
  return {
    id: projectId,
    title: tab.title || projectTabTitle(tab.path),
    snapshot,
    rows,
    headers,
    fieldRoles,
    fieldRoleOverrides,
    userIdField,
    photoFields,
    layout,
    userViews: cloneStateData(snapshot.userViews || {}),
    globalView: snapshot.globalView || "",
    userNotes: cloneStateData(snapshot.userNotes || {}),
    mappingFiles: cloneStateData(snapshot.mappingFiles || []),
    photoRoot: snapshot.photoRoot || "",
    metricFields: headers.filter(field => roleOf(field) === "metric" && isNumericField(field)),
    deviceField: headers.find(field => roleOf(field) === "device") || headers.find(field => /device|condition|设备|条件|样机/i.test(field)) || ""
  };
}

function withProjectContext(project, callback) {
  const saved = {
    rows: state.rows,
    headers: state.headers,
    fieldRoles: state.fieldRoles,
    fieldRoleOverrides: state.fieldRoleOverrides,
    userIdField: state.userIdField,
    photoFields: state.photoFields,
    layout: state.layout,
    userViews: state.userViews,
    globalView: state.globalView,
    userNotes: state.userNotes,
    mappingFiles: state.mappingFiles,
    photoUrlByPath: state.photoUrlByPath,
    photoRelativeByUrl: state.photoRelativeByUrl,
    photoRoot: els.photoRootInput.value,
    userFilter: state.userFilter,
    deviceOrderMode: state.deviceOrderMode,
    userOrder: state.userOrder
  };
  state.rows = project.rows;
  state.headers = project.headers;
  state.fieldRoles = project.fieldRoles;
  state.fieldRoleOverrides = project.fieldRoleOverrides;
  state.userIdField = project.userIdField;
  state.photoFields = project.photoFields;
  state.layout = project.layout;
  state.userViews = project.userViews;
  state.globalView = project.globalView;
  state.userNotes = project.userNotes;
  state.mappingFiles = project.mappingFiles;
  state.userFilter = null;
  state.deviceOrderMode = project.snapshot.deviceOrderMode || "source";
  state.userOrder = cloneStateData(project.snapshot.userOrder || []);
  els.photoRootInput.value = project.photoRoot || "";
  rebuildPhotoPathIndex(project.mappingFiles);
  try {
    return callback();
  } finally {
    state.rows = saved.rows;
    state.headers = saved.headers;
    state.fieldRoles = saved.fieldRoles;
    state.fieldRoleOverrides = saved.fieldRoleOverrides;
    state.userIdField = saved.userIdField;
    state.photoFields = saved.photoFields;
    state.layout = saved.layout;
    state.userViews = saved.userViews;
    state.globalView = saved.globalView;
    state.userNotes = saved.userNotes;
    state.mappingFiles = saved.mappingFiles;
    state.photoUrlByPath = saved.photoUrlByPath;
    state.photoRelativeByUrl = saved.photoRelativeByUrl;
    state.userFilter = saved.userFilter;
    state.deviceOrderMode = saved.deviceOrderMode;
    state.userOrder = saved.userOrder;
    els.photoRootInput.value = saved.photoRoot;
  }
}

function renderProjectDetailTable(project, rows, empty = "没有匹配记录。") {
  if (!project || !rows.length) return `<div class="empty-state">${empty}</div>`;
  return withProjectContext(project, () => {
    const table = buildDetailTableParts(rows, rows, { showSort: false });
    return `<div class="detail-table-wrap multi-detail-table-wrap">
      <table class="detail-table multi-detail-table">
        <colgroup>${table.colgroup}</colgroup>
        <thead>${table.head}</thead>
        <tbody>${table.body}</tbody>
      </table>
    </div>`;
  });
}

function fillProjectSelect(select, selected = "") {
  const projects = projectOptions();
  if (!select) return;
  select.innerHTML = projects.map(project =>
    `<option value="${attrEscape(project.id)}" ${project.id === selected ? "selected" : ""}>${escapeHtml(project.title)}</option>`
  ).join("");
}

function rowsByUser(project, userField) {
  const map = new Map();
  project.rows.forEach(row => {
    const user = String(row[userField] || "").trim();
    if (!user) return;
    if (!map.has(user)) map.set(user, []);
    map.get(user).push(row);
  });
  return map;
}

function multiProjectPair() {
  const projects = projectOptions();
  const validIds = new Set(projects.map(project => project.id));
  if (!validIds.has(state.multiProjectA)) state.multiProjectA = projects[0]?.id || "";
  if (!validIds.has(state.multiProjectB) || state.multiProjectB === state.multiProjectA) {
    state.multiProjectB = projects.find(project => project.id !== state.multiProjectA)?.id || "";
  }
  const projectA = projectContext(state.multiProjectA);
  const projectB = projectContext(state.multiProjectB);
  return { projects, projectA, projectB };
}

function commonUserFields(projectA, projectB) {
  if (!projectA || !projectB) return [];
  const b = new Set(projectB.headers);
  const common = projectA.headers.filter(field => b.has(field));
  return common.filter(field => /user|name|姓名|用户|subject|participant|id/i.test(field))
    .concat(common.filter(field => !/user|name|姓名|用户|subject|participant|id/i.test(field)));
}

function matchMultiUsers(projectA, projectB, userField) {
  const byA = rowsByUser(projectA, userField);
  const byB = rowsByUser(projectB, userField);
  const usersA = new Set(byA.keys());
  const usersB = new Set(byB.keys());
  const matched = [...usersA].filter(user => usersB.has(user)).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  const onlyA = [...usersA].filter(user => !usersB.has(user)).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  const onlyB = [...usersB].filter(user => !usersA.has(user)).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  return { byA, byB, matched, onlyA, onlyB };
}

function renderMultiProjectSelectors() {
  fillProjectSelect(els.multiCompareProjectA, state.multiProjectA);
  fillProjectSelect(els.multiCompareProjectB, state.multiProjectB);
  fillProjectSelect(els.multiFlowProjectA, state.multiProjectA);
  fillProjectSelect(els.multiFlowProjectB, state.multiProjectB);
}

function renderMultiComparePage() {
  const { projects, projectA, projectB } = multiProjectPair();
  renderMultiProjectSelectors();
  if (!projectA || !projectB || projectA.id === projectB.id) {
    els.multiCompareSummary.textContent = projects.length < 2 ? "请至少打开两个包含数据的项目。" : "请选择两个不同项目。";
    els.multiMatchedDetails.innerHTML = '<div class="empty-state">等待项目选择。</div>';
    els.multiOnlyA.innerHTML = "";
    els.multiOnlyB.innerHTML = "";
    return null;
  }
  const fields = commonUserFields(projectA, projectB);
  if (!fields.includes(state.multiUserField)) state.multiUserField = fields.find(field => field === projectA.userIdField) || fields[0] || "";
  els.multiCompareUserField.innerHTML = fields.map(field =>
    `<option value="${attrEscape(field)}" ${field === state.multiUserField ? "selected" : ""}>${escapeHtml(fieldLabels[field] || field)}</option>`
  ).join("");
  if (!state.multiUserField) {
    els.multiCompareSummary.textContent = "两个项目没有可共同匹配的用户字段。";
    return null;
  }
  const match = matchMultiUsers(projectA, projectB, state.multiUserField);
  els.multiCompareSummary.textContent = `${projectA.title} vs ${projectB.title}：匹配 ${match.matched.length} 人，仅项目 1 ${match.onlyA.length} 人，仅项目 2 ${match.onlyB.length} 人。`;
  els.multiMatchedDetails.innerHTML = match.matched.length ? match.matched.map(user => `
    <section class="multi-user-pair">
      <h3>${escapeHtml(user)}</h3>
      <div class="multi-user-columns">
        <article><strong>${escapeHtml(projectA.title)}</strong>${renderProjectDetailTable(projectA, match.byA.get(user) || [])}</article>
        <article><strong>${escapeHtml(projectB.title)}</strong>${renderProjectDetailTable(projectB, match.byB.get(user) || [])}</article>
      </div>
    </section>
  `).join("") : '<div class="empty-state">没有匹配用户。</div>';
  els.multiOnlyA.innerHTML = renderProjectDetailTable(projectA, match.onlyA.flatMap(user => match.byA.get(user) || []), "没有仅项目 1 用户。");
  els.multiOnlyB.innerHTML = renderProjectDetailTable(projectB, match.onlyB.flatMap(user => match.byB.get(user) || []), "没有仅项目 2 用户。");
  observeDetailPhotos();
  return { projectA, projectB, match };
}

function uniqueDeviceValues(project) {
  if (!project?.deviceField) return [];
  return [...new Set(project.rows.map(row => row[project.deviceField]).filter(Boolean).map(String))]
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
}

function fillMetricSelect(select, project, selected) {
  if (!select) return "";
  const metrics = project?.metricFields || [];
  const value = metrics.includes(selected) ? selected : (metrics.includes(project?.snapshot?.comparisonMetric) ? project.snapshot.comparisonMetric : metrics[0] || "");
  select.innerHTML = metrics.map(metric =>
    `<option value="${attrEscape(metric)}" ${metric === value ? "selected" : ""}>${escapeHtml(fieldLabels[metric] || metric)}</option>`
  ).join("");
  return value;
}

function ensureFlowMappings(devicesA, devicesB) {
  state.multiFlowMappings = (state.multiFlowMappings || []).filter(item => devicesA.includes(item.a) && devicesB.includes(item.b));
  if (!state.multiFlowMappings.length && devicesA.length && devicesB.length) {
    const count = Math.min(devicesA.length, devicesB.length);
    state.multiFlowMappings = Array.from({ length: count }, (_, index) => ({ a: devicesA[index], b: devicesB[index], label: "" }));
  }
}

function flowMappingDefaultLabel(mapping = {}) {
  return String(mapping.a || mapping.b || "未命名设备组");
}

function flowMappingLabel(mapping = {}) {
  const label = String(mapping.label || "").trim();
  return label || flowMappingDefaultLabel(mapping);
}

function renderFlowMappingRows(projectA, projectB) {
  const devicesA = uniqueDeviceValues(projectA);
  const devicesB = uniqueDeviceValues(projectB);
  ensureFlowMappings(devicesA, devicesB);
  els.multiFlowDeviceMappings.innerHTML = state.multiFlowMappings.map((mapping, index) => `
    <div class="flow-device-row" data-index="${index}">
      <input class="flow-map-label" type="text" value="${attrEscape(flowMappingLabel(mapping))}" data-default="${attrEscape(flowMappingDefaultLabel(mapping))}" aria-label="设备组命名">
      <select class="flow-map-a">
        ${devicesA.map(device => `<option value="${attrEscape(device)}" ${device === mapping.a ? "selected" : ""}>${escapeHtml(device)}</option>`).join("")}
      </select>
      <span>↔</span>
      <select class="flow-map-b">
        ${devicesB.map(device => `<option value="${attrEscape(device)}" ${device === mapping.b ? "selected" : ""}>${escapeHtml(device)}</option>`).join("")}
      </select>
      <button type="button" class="compact-button flow-map-remove">删除</button>
    </div>
  `).join("") || '<div class="empty-state">两个项目都需要可识别设备字段。</div>';
}

function deviceMeanForUser(rows, deviceField, metric, device) {
  return Core.numericSummary(rows.filter(row => String(row[deviceField] || "") === String(device)), metric).mean;
}

function preferenceStateForRows(rows, project, metric, mappings, side, threshold) {
  const devices = mappings.map(item => side === "a" ? item.a : item.b).filter(Boolean);
  const scores = devices.map(device => ({ device, score: deviceMeanForUser(rows, project.deviceField, metric, device) }))
    .filter(item => item.score != null);
  if (!scores.length) return { label: "数据不完整", key: "incomplete", device: "" };
  scores.sort((a, b) => b.score - a.score || a.device.localeCompare(b.device, "zh-CN"));
  const best = scores[0];
  const second = scores[1];
  if (second && best.score - second.score <= threshold) return { label: "无明显差异", key: "close", device: "" };
  const pair = mappings.find(item => String(side === "a" ? item.a : item.b) === String(best.device));
  const equivalent = pair ? flowMappingLabel(pair) : best.device;
  return { label: equivalent, key: equivalent, device: best.device };
}

function flowColor(index) {
  const colors = ["#8c1d23", "#b64b52", "#d07a4f", "#7c5d87", "#4d708c", "#9b6b2f", "#6f7d43", "#a54f77"];
  return colors[index % colors.length];
}

function renderSankeyChart(flowList = [], selectedKey = "") {
  if (!flowList.length) return '<div class="empty-state">没有可展示流向。</div>';
  const fromLabels = [...new Set(flowList.map(item => item.from))];
  const toLabels = [...new Set(flowList.map(item => item.to))];
  const maxSideCount = Math.max(fromLabels.length, toLabels.length, 1);
  const width = 940;
  const height = Math.max(280, maxSideCount * 72 + 80);
  const leftX = 120;
  const rightX = width - 120;
  const nodeWidth = 120;
  const minNodeHeight = 28;
  const maxNodeHeight = 96;
  const totalsFrom = new Map(fromLabels.map(label => [label, flowList.filter(item => item.from === label).reduce((sum, item) => sum + item.users.length, 0)]));
  const totalsTo = new Map(toLabels.map(label => [label, flowList.filter(item => item.to === label).reduce((sum, item) => sum + item.users.length, 0)]));
  const maxTotal = Math.max(1, ...totalsFrom.values(), ...totalsTo.values());
  const nodeHeightFor = (label, side) => minNodeHeight + ((side === "from" ? totalsFrom.get(label) : totalsTo.get(label)) || 0) / maxTotal * (maxNodeHeight - minNodeHeight);
  const yFor = (labels, label) => {
    const index = labels.indexOf(label);
    const gap = labels.length <= 1 ? 0 : (height - 110) / (labels.length - 1);
    return 55 + index * gap;
  };
  const fromOffsets = new Map(fromLabels.map(label => [label, 0]));
  const toOffsets = new Map(toLabels.map(label => [label, 0]));
  const linkMetrics = flowList.map((item, index) => ({
    item,
    index,
    key: item.key,
    value: item.users.length,
    stroke: Math.max(6, item.users.length / maxTotal * (maxNodeHeight - 8)),
    color: flowColor(index)
  }));
  linkMetrics.forEach(link => {
    const { item, value } = link;
    const fromTotal = totalsFrom.get(item.from) || 1;
    const toTotal = totalsTo.get(item.to) || 1;
    const fromHeight = nodeHeightFor(item.from, "from");
    const toHeight = nodeHeightFor(item.to, "to");
    const fromTop = yFor(fromLabels, item.from) - fromHeight / 2;
    const toTop = yFor(toLabels, item.to) - toHeight / 2;
    const fromOffset = fromOffsets.get(item.from) || 0;
    const toOffset = toOffsets.get(item.to) || 0;
    const fromBand = value / fromTotal * fromHeight;
    const toBand = value / toTotal * toHeight;
    link.y1 = fromTop + fromOffset + fromBand / 2;
    link.y2 = toTop + toOffset + toBand / 2;
    link.stroke = Math.max(5, Math.min(fromBand, toBand) * 0.86);
    fromOffsets.set(item.from, fromOffset + fromBand);
    toOffsets.set(item.to, toOffset + toBand);
  });
  const links = linkMetrics.map(({ item, index, key, y1, y2, stroke, color }) => {
    return `<path class="sankey-link ${selectedKey === key ? "active" : ""} ${selectedKey && selectedKey !== key ? "muted" : ""}" d="M ${leftX + nodeWidth / 2} ${y1.toFixed(1)} C ${leftX + 280} ${y1.toFixed(1)}, ${rightX - 280} ${y2.toFixed(1)}, ${rightX - nodeWidth / 2} ${y2.toFixed(1)}" stroke="${color}" stroke-width="${stroke.toFixed(1)}" data-flow-index="${index}" data-flow-key="${attrEscape(key)}" tabindex="0" role="button">
      <title>${escapeHtml(item.from)} → ${escapeHtml(item.to)}：${item.users.length} 人</title>
    </path>`;
  }).join("");
  const nodes = [
    ...fromLabels.map((label, index) => ({ label, x: leftX, y: yFor(fromLabels, label), height: nodeHeightFor(label, "from"), side: "项目 1", color: flowColor(index), total: totalsFrom.get(label) || 0 })),
    ...toLabels.map((label, index) => ({ label, x: rightX, y: yFor(toLabels, label), height: nodeHeightFor(label, "to"), side: "项目 2", color: flowColor(index + fromLabels.length), total: totalsTo.get(label) || 0 }))
  ].map(node => `
    <g class="sankey-node" transform="translate(${node.x - nodeWidth / 2}, ${(node.y - node.height / 2).toFixed(1)})">
      <rect width="${nodeWidth}" height="${node.height.toFixed(1)}" rx="3" fill="#fffaf6" stroke="${node.color}" stroke-width="1.5"></rect>
      <text x="${nodeWidth / 2}" y="14" text-anchor="middle">${escapeHtml(node.side)}</text>
      <text x="${nodeWidth / 2}" y="${Math.min(node.height - 8, 29).toFixed(1)}" text-anchor="middle">${escapeHtml(node.label)}</text>
      <text class="sankey-node-count" x="${nodeWidth / 2}" y="${Math.max(44, node.height - 8).toFixed(1)}" text-anchor="middle">${node.total} 人</text>
    </g>
  `).join("");
  return `<div class="sankey-shell">
    <svg class="sankey-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="设备偏好流向桑基图">
      <defs><filter id="sankeyShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#6b1c22" flood-opacity=".16"/></filter></defs>
      <g filter="url(#sankeyShadow)">${links}</g>
      ${nodes}
    </svg>
  </div>`;
}

function renderFlowDetailCards(flowList, projectA, projectB, match) {
  if (!flowList.length) return '<div class="empty-state">没有可展示流向。</div>';
  return flowList.map((item, index) => {
    const color = flowColor(index);
    const rowsA = item.users.flatMap(user => match.byA.get(user) || []);
    const rowsB = item.users.flatMap(user => match.byB.get(user) || []);
    return `<section class="flow-detail-card" style="--flow-accent:${color}">
      <div class="flow-detail-heading">
        <div>
          <span>FLOW ${index + 1}</span>
          <h3>${escapeHtml(item.from)} → ${escapeHtml(item.to)}</h3>
        </div>
        <strong>${item.users.length} 人</strong>
      </div>
      <p class="flow-user-list">${escapeHtml(item.users.join("，"))}</p>
      <div class="multi-user-columns flow-detail-columns">
        <article><strong>${escapeHtml(projectA.title)}</strong>${renderProjectDetailTable(projectA, rowsA)}</article>
        <article><strong>${escapeHtml(projectB.title)}</strong>${renderProjectDetailTable(projectB, rowsB)}</article>
      </div>
    </section>`;
  }).join("");
}

function renderMultiFlowPage() {
  const compare = renderMultiComparePage();
  const projectA = compare?.projectA;
  const projectB = compare?.projectB;
  renderMultiProjectSelectors();
  if (!projectA || !projectB || !compare?.match) {
    els.multiFlowSummary.textContent = "请先选择两个可对比项目。";
    els.multiFlowChart.innerHTML = "";
    els.multiFlowTable.innerHTML = "";
    if (els.multiFlowDetails) els.multiFlowDetails.innerHTML = "";
    if (els.multiFlowClearSelection) els.multiFlowClearSelection.hidden = true;
    return;
  }
  state.multiFlowMetricA = fillMetricSelect(els.multiFlowMetricA, projectA, state.multiFlowMetricA);
  state.multiFlowMetricB = fillMetricSelect(els.multiFlowMetricB, projectB, state.multiFlowMetricB || state.multiFlowMetricA);
  els.multiFlowThreshold.value = state.multiFlowThreshold;
  renderFlowMappingRows(projectA, projectB);
  const threshold = Math.max(0, Number(state.multiFlowThreshold) || 0);
  const flows = new Map();
  compare.match.matched.forEach(user => {
    const rowsA = compare.match.byA.get(user) || [];
    const rowsB = compare.match.byB.get(user) || [];
    const from = preferenceStateForRows(rowsA, projectA, state.multiFlowMetricA, state.multiFlowMappings, "a", threshold);
    const to = preferenceStateForRows(rowsB, projectB, state.multiFlowMetricB, state.multiFlowMappings, "b", threshold);
    const key = `${from.label}→${to.label}`;
    if (!flows.has(key)) flows.set(key, { key, from: from.label, to: to.label, users: [] });
    flows.get(key).users.push(user);
  });
  const flowList = [...flows.values()].sort((a, b) => b.users.length - a.users.length || a.from.localeCompare(b.from, "zh-CN"));
  if (state.multiFlowSelectedKey && !flowList.some(item => item.key === state.multiFlowSelectedKey)) state.multiFlowSelectedKey = "";
  const selectedFlow = flowList.find(item => item.key === state.multiFlowSelectedKey) || null;
  const detailFlows = selectedFlow ? [selectedFlow] : flowList;
  els.multiFlowSummary.textContent = selectedFlow ?
    `${projectA.title} → ${projectB.title}：当前筛选 ${selectedFlow.from} → ${selectedFlow.to}，${selectedFlow.users.length} 人。` :
    `${projectA.title} → ${projectB.title}：${compare.match.matched.length} 位匹配用户，${flowList.length} 条流向。`;
  if (els.multiFlowClearSelection) els.multiFlowClearSelection.hidden = !selectedFlow;
  els.multiFlowChart.innerHTML = renderSankeyChart(flowList, state.multiFlowSelectedKey);
  els.multiFlowTable.innerHTML = flowList.length ? `<div class="flow-summary-strip"><table class="summary-table flow-summary-table">
    <thead><tr><th>项目 1 偏好</th><th>项目 2 偏好</th><th>人数</th><th>用户</th></tr></thead>
    <tbody>${flowList.map((item, index) => `<tr class="flow-summary-row ${state.multiFlowSelectedKey === item.key ? "active" : ""} ${state.multiFlowSelectedKey && state.multiFlowSelectedKey !== item.key ? "muted" : ""}" style="--flow-accent:${flowColor(index)}" data-flow-key="${attrEscape(item.key)}" tabindex="0"><td><span class="flow-dot"></span>${escapeHtml(item.from)}</td><td>${escapeHtml(item.to)}</td><td>${item.users.length}</td><td>${escapeHtml(item.users.join("，"))}</td></tr>`).join("")}</tbody>
  </table></div>` : '<div class="empty-state">没有可展示流向。</div>';
  els.multiFlowDetails.innerHTML = detailFlows.length ? `<h3 class="flow-user-heading">${selectedFlow ? "当前流向用户明细" : "按流向分块的用户明细"}</h3>
  <div class="flow-detail-list">${renderFlowDetailCards(detailFlows, projectA, projectB, compare.match)}</div>` : '<div class="empty-state">没有可展示流向。</div>';
  observeDetailPhotos();
}

function renderMultiProjectPages() {
  renderMultiComparePage();
  if (document.getElementById("multiFlowPage")?.classList.contains("active")) renderMultiFlowPage();
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
  renderComparisonPreference();
  renderPhotoComparePage();
  if (state.analysisMode === "multi") renderMultiProjectPages();
}

function switchPage(page) {
  const multiPages = new Set(["multiCompare", "multiFlow"]);
  state.analysisMode = multiPages.has(page) ? "multi" : "single";
  if (els.singlePageNav) els.singlePageNav.hidden = state.analysisMode !== "single";
  if (els.multiPageNav) els.multiPageNav.hidden = state.analysisMode !== "multi";
  els.singleModeTab?.classList.toggle("active", state.analysisMode === "single");
  els.multiModeTab?.classList.toggle("active", state.analysisMode === "multi");
  if (state.analysisMode === "single") {
    els.singleModeTab?.setAttribute("aria-current", "page");
    els.multiModeTab?.removeAttribute("aria-current");
  } else {
    els.multiModeTab?.setAttribute("aria-current", "page");
    els.singleModeTab?.removeAttribute("aria-current");
  }
  document.querySelectorAll(".app-page").forEach(element => element.classList.toggle("active", element.id === `${page}Page`));
  document.querySelectorAll(".page-tab").forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (state.analysisMode === "multi") renderMultiProjectPages();
}

function mappingViews() {
  return els.viewNamesInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
}

function initializeMappingFields() {
  const headers = Object.keys(state.mappingRows[0] || {});
  fillSelect(els.mappingUserField, headers, false, fieldLabels);
  fillSelect(els.mappingEarField, headers, true, fieldLabels);
  fillSelect(els.mappingDeviceField, headers, true, fieldLabels);
  if (els.mappingEarField.options[0]) els.mappingEarField.options[0].textContent = "不配置（不分左右耳评分）";
  els.mappingEarField.insertAdjacentHTML("beforeend", `<option value="${PHOTO_EAR_MODE_VALUE}">CSV未写耳侧，但照片分左右耳识别</option>`);
  if (els.mappingDeviceField.options[0]) els.mappingDeviceField.options[0].textContent = "不配置（按单设备）";
  els.mappingUserField.value = headers.find(field => /^(name|姓名|user_name|用户姓名)$/i.test(field)) ||
    headers.find(field => /^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) || headers[0] || "";
  els.mappingEarField.value = headers.find(field => /ear_side|左右耳|耳侧|left_right|side/i.test(field)) || "";
  els.mappingDeviceField.value = headers.find(field => /^device_name$/i.test(field)) ||
    headers.find(field => /prototype|sample|样机|device_name|device_id|condition|设备|条件/i.test(field)) || "";
  renderMappingMode();
}

function photoEarModeEnabled() {
  return els.mappingEarField.value === PHOTO_EAR_MODE_VALUE;
}

function mappingEarFieldValue() {
  return photoEarModeEnabled() ? "" : els.mappingEarField.value;
}

function mappingExpectedEars() {
  const templateEars = protocolExpectedEars();
  return photoEarModeEnabled() && !state.singleEarMode ? (templateEars.length ? templateEars : ["左耳", "右耳"]) : templateEars;
}

function renderMappingMode() {
  const folderMode = els.mappingMode.value === "folders";
  const photoEarMode = photoEarModeEnabled();
  els.mappingEarFieldWrap.hidden = false;
  els.viewNamesInputWrap.hidden = folderMode;
  els.viewNamesInput.required = !folderMode;
  els.bareEarToggleWrap.hidden = folderMode;
  els.viewNamesInput.placeholder = folderMode || photoEarMode ? "例如：正面,侧面,后侧" : "例如：左耳正面,左耳侧面,右耳正面,右耳侧面";
  els.mappingModeNote.innerHTML = folderMode ?
    `<strong>当前规则：子文件夹识别</strong><span>不需要填写拍摄顺序。系统会从照片目录自动识别方向；若未配置耳侧且每个用户/设备只有一侧照片，会自动按单耳模式生成视角列。</span>` :
    photoEarMode ?
      `<strong>当前规则：按文件名顺序 + 照片分左右耳</strong><span>CSV 不需要耳侧列。请只填写方向顺序，例如正面、侧面；系统会自动生成左耳和右耳两组照片列。</span>` :
      `<strong>当前规则：按文件名顺序</strong><span>需要填写拍摄顺序。单耳模式会去掉视角名里的左/右耳，只生成正面、侧面等视角列。</span>`;
  renderBareEarConfigControls();
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
  state.mappingThumbnailObserver?.disconnect?.();
  state.mappingThumbnailObserver = null;
  state.mappingObjectUrls.forEach(url => URL.revokeObjectURL(url));
  state.mappingObjectUrls = [];
  Object.values(state.thumbnailUrls).forEach(url => {
    if (String(url).startsWith("blob:")) URL.revokeObjectURL(url);
  });
  state.thumbnailUrls = {};
  state.thumbnailPromises = {};
  state.photoUrlByPath = {};
  state.photoRelativeByUrl = {};
  clearDetailPreviewUrls();
}

function clearDetailPreviewUrls() {
  Object.values(state.detailPreviewUrls).forEach(url => {
    if (String(url).startsWith("blob:")) URL.revokeObjectURL(url);
  });
  state.detailPreviewUrls = {};
  state.detailPreviewPromises = {};
}

function imageLoad(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function createThumbnailUrl(sourceUrl, maxSize = 128, quality = 0.72) {
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
    }, "image/jpeg", quality);
  });
}

async function buildMappingThumbnails(photos = []) {
  const visiblePhotos = photos.slice(0, 24);
  await Promise.all(visiblePhotos.map(async photo => {
    const key = photoFileStoredPath(photo);
    const source = photoFileRuntimeUrl(photo);
    if (!key || !source) return;
    await mappingThumbnailUrl(key, source);
  }));
}

async function mappingThumbnailUrl(key, source) {
  if (!key || !source) return source || "";
  if (state.thumbnailUrls[key]) return state.thumbnailUrls[key];
  if (!state.thumbnailPromises[key]) {
    state.thumbnailPromises[key] = createThumbnailUrl(source)
      .then(url => {
        state.thumbnailUrls[key] = url;
        delete state.thumbnailPromises[key];
        return url;
      })
      .catch(() => {
        state.thumbnailUrls[key] = source;
        delete state.thumbnailPromises[key];
        return source;
      });
  }
  return state.thumbnailPromises[key];
}

async function loadMappingThumbnail(image) {
  const key = image?.dataset?.thumbKey || "";
  const source = image?.dataset?.thumbSrc || "";
  if (!key || !source || image.dataset.loadingThumb === key) return;
  image.dataset.loadingThumb = key;
  const url = await mappingThumbnailUrl(key, source);
  if (image.dataset.thumbKey !== key) return;
  image.src = url;
  image.classList.remove("mapping-photo-lazy");
  delete image.dataset.loadingThumb;
}

function observeMappingThumbnails(root = els.mappingPreview) {
  state.mappingThumbnailObserver?.disconnect?.();
  const images = root ? [...root.querySelectorAll("img.mapping-photo-lazy[data-thumb-src]")] : [];
  if (!images.length) return;
  if (!("IntersectionObserver" in window)) {
    images.slice(0, 48).forEach(loadMappingThumbnail);
    return;
  }
  state.mappingThumbnailObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        state.mappingThumbnailObserver?.unobserve?.(entry.target);
        loadMappingThumbnail(entry.target);
      }
    });
  }, {
    rootMargin: "520px 0px",
    threshold: 0.01
  });
  images.forEach(image => state.mappingThumbnailObserver.observe(image));
}

function mappingPhotoImage(path, alt, caption) {
  if (!path) return "";
  const src = photoUrl(path);
  const stored = state.photoRelativeByUrl[path] || normalizePathSlashes(path);
  const thumbSrc = photoThumbUrl(path);
  const lazy = thumbSrc === src;
  return `<img class="photo-preview-trigger ${lazy ? "mapping-photo-lazy" : ""}" src="${attrEscape(lazy ? detailPhotoPlaceholder() : thumbSrc)}" alt="${attrEscape(alt)}" loading="lazy" decoding="async" draggable="false" tabindex="0" role="button" data-preview-src="${attrEscape(src)}" data-preview-caption="${attrEscape(caption)}" data-thumb-key="${attrEscape(stored)}" data-thumb-src="${attrEscape(src)}">`;
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
  state.mappingFiles = photos;
  rebuildPhotoPathIndex(photos);
  const rootName = [...files].find(file => file.webkitRelativePath)?.webkitRelativePath?.split(/[\\/]/)[0] || "已选择文件夹";
  els.photoRootInput.value = photos.length ? `browser-folder:${rootName}` : "";
  if (els.photoFolderStatus) {
    els.photoFolderStatus.textContent = photos.length ?
      `已选择 ${rootName}，识别到 ${photos.length} 张图片。保存项目后建议把照片文件夹命名为 photos 并放在看板根目录，其他设备即可通过服务器加载。` :
      "未识别到图片，请选择包含照片的文件夹。";
  }
  resetMappingOutputs();
  return photos;
}

async function scanPhotoRoot(options = {}) {
  if (state.serverProjectId) return uploadServerPhotoFiles();
  if (state.mappingFiles.some(file => file.source === "browser_folder")) {
    rebuildPhotoPathIndex(state.mappingFiles);
    return { root: els.photoRootInput.value || "browser-folder", photos: state.mappingFiles };
  }
  const root = els.photoRootInput.value.trim();
  if (!root) throw new Error("请选择照片根文件夹，或在高级设置中手动输入路径。");
  const response = await fetch("/api/scan-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root, force: Boolean(options.force) })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "照片目录扫描失败。");
  state.mappingFiles = result.photos;
  rebuildPhotoPathIndex(result.photos);
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
  rebuildPhotoPathIndex(photos);
  els.photoRootInput.value = `server:${state.serverProjectId}`;
  return { root: els.photoRootInput.value, photos };
}

function safeLibraryPart(value, fallback = "unknown") {
  const clean = String(value || "").trim().replace(/[^A-Za-z0-9_\-\u4e00-\u9fff]+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  return clean.slice(0, 80) || fallback;
}

function bareEarLibraryPayload() {
  const bareFields = state.mappingPhotoFields.filter(field => field.startsWith("bare_ear_photo"));
  if (!bareFields.length) return [];
  return state.mappedRows.flatMap(row => {
    const user = String(row[els.mappingUserField.value] || row[state.userIdField] || "");
    return bareFields.map(field => {
      const value = row[field] || "";
      const source = rootedPhotoPath(value) || (isRuntimePhotoUrl(value) ? "" : state.photoUrlByPath[value] || "");
      return source && !isRuntimePhotoUrl(source) ? {
        user,
        field,
        label: currentBarePhotoLabel(field),
        source
      } : null;
    }).filter(Boolean);
  });
}

async function loadBareEarLibraryIndex() {
  try {
    const response = await fetch("/api/bare-ear-library");
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result.photos) ? result.photos : [];
  } catch {
    return [];
  }
}

async function syncBareEarLibraryAndFallbacks() {
  const payload = bareEarLibraryPayload();
  if (payload.length) {
    try {
      await fetch("/api/bare-ear-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: payload })
      });
    } catch {
      // 浏览器文件夹模式没有本地写入权限；忽略保存失败，仍尝试读取已有库作为 fallback。
    }
  }
  const index = await loadBareEarLibraryIndex();
  if (!index.length) return { saved: payload.length, filled: 0 };
  const byKey = new Map();
  index.forEach(photo => {
    const key = `${safeLibraryPart(photo.user, "user")}::${safeLibraryPart(photo.field, "bare_ear_photo")}`;
    if (!byKey.has(key)) byKey.set(key, photo);
  });
  let filled = 0;
  const bareFields = state.mappingPhotoFields.filter(field => field.startsWith("bare_ear_photo"));
  state.mappedRows.forEach(row => {
    const user = String(row[els.mappingUserField.value] || row[state.userIdField] || "");
    bareFields.forEach(field => {
      if (row[field]) return;
      const match = byKey.get(`${safeLibraryPart(user, "user")}::${safeLibraryPart(field, "bare_ear_photo")}`);
      if (!match?.url) return;
      row[field] = match.url;
      filled += 1;
    });
  });
  return { saved: payload.length, filled };
}

async function buildPhotoMapping() {
  const mode = els.mappingMode.value;
  const includeBareEar = mode === "sequence" && state.includeBareEarPhotos;
  const bareEarConfig = includeBareEar ? { enabled: true, ...state.bareEarConfig } : { enabled: false };
  const singleEarMode = state.singleEarMode;
  const userField = els.mappingUserField.value;
  const earField = mappingEarFieldValue();
  const photoEarMode = photoEarModeEnabled();
  const deviceField = els.mappingDeviceField.value;
  const templateViews = protocolPhotoViews();
  const expectedEars = mappingExpectedEars();
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
    photoEarMode,
    includeBareEar,
    bareEarConfig,
    singleEarMode,
    overrides: state.photoMappingOverrides
  });
  state.mappedRows = applyUserNotesToRows(mapped);
  state.mappingReviews = reviews;
  state.mappingPhotoFields = photoFields;
  state.mappingViews = views;
  const photoViews = Core.viewDescriptors(state.mappingRows, {
    mode,
    earField,
    views,
    expectedEars,
    photoEarMode,
    singleEarMode,
    files: state.mappingFiles
  });
  const bareFieldCount = photoFields.filter(field => field.startsWith("bare_ear_photo")).length;
  photoFields.forEach((field, index) => {
    const bareMatch = field.match(/^bare_ear_photo(?:_(.+))?$/);
    const label = bareMatch ? barePhotoFieldLabel(field) : photoViews[index - bareFieldCount]?.label || views[index] || field;
    const savedBareLabel = bareMatch ? state.bareEarConfig.labels?.[field] : "";
    const finalLabel = savedBareLabel || label;
  state.viewLabels[field] = finalLabel;
    fieldLabels[field] = finalLabel;
  });
  const libraryResult = await syncBareEarLibraryAndFallbacks();
  renderMappingPreview(reviews, userField, deviceField, photoFields);
  els.applyMappingButton.disabled = false;
  els.downloadPhotoAuditButton.disabled = false;
  if (libraryResult.filled) {
    els.mappingSummary.textContent = `映射完成，并从空耳库补齐 ${libraryResult.filled} 个空耳照片。`;
  }
}

function photoSelectOptions(files, selectedPath) {
  const normalizedSelected = photoValueForDisplay(selectedPath);
  const selectedKnown = files.some(file => photoFileStoredPath(file) === normalizedSelected);
  return `<option value="">缺失/不使用</option>` +
    (!selectedKnown && selectedPath ? `<option value="${attrEscape(normalizedSelected)}" selected>当前手动路径</option>` : "") +
    files.map(file => {
      const value = photoFileStoredPath(file);
      return `<option value="${attrEscape(value)}" ${value === normalizedSelected ? "selected" : ""}>${attrEscape(file.relative_path || file.name)}</option>`;
    }).join("");
}

function detailPhotoPlaceholder() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23f2eeee'/%3E%3C/svg%3E";
}

function detailPhotoMode() {
  return sanitizeDetailPhotoMode(state.layout.detailPhotoMode);
}

function detailPhotoPreviewUrl(source) {
  if (!source) return Promise.resolve(source);
  if (detailPhotoMode() === "capture") return Promise.resolve(source);
  if (state.detailPreviewUrls[source]) return Promise.resolve(state.detailPreviewUrls[source]);
  if (!state.detailPreviewPromises[source]) {
    state.detailPreviewPromises[source] = createThumbnailUrl(source, 1200, 0.86)
      .then(url => {
        state.detailPreviewUrls[source] = url;
        delete state.detailPreviewPromises[source];
        return url;
      })
      .catch(() => {
        state.detailPreviewUrls[source] = source;
        delete state.detailPreviewPromises[source];
        return source;
      });
  }
  return state.detailPreviewPromises[source];
}

async function loadDetailPhoto(image) {
  const source = image?.dataset?.src;
  if (!source || image.dataset.loadingSrc === source) return;
  image.dataset.loadingSrc = source;
  const mode = detailPhotoMode();
  const displaySrc = mode === "capture" ? source : await detailPhotoPreviewUrl(source);
  if (image.dataset.src !== source && image.dataset.loadedSrc !== source) return;
  image.src = displaySrc;
  image.dataset.loadedSrc = source;
  image.dataset.loadedMode = mode;
  image.removeAttribute("data-src");
  image.classList.remove("detail-photo-lazy");
  delete image.dataset.loadingSrc;
}

function unloadDetailPhoto(image) {
  if (detailPhotoMode() !== "performance") return;
  const source = image?.dataset?.loadedSrc;
  if (!source) return;
  image.src = detailPhotoPlaceholder();
  image.dataset.src = source;
  image.classList.add("detail-photo-lazy");
  delete image.dataset.loadedSrc;
  delete image.dataset.loadedMode;
  delete image.dataset.loadingSrc;
}

function observeDetailPhotos() {
  state.detailPhotoObserver?.disconnect?.();
  const roots = [els.detailBody, els.comparisonDetails, els.multiMatchedDetails, els.multiOnlyA, els.multiOnlyB].filter(Boolean);
  const images = roots.flatMap(root => [...root.querySelectorAll("img.detail-photo-lazy[data-src], img[data-loaded-src]")]);
  if (!images.length) return;
  if (detailPhotoMode() === "capture") {
    images.forEach(loadDetailPhoto);
    return;
  }
  if (!("IntersectionObserver" in window)) {
    images.forEach(loadDetailPhoto);
    return;
  }
  state.detailPhotoObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) loadDetailPhoto(entry.target);
      else unloadDetailPhoto(entry.target);
    });
  }, {
    rootMargin: "520px 0px",
    threshold: 0.01
  });
  images.forEach(image => state.detailPhotoObserver.observe(image));
}

function barePhotoFieldLabel(field) {
  const rest = String(field || "").replace(/^bare_ear_photo_?/, "");
  if (!rest) return "空耳";
  const parts = rest.split("_").filter(Boolean);
  const last = parts[parts.length - 1];
  const hasNumber = /^\d+$/.test(last);
  const number = hasNumber ? last : "";
  const ear = hasNumber ? parts.slice(0, -1).join("_") : parts.join("_");
  if (ear) return `${ear} · 空耳${number ? ` ${number}` : ""}`;
  return `空耳${number ? ` ${number}` : ""}`;
}

function currentBarePhotoLabel(field, fallback = "") {
  return state.bareEarConfig.labels?.[field] || state.viewLabels[field] || fallback || barePhotoFieldLabel(field);
}

function bareSlotGroups(slots = []) {
  const groups = new Map();
  slots.forEach(slot => {
    const key = slot.ear || "通用";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  });
  return [...groups.entries()].sort(([a], [b]) =>
    (a === "左耳" ? 0 : a === "右耳" ? 1 : 2) -
    (b === "左耳" ? 0 : b === "右耳" ? 1 : 2) ||
    a.localeCompare(b, "zh-CN")
  );
}

function renderBareSlotFigure(review, slot) {
  const path = state.mappedRows[slot.rowIndex]?.[slot.field] || "";
  const label = currentBarePhotoLabel(slot.field, slot.label);
  return `<figure class="mapping-photo-slot mapping-bare-slot ${path ? "has-photo" : "missing"}" draggable="${path ? "true" : "false"}" data-slot-kind="bare" data-user="${attrEscape(review.user)}" data-row-index="${slot.rowIndex}" data-field="${attrEscape(slot.field)}" title="拖动照片到这里会重置该用户设备排序">
    ${path ? mappingPhotoImage(path, label, `${review.user} · ${label}`) : `<div class="missing-photo">拖到这里</div>`}
    <figcaption>${escapeHtml(label)}</figcaption>
    <input class="bare-ear-label-input" data-field="${attrEscape(slot.field)}" value="${attrEscape(label)}" aria-label="${attrEscape(label)}名称">
    <select class="mapping-photo-select" data-row-index="${slot.rowIndex}" data-field="${attrEscape(slot.field)}">
      ${photoSelectOptions(review.files, path)}
    </select>
  </figure>`;
}

function photoFieldEar(field) {
  const label = state.viewLabels[field] || field;
  if (/左耳/.test(label) || /^photo_左耳_/.test(field)) return "左耳";
  if (/右耳/.test(label) || /^photo_右耳_/.test(field)) return "右耳";
  return "";
}

function photoFieldViewName(field) {
  const label = state.viewLabels[field] || field;
  return label.replace(/^(左耳|右耳)\s*[·_ -]?\s*/, "").replace(/^photo_(左耳|右耳)_/, "");
}

function renderMappingPhotoSlot(review, entry, field, deviceField) {
  const path = state.mappedRows[entry.rowIndex][field];
  const caption = `${review.user} · ${deviceField ? entry.row[deviceField] || "未命名设备" : "单设备"} · ${state.viewLabels[field]}`;
  return `<figure class="mapping-photo-slot ${path ? "has-photo" : "missing"}" draggable="${path ? "true" : "false"}" data-slot-kind="device" data-user="${attrEscape(review.user)}" data-row-index="${entry.rowIndex}" data-field="${attrEscape(field)}" title="拖动同一用户内的照片可交换映射">
    ${path ? mappingPhotoImage(path, state.viewLabels[field], caption) : `<div class="missing-photo">缺失</div>`}
    <figcaption>${escapeHtml(photoFieldViewName(field))}</figcaption>
    <select class="mapping-photo-select" data-row-index="${entry.rowIndex}" data-field="${attrEscape(field)}">
      ${photoSelectOptions(els.mappingMode.value === "folders" ? state.mappingFiles : review.files, path)}
    </select>
  </figure>`;
}

function renderDevicePhotoFields(review, entry, deviceField, fields) {
  const sequencePhotoEarMode = els.mappingMode.value === "sequence" && photoEarModeEnabled();
  if (!sequencePhotoEarMode) {
    return fields.map(field => renderMappingPhotoSlot(review, entry, field, deviceField)).join("");
  }
  const groups = ["左耳", "右耳"].map(ear => ({
    ear,
    fields: fields.filter(field => photoFieldEar(field) === ear)
  })).filter(group => group.fields.length);
  const ungrouped = fields.filter(field => !photoFieldEar(field));
  return `<div class="mapping-ear-groups">
    ${groups.map(group => `<section class="mapping-ear-group" data-ear="${group.ear}">
      <strong>${group.ear}</strong>
      <div class="mapping-ear-slots">${group.fields.map(field => renderMappingPhotoSlot(review, entry, field, deviceField)).join("")}</div>
    </section>`).join("")}
    ${ungrouped.length ? `<section class="mapping-ear-group"><strong>未分耳侧</strong><div class="mapping-ear-slots">${ungrouped.map(field => renderMappingPhotoSlot(review, entry, field, deviceField)).join("")}</div></section>` : ""}
  </div>`;
}

function renderMappingReviewCard(review, deviceField, photoFields) {
  const sequenceMode = els.mappingMode.value === "sequence";
  const sequencePhotoEarMode = sequenceMode && photoEarModeEnabled();
  const bareFields = photoFields.filter(field => field.startsWith("bare_ear_photo"));
  const devicePhotoFields = photoFields.filter(field => !field.startsWith("bare_ear_photo"));
  const hasBare = bareFields.length && review.bareSlots?.length;
  const totalExpected = review.expected + (review.bareSlots?.length || 0);
  const bareGroups = bareSlotGroups(review.bareSlots || []);
  const barePanelColumns = bareGroups.some(([group]) => group !== "通用") ? 2 : 1;
  const bareHtml = hasBare ? `<aside class="mapping-bare-panel" style="--bare-panel-columns:${barePanelColumns}">
    <h3>空耳</h3>
    ${bareGroups.map(([group, slots]) => `
      <section class="mapping-bare-row">
        ${group !== "通用" ? `<strong>${group}</strong>` : ""}
        ${slots.map(slot => renderBareSlotFigure(review, slot)).join("")}
      </section>
    `).join("")}
  </aside>` : "";
  return `<article class="mapping-user ${review.status}" data-review-user="${attrEscape(review.user)}">
    <div class="mapping-user-heading">
      <strong>${escapeHtml(review.user)}</strong>
      <span>预期 ${totalExpected} 张 / 实际 ${review.files.length} 张</span>
      <b>${review.status === "ok" ? "映射正常" : review.status === "missing" ? "照片不足" : "照片过多"}</b>
    </div>
    <div class="${hasBare ? "mapping-review-columns" : ""}" style="${hasBare ? `--bare-panel-width:${barePanelColumns === 2 ? 360 : 180}px` : ""}">
    ${bareHtml}
    <div class="mapping-device-list">${review.entries.map((entry, entryIndex) => `
      <div class="mapping-device-row ${sequencePhotoEarMode ? "mapping-device-row-ear-groups" : ""}">
        <div class="mapping-device-meta">
          <strong>${escapeHtml(deviceField ? entry.row[deviceField] || "未命名设备" : "单设备")}</strong>
          ${sequenceMode && review.entries.length > 1 ? `<div class="mapping-device-actions">
            <button type="button" class="mini-button mapping-device-move" data-user="${attrEscape(review.user)}" data-row-index="${entry.rowIndex}" data-direction="-1" ${entryIndex === 0 ? "disabled" : ""}>上移整组</button>
            <button type="button" class="mini-button mapping-device-move" data-user="${attrEscape(review.user)}" data-row-index="${entry.rowIndex}" data-direction="1" ${entryIndex === review.entries.length - 1 ? "disabled" : ""}>下移整组</button>
          </div>` : ""}
          ${sequencePhotoEarMode ? `<button type="button" class="mini-button mapping-ear-swap" data-user="${attrEscape(review.user)}" data-row-index="${entry.rowIndex}">左右耳互换</button>` : ""}
        </div>
        ${renderDevicePhotoFields(review, entry, deviceField, devicePhotoFields)}
      </div>
    `).join("")}</div>
    </div>
    ${review.notes?.length ? `<div class="mapping-notes">${review.notes.map(note => `<p>${escapeHtml(note)}</p>`).join("")}</div>` : ""}
  </article>`;
}

function renderMappingPreview(reviews, userField, deviceField, photoFields) {
  const ok = reviews.filter(review => review.status === "ok").length;
  const issues = reviews.length - ok;
  els.mappingSummary.innerHTML = `<strong>${reviews.length}</strong> 位用户 · <strong>${ok}</strong> 正常 · <strong>${issues}</strong> 异常`;
  els.mappingPreview.innerHTML = reviews.map(review => renderMappingReviewCard(review, deviceField, photoFields)).join("");
  observeMappingThumbnails();
}

function renderMappingReviewUser(user) {
  const review = state.mappingReviews.find(item => String(item.user) === String(user));
  if (!review) return;
  const current = [...els.mappingPreview.querySelectorAll(".mapping-user")]
    .find(element => element.dataset.reviewUser === String(user));
  const html = renderMappingReviewCard(review, els.mappingDeviceField.value, state.mappingPhotoFields);
  if (current) {
    current.outerHTML = html;
    observeMappingThumbnails();
  }
}

function mappingSlotFromElement(element) {
  const slot = element?.closest?.(".mapping-photo-slot");
  if (!slot) return null;
  return {
    user: slot.dataset.user || "",
    rowIndex: Number(slot.dataset.rowIndex),
    field: slot.dataset.field || "",
    kind: slot.dataset.slotKind || "device"
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
  if (target.kind === "bare") return assignBareEarSlot(source, target);
  state.mappedRows = Core.swapMappedPhotoAssignments(state.mappedRows, source, target);
  applyPhotoSlotOverrides([source, target]);
  renderMappingReviewUser(source.user);
  markProjectDirty();
  return true;
}

function moveMappingDeviceGroup(user, rowIndex, direction) {
  const review = state.mappingReviews.find(item => String(item.user) === String(user));
  if (!review) return false;
  const currentIndex = review.entries.findIndex(entry => entry.rowIndex === rowIndex);
  const targetEntry = review.entries[currentIndex + direction];
  if (currentIndex < 0 || !targetEntry) return false;
  const fields = state.mappingPhotoFields.filter(field => !field.startsWith("bare_ear_photo"));
  state.mappedRows = Core.swapMappedPhotoDeviceGroups(state.mappedRows, rowIndex, targetEntry.rowIndex, fields);
  applyPhotoSlotOverrides([
    ...fields.map(field => ({ rowIndex, field })),
    ...fields.map(field => ({ rowIndex: targetEntry.rowIndex, field }))
  ]);
  renderMappingReviewUser(user);
  markProjectDirty();
  return true;
}

function swapMappingEarGroups(user, rowIndex) {
  const fields = state.mappingPhotoFields.filter(field => !field.startsWith("bare_ear_photo"));
  const leftFields = fields.filter(field => photoFieldEar(field) === "左耳");
  const rightFields = fields.filter(field => photoFieldEar(field) === "右耳");
  if (!leftFields.length || !rightFields.length) return false;
  const rightByView = new Map(rightFields.map(field => [photoFieldViewName(field), field]));
  leftFields.forEach(leftField => {
    const rightField = rightByView.get(photoFieldViewName(leftField));
    if (!rightField) return;
    const row = state.mappedRows[rowIndex];
    const leftValue = row[leftField] || "";
    row[leftField] = row[rightField] || "";
    row[rightField] = leftValue;
    applyPhotoSlotOverrides([{ rowIndex, field: leftField }, { rowIndex, field: rightField }]);
  });
  renderMappingReviewUser(user);
  markProjectDirty();
  return true;
}

function updateBareEarLabel(field, label) {
  if (!field) return;
  const config = sanitizeBareEarConfig(state.bareEarConfig);
  const value = String(label || "").trim();
  if (value) config.labels[field] = value;
  else delete config.labels[field];
  state.bareEarConfig = config;
  const finalLabel = value || barePhotoFieldLabel(field);
  state.viewLabels[field] = finalLabel;
  fieldLabels[field] = finalLabel;
  markProjectDirty();
}

function clearUserDevicePhotoOverrides(user) {
  const review = state.mappingReviews.find(item => String(item.user) === String(user));
  if (!review) return;
  const rowIndexes = new Set(review.entries.map(entry => entry.rowIndex));
  state.mappingPhotoFields
    .filter(field => !field.startsWith("bare_ear_photo"))
    .forEach(field => rowIndexes.forEach(rowIndex => {
      delete state.photoMappingOverrides[`${rowIndex}::${field}`];
    }));
}

function assignBareEarSlot(source, target) {
  if (source.kind === "bare") {
    state.mappedRows = Core.swapMappedPhotoAssignments(state.mappedRows, source, target);
    applyPhotoSlotOverrides([source, target]);
    renderMappingReviewUser(source.user);
    markProjectDirty();
    return true;
  }
  const value = state.mappedRows[source.rowIndex]?.[source.field] || "";
  if (!value) return false;
  clearUserDevicePhotoOverrides(source.user);
  state.photoMappingOverrides[`${target.rowIndex}::${target.field}`] = value;
  buildPhotoMapping()
    .then(() => markProjectDirty())
    .catch(error => { els.mappingSummary.textContent = error.message; });
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

function escapeHtml(value) {
  return attrEscape(value);
}

function projectCsvPayload() {
  const sourceRows = state.mappedRows.length ? state.mappedRows : state.rows;
  const rows = rowsWithUserNotes(sourceRows);
  if (!rows.length) {
    return null;
  }
  const headers = [...new Set([
    ...state.headers.filter(header => header !== USER_NOTE_FIELD),
    ...rows.flatMap(row => Object.keys(row).filter(header => header !== USER_NOTE_FIELD))
  ])];
  if (Object.values(state.userNotes || {}).some(Boolean) && !headers.includes(USER_NOTE_FIELD)) headers.push(USER_NOTE_FIELD);
  const csv = [headers.join(","), ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))].join("\r\n");
  const label = activeProjectName();
  return { csv, label };
}

function csvTimestamp(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function downloadProjectCsv(csv, label) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `${label}_${csvTimestamp()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function exportProjectCsvToSelectedFolder(csv, label) {
  const exportsDir = await state.projectFolderHandle.getDirectoryHandle("exports", { create: true });
  const fileName = `${label}_${csvTimestamp()}.csv`;
  const handle = await exportsDir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(`\ufeff${csv}`);
  await writable.close();
  return `exports/${fileName}`;
}

async function exportProjectCsv() {
  const payload = projectCsvPayload();
  if (!payload) {
    alert("当前没有可导出的项目数据。");
    return;
  }
  const { csv, label } = payload;
  if (state.projectFolderHandle) {
    try {
      const path = await exportProjectCsvToSelectedFolder(csv, label);
      setProjectStatus(`已导出项目 CSV：${path}`, state.projectDirty);
      return;
    } catch (error) {
      downloadProjectCsv(csv, label);
      setProjectStatus(`无法写入项目 exports 文件夹，已改为浏览器下载：${error.message}`, state.projectDirty);
      return;
    }
  }
  try {
    const response = await fetch("/api/export-project-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath: selectedProjectPath(), projectName: label, csv })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "项目 CSV 导出失败。");
    setProjectStatus(`已导出项目 CSV：${result.path}`, state.projectDirty);
  } catch (error) {
    downloadProjectCsv(csv, label);
    setProjectStatus(`无法写入项目 exports 文件夹，已改为浏览器下载：${error.message}`, state.projectDirty);
  }
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
  els.downloadPhotoAuditButton.disabled = true;
}

function applyMappedRows() {
  state.rows = rowsWithUserNotes(state.mappedRows);
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

function handleDetailHeaderChange(event) {
  if (event.target.classList.contains("device-order-select")) {
    state.deviceOrderMode = event.target.value;
    render();
    markProjectDirty();
    return true;
  }
  if (!event.target.classList.contains("header-filter")) return false;
  state.columnFilters[event.target.dataset.field] = event.target.value;
  state.selectedGroup = null;
  render();
  return true;
}

function handleDetailHeaderClick(event) {
  if (event.target.classList.contains("user-filter-all")) {
    state.userFilter = null;
    state.selectedGroup = null;
    render();
    markProjectDirty();
    return true;
  }
  if (event.target.classList.contains("user-filter-none")) {
    state.userFilter = [];
    state.selectedGroup = null;
    render();
    markProjectDirty();
    return true;
  }
  return false;
}

function bindUserSortDrag(container) {
  container.addEventListener("dragstart", event => {
    const handle = event.target.closest(".user-sort-handle");
    if (!handle) return;
    draggedDetailUser = handle.dataset.user || "";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedDetailUser);
    handle.closest("tr")?.classList.add("user-sort-dragging");
  });
  container.addEventListener("dragover", event => {
    if (!draggedDetailUser) return;
    const row = event.target.closest("tr[data-detail-user]");
    if (!row || row.dataset.detailUser === draggedDetailUser) return;
    event.preventDefault();
    row.classList.add("user-sort-drop-target");
  });
  container.addEventListener("dragleave", event => {
    event.target.closest("tr[data-detail-user]")?.classList.remove("user-sort-drop-target");
  });
  container.addEventListener("drop", event => {
    if (!draggedDetailUser) return;
    const row = event.target.closest("tr[data-detail-user]");
    container.querySelectorAll(".user-sort-drop-target").forEach(item => item.classList.remove("user-sort-drop-target"));
    if (!row || row.dataset.detailUser === draggedDetailUser) return;
    event.preventDefault();
    if (moveUserOrder(draggedDetailUser, row.dataset.detailUser)) {
      render();
      markProjectDirty();
    }
  });
  container.addEventListener("dragend", () => {
    draggedDetailUser = "";
    container.querySelectorAll(".user-sort-dragging, .user-sort-drop-target").forEach(row =>
      row.classList.remove("user-sort-dragging", "user-sort-drop-target")
    );
  });
}

function importDashboardConfigFile(file, input) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyDashboardConfig(JSON.parse(reader.result));
    } catch (error) {
      alert(`配置导入失败：${error.message}`);
    } finally {
      if (input) input.value = "";
    }
  };
  reader.readAsText(file, "UTF-8");
}

function handleLayoutControlInput(event) {
  if (event.target.classList.contains("layout-font-size-control")) {
    state.layout.fontSize = Number(event.target.value);
  } else if (event.target.classList.contains("layout-photo-size-control")) {
    state.layout.photoSize = Number(event.target.value);
  } else if (event.target.classList.contains("layout-photo-zoom-control")) {
    state.layout.photoZoom = clampPhotoZoom(event.target.value, state.layout.photoZoom ?? 100);
  } else if (event.target.classList.contains("layout-photo-position-x-control")) {
    state.layout.photoPositionX = Number(event.target.value);
  } else if (event.target.classList.contains("layout-photo-position-y-control")) {
    state.layout.photoPositionY = Number(event.target.value);
  } else {
    return false;
  }
  applyLayoutVariables();
  saveLayout();
  markProjectDirty();
  return true;
}

function handleLayoutControlChange(event) {
  if (event.target.classList.contains("layout-detail-photo-mode-control")) {
    state.layout.detailPhotoMode = sanitizeDetailPhotoMode(event.target.value);
    applyLayoutVariables();
    saveLayout();
    render();
    markProjectDirty();
    return true;
  }
  const row = event.target.closest(".column-config-row");
  if (row && event.target.classList.contains("column-visible")) {
    const column = state.layout.columns.find(item => item.id === row.dataset.columnId);
    if (column) column.visible = event.target.checked;
    saveLayout();
    renderColumnConfig();
    render();
    markProjectDirty();
    return true;
  }
  return false;
}

function handleColumnConfigInput(event) {
  if (!event.target.classList.contains("column-width")) return false;
  const row = event.target.closest(".column-config-row");
  const column = state.layout.columns.find(item => item.id === row?.dataset.columnId);
  if (!column) return false;
  column.width = Math.max(60, Math.min(500, Number(event.target.value) || column.width));
  saveLayout();
  render();
  markProjectDirty();
  return true;
}

function handleColumnConfigDragStart(event) {
  const row = event.target.closest(".column-config-row");
  if (!row || !event.target.classList.contains("column-drag-handle")) return false;
  draggedColumnId = row.dataset.columnId;
  activeColumnConfigList = row.closest(".column-config-list");
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedColumnId);
  return true;
}

function handleColumnConfigDragOver(event) {
  if (!draggedColumnId) return false;
  const row = event.target.closest(".column-config-row");
  if (!row || row.dataset.columnId === draggedColumnId) return false;
  event.preventDefault();
  updateColumnDragAutoScroll(event.clientY, row.closest(".column-config-list") || activeColumnConfigList || els.columnConfigList);
  const rect = row.getBoundingClientRect();
  const placeAfter = event.clientY > rect.top + rect.height / 2;
  row.classList.toggle("drop-before", !placeAfter);
  row.classList.toggle("drop-after", placeAfter);
  return true;
}

function handleColumnConfigDrop(event) {
  const row = event.target.closest(".column-config-row");
  if (!row || !draggedColumnId) return false;
  event.preventDefault();
  stopColumnDragAutoScroll();
  const rect = row.getBoundingClientRect();
  const placeAfter = event.clientY > rect.top + rect.height / 2;
  if (moveColumn(draggedColumnId, row.dataset.columnId, placeAfter)) {
    saveLayout();
    renderColumnConfig();
    render();
    markProjectDirty();
  }
  return true;
}

function finishColumnConfigDrag() {
  draggedColumnId = "";
  activeColumnConfigList = null;
  stopColumnDragAutoScroll();
  document.querySelectorAll(".column-config-row").forEach(row =>
    row.classList.remove("dragging", "drop-before", "drop-after")
  );
}

function bindEvents() {
  document.querySelectorAll(".page-tab").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.page)));
  document.querySelectorAll(".mode-tab").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.mode === "multi") switchPage("multiCompare");
    else switchPage("mapping");
  }));
  [els.multiCompareProjectA, els.multiFlowProjectA].forEach(select => select?.addEventListener("change", event => {
    state.multiProjectA = event.target.value;
    renderMultiProjectPages();
    markProjectDirty();
  }));
  [els.multiCompareProjectB, els.multiFlowProjectB].forEach(select => select?.addEventListener("change", event => {
    state.multiProjectB = event.target.value;
    renderMultiProjectPages();
    markProjectDirty();
  }));
  els.multiCompareUserField?.addEventListener("change", () => {
    state.multiUserField = els.multiCompareUserField.value;
    renderMultiProjectPages();
    markProjectDirty();
  });
  els.multiCompareRefresh?.addEventListener("click", renderMultiProjectPages);
  els.multiFlowMetricA?.addEventListener("change", () => {
    state.multiFlowMetricA = els.multiFlowMetricA.value;
    renderMultiFlowPage();
    markProjectDirty();
  });
  els.multiFlowMetricB?.addEventListener("change", () => {
    state.multiFlowMetricB = els.multiFlowMetricB.value;
    renderMultiFlowPage();
    markProjectDirty();
  });
  els.multiFlowThreshold?.addEventListener("change", () => {
    state.multiFlowThreshold = Math.max(0, Number(els.multiFlowThreshold.value) || 0);
    renderMultiFlowPage();
    markProjectDirty();
  });
  els.multiFlowAddMapping?.addEventListener("click", () => {
    const projectA = projectContext(state.multiProjectA);
    const projectB = projectContext(state.multiProjectB);
    const devicesA = uniqueDeviceValues(projectA);
    const devicesB = uniqueDeviceValues(projectB);
    state.multiFlowMappings.push({ a: devicesA[0] || "", b: devicesB[0] || "", label: "" });
    renderMultiFlowPage();
    markProjectDirty();
  });
  els.multiFlowDeviceMappings?.addEventListener("change", event => {
    const row = event.target.closest(".flow-device-row");
    if (!row) return;
    const index = Number(row.dataset.index);
    if (!state.multiFlowMappings[index]) return;
    const previous = state.multiFlowMappings[index];
    const labelInput = row.querySelector(".flow-map-label");
    const rawLabel = labelInput?.value.trim() || "";
    const previousDefault = labelInput?.dataset.default || flowMappingDefaultLabel(previous);
    const next = {
      a: row.querySelector(".flow-map-a")?.value || "",
      b: row.querySelector(".flow-map-b")?.value || ""
    };
    const labelIsDefault = !previous.label || rawLabel === previousDefault;
    state.multiFlowMappings[index] = {
      ...next,
      label: labelIsDefault ? "" : rawLabel
    };
    renderMultiFlowPage();
    markProjectDirty();
  });
  els.multiFlowDeviceMappings?.addEventListener("click", event => {
    const button = event.target.closest(".flow-map-remove");
    if (!button) return;
    const row = button.closest(".flow-device-row");
    state.multiFlowMappings.splice(Number(row.dataset.index), 1);
    renderMultiFlowPage();
    markProjectDirty();
  });
  els.multiFlowRefresh?.addEventListener("click", renderMultiFlowPage);
  const selectMultiFlow = key => {
    if (!key) return;
    state.multiFlowSelectedKey = key;
    renderMultiFlowPage();
    markProjectDirty();
  };
  els.multiFlowChart?.addEventListener("click", event => {
    const target = event.target.closest("[data-flow-key]");
    if (target) selectMultiFlow(target.dataset.flowKey || "");
  });
  els.multiFlowChart?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest("[data-flow-key]");
    if (!target) return;
    event.preventDefault();
    selectMultiFlow(target.dataset.flowKey || "");
  });
  els.multiFlowTable?.addEventListener("click", event => {
    const row = event.target.closest("[data-flow-key]");
    if (row) selectMultiFlow(row.dataset.flowKey || "");
  });
  els.multiFlowTable?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-flow-key]");
    if (!row) return;
    event.preventDefault();
    selectMultiFlow(row.dataset.flowKey || "");
  });
  els.multiFlowClearSelection?.addEventListener("click", () => {
    state.multiFlowSelectedKey = "";
    renderMultiFlowPage();
    markProjectDirty();
  });
  els.projectTabs.addEventListener("click", event => {
    const close = event.target.closest("[data-close-tab]");
    if (close) {
      event.stopPropagation();
      closeProjectTab(close.dataset.closeTab || "");
      return;
    }
    const rename = event.target.closest("[data-rename-tab]");
    if (rename) {
      event.stopPropagation();
      startRenameProjectTab(rename.dataset.renameTab || "");
      return;
    }
    const activate = event.target.closest("[data-activate-tab]");
    if (activate) activateProjectTab(activate.dataset.activateTab || "");
  });
  els.projectTabs.addEventListener("keydown", event => {
    if (event.target.closest(".project-tab-title-input")) {
      if (event.key === "Enter") {
        event.preventDefault();
        const input = event.target.closest(".project-tab-title-input");
        renameProjectTab(input.dataset.tabName || "", input.value, { persist: true });
        renderProjectTabs();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        state.projectTabs.forEach(tab => { tab.renaming = false; });
        renderProjectTabs();
      }
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    const tab = event.target.closest("[data-activate-tab]");
    if (!tab) return;
    event.preventDefault();
    activateProjectTab(tab.dataset.activateTab || "");
  });
  els.projectTabs.addEventListener("input", event => {
    const input = event.target.closest(".project-tab-title-input");
    if (!input) return;
    renameProjectTab(input.dataset.tabName || "", input.value);
  });
  els.projectTabs.addEventListener("change", event => {
    const input = event.target.closest(".project-tab-title-input");
    if (!input) return;
    renameProjectTab(input.dataset.tabName || "", input.value, { persist: true });
    renderProjectTabs();
  });
  els.projectTabs.addEventListener("focusout", event => {
    const input = event.target.closest(".project-tab-title-input");
    if (!input) return;
    renameProjectTab(input.dataset.tabName || "", input.value, { persist: true });
    renderProjectTabs();
  });
  els.projectTabs.addEventListener("dragstart", event => {
    const handle = event.target.closest("[data-drag-tab]");
    if (!handle) return;
    draggedProjectTabId = handle.dataset.dragTab || "";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedProjectTabId);
    handle.closest(".project-tab-item")?.classList.add("dragging");
  });
  els.projectTabs.addEventListener("dragover", event => {
    if (!draggedProjectTabId) return;
    const tab = event.target.closest(".project-tab-item");
    if (!tab || tab.dataset.tabId === draggedProjectTabId) return;
    event.preventDefault();
    tab.classList.add("drop-target");
  });
  els.projectTabs.addEventListener("dragleave", event => {
    event.target.closest(".project-tab-item")?.classList.remove("drop-target");
  });
  els.projectTabs.addEventListener("drop", event => {
    if (!draggedProjectTabId) return;
    const tab = event.target.closest(".project-tab-item");
    els.projectTabs.querySelectorAll(".drop-target").forEach(item => item.classList.remove("drop-target"));
    if (!tab || tab.dataset.tabId === draggedProjectTabId) return;
    event.preventDefault();
    moveProjectTab(draggedProjectTabId, tab.dataset.tabId || "");
  });
  els.projectTabs.addEventListener("dragend", () => {
    draggedProjectTabId = "";
    els.projectTabs.querySelectorAll(".dragging, .drop-target").forEach(item => item.classList.remove("dragging", "drop-target"));
  });
  els.useSampleProjectButton.addEventListener("click", useSampleProject);
  els.clearProjectPathButton.addEventListener("click", clearProjectPath);
  els.newProjectTabButton.addEventListener("click", createNewProjectTab);
  els.chooseProjectFolderButton?.addEventListener("click", async () => {
    try {
      await chooseProjectFolder();
      showProjectRecoveryActions(false);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setProjectStatus(`项目文件夹选择失败：${error.message}`);
    }
  });
  els.loadProjectButton?.addEventListener("click", async () => {
    els.loadProjectButton.disabled = true;
    setProjectStatus("正在加载项目…");
    try {
      await loadProject();
      showProjectRecoveryActions(false);
    } catch (error) {
      setProjectStatus(error.message);
      showProjectRecoveryActions(true);
    } finally {
      els.loadProjectButton.disabled = false;
    }
  });
  els.saveProjectButton.addEventListener("click", async () => {
    els.saveProjectButton.disabled = true;
    setProjectStatus("正在保存项目…");
    try {
      await saveProject();
    } catch (error) {
      setProjectStatus(error.message);
    } finally {
      els.saveProjectButton.disabled = false;
    }
  });
  els.saveProjectConfigButton?.addEventListener("click", async () => {
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
    state.sourceCsvFile = file;
    state.sourceCsvName = file.name || "source.csv";
    const reader = new FileReader();
    reader.onload = () => {
      state.sourceCsvText = String(reader.result || "");
      state.mappingRows = parseCSV(state.sourceCsvText);
      resetMappingOutputs();
      initializeMappingFields();
      validateProtocolRows();
      renderProtocolStatus();
      els.mappingSummary.textContent = `${file.name} · ${state.mappingRows.length} 条记录`;
      if (els.mappingCsvStatus) els.mappingCsvStatus.textContent = `已选择：${file.name}。保存项目时会复制到项目 data 文件夹。`;
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
      await scanPhotoRoot({ force: true });
      state.photoMappingOverrides = {};
      await buildPhotoMapping();
      markProjectDirty();
    } catch (error) {
      els.mappingSummary.textContent = error.message;
    } finally {
      els.runMappingButton.disabled = false;
    }
  });
  els.applyMappingButton.addEventListener("click", applyMappedRows);
  els.downloadPhotoAuditButton.addEventListener("click", downloadPhotoAuditCsv);
  els.mappingMode.addEventListener("change", () => {
    resetMappingOutputs();
    if (els.mappingMode.value === "folders") {
      state.includeBareEarPhotos = false;
      els.includeBareEarPhotos.checked = false;
    }
    renderMappingMode();
    markProjectDirty();
  });
  els.includeBareEarPhotos.addEventListener("change", () => {
    state.includeBareEarPhotos = els.includeBareEarPhotos.checked;
    state.bareEarConfig = bareEarConfigFromControls();
    state.photoMappingOverrides = {};
    resetMappingOutputs();
    renderBareEarConfigControls();
    markProjectDirty();
  });
  [els.bareEarSplitByEar, els.bareEarGenericCount, els.bareEarLeftCount, els.bareEarRightCount].forEach(control => {
    control.addEventListener("change", () => {
      state.bareEarConfig = bareEarConfigFromControls();
      state.photoMappingOverrides = {};
      resetMappingOutputs();
      renderBareEarConfigControls();
      markProjectDirty();
    });
    control.addEventListener("input", () => {
      state.bareEarConfig = bareEarConfigFromControls();
      renderBareEarConfigControls();
    });
  });
  els.singleEarMode.addEventListener("change", () => {
    state.singleEarMode = els.singleEarMode.checked;
    state.photoMappingOverrides = {};
    resetMappingOutputs();
    renderMappingMode();
    markProjectDirty();
  });
  [els.mappingUserField, els.mappingEarField, els.mappingDeviceField, els.viewNamesInput].forEach(control => {
    control.addEventListener("change", () => {
      state.photoMappingOverrides = {};
      resetMappingOutputs();
      renderMappingMode();
      markProjectDirty();
    });
  });
  els.mappingPreview.addEventListener("change", async event => {
    if (event.target.classList.contains("bare-ear-label-input")) {
      updateBareEarLabel(event.target.dataset.field || "", event.target.value);
      renderMappingPreview(state.mappingReviews, els.mappingUserField.value, els.mappingDeviceField.value, state.mappingPhotoFields);
      return;
    }
    if (!event.target.classList.contains("mapping-photo-select")) return;
    const key = `${event.target.dataset.rowIndex}::${event.target.dataset.field}`;
    if (event.target.value) state.photoMappingOverrides[key] = event.target.value;
    else state.photoMappingOverrides[key] = "";
    await buildPhotoMapping();
    markProjectDirty();
  });
  els.mappingPreview.addEventListener("click", event => {
    const moveButton = event.target.closest(".mapping-device-move");
    if (moveButton) {
      moveMappingDeviceGroup(moveButton.dataset.user || "", Number(moveButton.dataset.rowIndex), Number(moveButton.dataset.direction));
      return;
    }
    const earSwapButton = event.target.closest(".mapping-ear-swap");
    if (earSwapButton) {
      swapMappingEarGroups(earSwapButton.dataset.user || "", Number(earSwapButton.dataset.rowIndex));
    }
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
      const isDetailCenterPhoto = Boolean(trigger.dataset.photoCenterUser);
      const isMultiProjectPhoto = Boolean(trigger.closest("#multiComparePage, #multiFlowPage"));
      if (isDetailCenterPhoto && !isMultiProjectPhoto) {
        handleDetailPhotoCenterClick(event);
        if (!event.ctrlKey && !event.metaKey) return;
      }
      openPhotoLightbox(trigger.dataset.previewSrc || trigger.currentSrc || trigger.src, trigger.dataset.previewCaption || trigger.alt || "", trigger);
      return;
    }
    if (event.target === els.photoLightbox) closePhotoLightbox();
  });
  document.addEventListener("dblclick", event => {
    const trigger = event.target.closest(".photo-preview-trigger[data-photo-center-user]");
    if (!trigger) return;
    openPhotoLightbox(trigger.dataset.previewSrc || trigger.currentSrc || trigger.src, trigger.dataset.previewCaption || trigger.alt || "", trigger);
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
    render();
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
  els.comparisonMetricSelect.addEventListener("change", () => {
    state.comparisonMetric = els.comparisonMetricSelect.value;
    renderComparisonPreference();
    markProjectDirty();
  });
  els.comparisonAutoDevices.addEventListener("change", () => {
    state.comparisonAutoDevices = els.comparisonAutoDevices.checked;
    renderComparisonPreference();
    markProjectDirty();
  });
  els.comparisonDeviceA.addEventListener("change", () => {
    state.comparisonDeviceA = els.comparisonDeviceA.value;
    state.comparisonAutoDevices = false;
    renderComparisonPreference();
    markProjectDirty();
  });
  els.comparisonDeviceB.addEventListener("change", () => {
    state.comparisonDeviceB = els.comparisonDeviceB.value;
    state.comparisonAutoDevices = false;
    renderComparisonPreference();
    markProjectDirty();
  });
  els.comparisonThreshold.addEventListener("change", () => {
    state.comparisonThreshold = Math.max(0, Number(els.comparisonThreshold.value) || 0);
    renderComparisonPreference();
    markProjectDirty();
  });
  els.photoCompareVariable?.addEventListener("change", () => {
    state.photoCompareVariable = els.photoCompareVariable.value;
    const levels = photoCompareLevels();
    state.photoCompareLevelA = levels[0] || "";
    state.photoCompareLevelB = levels.find(level => level !== state.photoCompareLevelA) || levels[1] || "";
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoCompareLevelA?.addEventListener("change", () => {
    state.photoCompareLevelA = els.photoCompareLevelA.value;
    if (state.photoCompareLevelB === state.photoCompareLevelA) {
      state.photoCompareLevelB = photoCompareLevels().find(level => level !== state.photoCompareLevelA) || state.photoCompareLevelB;
    }
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoCompareLevelB?.addEventListener("change", () => {
    state.photoCompareLevelB = els.photoCompareLevelB.value;
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoCompareView?.addEventListener("change", () => {
    state.photoCompareView = els.photoCompareView.value;
    state.photoComparePanelSettings = {};
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoComparePhotoSize?.addEventListener("input", () => {
    state.photoComparePhotoSize = Math.max(90, Math.min(260, Number(els.photoComparePhotoSize.value) || 150));
    state.photoComparePanelSettings = {};
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoComparePositionX?.addEventListener("input", () => {
    state.photoComparePositionX = clampPercent(els.photoComparePositionX.value, 50);
    state.photoComparePanelSettings = {};
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoComparePositionY?.addEventListener("input", () => {
    state.photoComparePositionY = clampPercent(els.photoComparePositionY.value, 50);
    state.photoComparePanelSettings = {};
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoCompareZoom?.addEventListener("input", () => {
    state.photoCompareZoom = clampPhotoZoom(els.photoCompareZoom.value, 100);
    state.photoComparePanelSettings = {};
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoCompareGrid?.addEventListener("input", event => {
    const control = event.target.closest(".photo-compare-side-control");
    const side = control?.closest("[data-photo-compare-side]")?.dataset.photoCompareSide || "";
    const setting = control?.dataset.setting || "";
    if (!side || !setting) return;
    setPhotoComparePanelSetting(side, setting, control.value);
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.photoCompareGrid?.addEventListener("change", event => {
    const control = event.target.closest(".photo-compare-side-control");
    const side = control?.closest("[data-photo-compare-side]")?.dataset.photoCompareSide || "";
    const setting = control?.dataset.setting || "";
    if (!side || !setting) return;
    setPhotoComparePanelSetting(side, setting, control.value);
    renderPhotoComparePage();
    markProjectDirty();
  });
  els.comparisonDetails.addEventListener("input", event => {
    if (event.target.classList.contains("user-note-input")) {
      setUserNote(event.target.dataset.user || "", event.target.value, { source: event.target });
      return;
    }
    if (event.target.classList.contains("user-photo-zoom")) {
      updateUserPhotoZoom(event.target.dataset.user || "", event.target.value);
      return;
    }
    if (!event.target.classList.contains("user-photo-position")) return;
    updateUserPhotoPosition(event.target.dataset.user || "", event.target.dataset.axis || "", event.target.value);
  });
  els.comparisonDetails.addEventListener("change", event => {
    if (event.target.classList.contains("user-filter-checkbox")) {
      state.userFilter = selectedUsersFromHeader(event.target.closest(".user-filter-menu") || event.currentTarget);
      state.selectedGroup = null;
      render();
      markProjectDirty();
      return;
    }
    if (handleDetailHeaderChange(event)) return;
    if (event.target.classList.contains("user-view-select")) {
      const user = event.target.dataset.user;
      if (event.target.value) state.userViews[user] = event.target.value;
      else delete state.userViews[user];
      render();
      markProjectDirty();
      return;
    }
    if (event.target.classList.contains("user-note-input")) {
      setUserNote(event.target.dataset.user || "", event.target.value, { source: event.target, dirty: true });
      return;
    }
    if (event.target.classList.contains("user-photo-position")) {
      updateUserPhotoPosition(event.target.dataset.user || "", event.target.dataset.axis || "", event.target.value);
      markProjectDirty();
      return;
    }
    if (event.target.classList.contains("user-photo-zoom")) {
      updateUserPhotoZoom(event.target.dataset.user || "", event.target.value);
      markProjectDirty();
      return;
    }
    const groupKey = event.target.dataset.groupKey;
    if (!groupKey) return;
    const layout = comparisonGroupLayout(groupKey);
    if (event.target.classList.contains("comparison-table-font")) {
      layout.fontSize = Math.max(9, Math.min(18, Number(event.target.value) || layout.fontSize));
    } else if (event.target.classList.contains("comparison-table-photo")) {
      layout.photoSize = Math.max(50, Math.min(180, Number(event.target.value) || layout.photoSize));
    } else if (event.target.classList.contains("comparison-column-visible")) {
      const columnId = event.target.dataset.columnId;
      if (layout.columns[columnId]) layout.columns[columnId].visible = event.target.checked;
    } else if (event.target.classList.contains("comparison-column-width")) {
      const columnId = event.target.dataset.columnId;
      if (layout.columns[columnId]) layout.columns[columnId].width = Math.max(50, Math.min(500, Number(event.target.value) || layout.columns[columnId].width));
    } else {
      return;
    }
    state.comparisonGroupLayouts[groupKey] = layout;
    renderComparisonPreference();
    markProjectDirty();
  });
  els.comparisonDetails.addEventListener("click", event => {
    if (handleDetailHeaderClick(event)) return;
    const button = event.target.closest(".photo-position-reset");
    if (!button) return;
    resetUserPhotoPosition(button.dataset.user || "");
    markProjectDirty();
  });
  bindUserSortDrag(els.comparisonDetails);
  els.comparisonApplyAllTables.addEventListener("click", () => {
    const layout = defaultComparisonGroupLayout();
    layout.fontSize = Math.max(9, Math.min(18, Number(els.comparisonGlobalFontSize.value) || layout.fontSize));
    layout.photoSize = Math.max(50, Math.min(180, Number(els.comparisonGlobalPhotoSize.value) || layout.photoSize));
    els.comparisonGlobalColumns.querySelectorAll(".comparison-global-column-visible").forEach(input => {
      const columnId = input.dataset.columnId;
      if (layout.columns[columnId]) layout.columns[columnId].visible = input.checked;
    });
    els.comparisonGlobalColumns.querySelectorAll(".comparison-global-column-width").forEach(input => {
      const columnId = input.dataset.columnId;
      if (layout.columns[columnId]) layout.columns[columnId].width = Math.max(50, Math.min(500, Number(input.value) || layout.columns[columnId].width));
    });
    ["aBetter", "bBetter", "close", "incomplete"].forEach(key => {
      state.comparisonGroupLayouts[key] = cloneStateData(layout);
    });
    renderComparisonPreference();
    markProjectDirty();
  });
  const comparisonPage = document.getElementById("comparisonPage");
  comparisonPage?.addEventListener("input", event => {
    if (handleLayoutControlInput(event)) return;
    handleColumnConfigInput(event);
  });
  comparisonPage?.addEventListener("change", event => {
    if (handleLayoutControlChange(event)) return;
    const importInput = event.target.closest(".import-config-trigger");
    if (importInput) importDashboardConfigFile(importInput.files[0], importInput);
  });
  comparisonPage?.addEventListener("click", event => {
    if (event.target.closest(".reset-photo-positions-trigger")) {
      if (resetAllUserPhotoPositions()) markProjectDirty();
      return;
    }
    if (event.target.closest(".export-config-trigger")) {
      exportDashboardConfig();
      return;
    }
    if (event.target.closest(".reset-layout-trigger")) {
      state.layout = defaultLayout();
      buildSchema();
      saveLayout();
      applyLayoutVariables();
      renderColumnConfig();
      render();
      markProjectDirty();
    }
  });
  comparisonPage?.addEventListener("dragstart", event => {
    handleColumnConfigDragStart(event);
  });
  comparisonPage?.addEventListener("dragover", event => {
    handleColumnConfigDragOver(event);
  });
  comparisonPage?.addEventListener("dragleave", event => {
    const row = event.target.closest(".column-config-row");
    if (!row || row.contains(event.relatedTarget)) return;
    row.classList.remove("drop-before", "drop-after");
  });
  comparisonPage?.addEventListener("drop", event => {
    handleColumnConfigDrop(event);
  });
  comparisonPage?.addEventListener("dragend", finishColumnConfigDrag);
  els.clearGroupButton.addEventListener("click", () => { state.selectedGroup = null; render(); });
  els.detailSearch.addEventListener("input", () => { state.search = els.detailSearch.value; render(); });
  els.detailHead.addEventListener("change", event => {
    if (event.target.classList.contains("user-filter-checkbox")) {
      state.userFilter = selectedUsersFromHeader();
      state.selectedGroup = null;
      render();
      markProjectDirty();
      return;
    }
    handleDetailHeaderChange(event);
  });
  els.detailHead.addEventListener("click", event => {
    handleDetailHeaderClick(event);
  });
  els.clearColumnFilters.addEventListener("click", () => {
    state.columnFilters = {};
    state.userFilter = null;
    state.selectedGroup = null;
    render();
    markProjectDirty();
  });
  els.exportProjectCsvButton?.addEventListener("click", exportProjectCsv);
  els.globalViewSelect.addEventListener("change", () => {
    state.globalView = els.globalViewSelect.value;
    render();
    markProjectDirty();
  });
  els.resetViewsButton.addEventListener("click", () => {
    state.globalView = photoViewOptions()[0]?.value || "";
    state.userViews = {};
    renderViewControls();
    render();
    markProjectDirty();
  });
  els.resetPhotoPositionsButton?.addEventListener("click", () => {
    if (resetAllUserPhotoPositions()) markProjectDirty();
  });
  els.detailBody.addEventListener("change", event => {
    if (!event.target.classList.contains("user-view-select")) return;
    const user = event.target.dataset.user;
    if (event.target.value) state.userViews[user] = event.target.value;
    else delete state.userViews[user];
    render();
    markProjectDirty();
  });
  els.detailBody.addEventListener("input", event => {
    if (event.target.classList.contains("user-note-input")) {
      setUserNote(event.target.dataset.user || "", event.target.value, { source: event.target });
      return;
    }
    if (event.target.classList.contains("user-photo-zoom")) {
      updateUserPhotoZoom(event.target.dataset.user || "", event.target.value);
      return;
    }
    if (!event.target.classList.contains("user-photo-position")) return;
    updateUserPhotoPosition(event.target.dataset.user || "", event.target.dataset.axis || "", event.target.value);
  });
  els.detailBody.addEventListener("change", event => {
    if (event.target.classList.contains("user-note-input")) {
      setUserNote(event.target.dataset.user || "", event.target.value, { source: event.target, dirty: true });
      return;
    }
    if (event.target.classList.contains("user-photo-position")) {
      updateUserPhotoPosition(event.target.dataset.user || "", event.target.dataset.axis || "", event.target.value);
      markProjectDirty();
      return;
    }
    if (!event.target.classList.contains("user-photo-zoom")) return;
    updateUserPhotoZoom(event.target.dataset.user || "", event.target.value);
    markProjectDirty();
  });
  els.detailBody.addEventListener("click", event => {
    const button = event.target.closest(".photo-position-reset");
    if (!button) return;
    resetUserPhotoPosition(button.dataset.user || "");
    markProjectDirty();
  });
  bindUserSortDrag(els.detailBody);
  els.fontSizeControl.addEventListener("input", () => {
    state.layout.fontSize = Number(els.fontSizeControl.value);
    applyLayoutVariables(); saveLayout(); markProjectDirty();
  });
  els.photoSizeControl.addEventListener("input", () => {
    state.layout.photoSize = Number(els.photoSizeControl.value);
    applyLayoutVariables(); saveLayout(); markProjectDirty();
  });
  els.photoZoomControl?.addEventListener("input", () => {
    state.layout.photoZoom = clampPhotoZoom(els.photoZoomControl.value, state.layout.photoZoom ?? 100);
    applyLayoutVariables(); saveLayout(); markProjectDirty();
  });
  els.photoPositionXControl?.addEventListener("input", () => {
    state.layout.photoPositionX = Number(els.photoPositionXControl.value);
    applyLayoutVariables(); saveLayout(); markProjectDirty();
  });
  els.photoPositionYControl?.addEventListener("input", () => {
    state.layout.photoPositionY = Number(els.photoPositionYControl.value);
    applyLayoutVariables(); saveLayout(); markProjectDirty();
  });
  els.detailPhotoModeControl.addEventListener("change", () => {
    state.layout.detailPhotoMode = sanitizeDetailPhotoMode(els.detailPhotoModeControl.value);
    applyLayoutVariables(); saveLayout();
    render();
    markProjectDirty();
  });
  els.exportConfigButton.addEventListener("click", exportDashboardConfig);
  els.importConfigInput.addEventListener("change", event => {
    importDashboardConfigFile(event.target.files[0], els.importConfigInput);
  });
  els.columnConfigList.addEventListener("change", event => {
    handleLayoutControlChange(event);
  });
  els.columnConfigList.addEventListener("input", event => {
    handleColumnConfigInput(event);
  });
  els.columnConfigList.addEventListener("dragstart", event => {
    handleColumnConfigDragStart(event);
  });
  els.columnConfigList.addEventListener("dragover", event => {
    handleColumnConfigDragOver(event);
  });
  els.columnConfigList.addEventListener("dragleave", event => {
    const row = event.target.closest(".column-config-row");
    if (!row || row.contains(event.relatedTarget)) return;
    row.classList.remove("drop-before", "drop-after");
  });
  els.columnConfigList.addEventListener("drop", event => {
    handleColumnConfigDrop(event);
  });
  els.columnConfigList.addEventListener("dragend", () => {
    finishColumnConfigDrag();
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
  upsertProjectTab("sample", { title: "示例数据" });
  updateProjectFolderStatus();
  if (state.serverProjectId) {
    els.projectPathInput.value = state.serverProjectId;
    syncProjectFileNameFromPath(state.serverProjectId);
    if (els.chooseProjectFolderButton) els.chooseProjectFolderButton.disabled = true;
    updateProjectFolderStatus("服务器项目模式：项目由服务器管理。");
    setProjectStatus(`正在加载服务器项目：${state.serverProjectId}`);
    try {
      await loadServerProject();
      showProjectRecoveryActions(false);
    } catch (error) {
      setProjectStatus(`服务器项目自动加载失败：${error.message}`);
      showProjectRecoveryActions(true);
    }
    return;
  }
  const projectFromUrl = new URL(window.location.href).searchParams.get("project");
  const explicitProjectFromUrl = projectFromUrl && projectFromUrl !== defaultProjectPath();
  if (explicitProjectFromUrl) {
    els.projectPathInput.value = projectFromUrl;
    syncProjectFileNameFromPath(projectFromUrl);
    try {
      await loadProject(projectFromUrl);
      showProjectRecoveryActions(false);
    } catch (error) {
      setProjectStatus(`自动加载失败：${error.message}`);
      showProjectRecoveryActions(true);
    }
  } else if (window.location.protocol === "file:") {
    setProjectPath(defaultProjectPath());
    setProjectStatus("当前是 file:// 打开；保存项目和扫描照片需要通过启动器打开看板。");
  } else {
    const loaded = await autoLoadProjectsFolder();
    const loadedStoredFolder = loaded ? false : await autoLoadStoredProjectFolder();
    if (!loaded && !loadedStoredFolder) {
      setProjectPath(defaultProjectPath());
      setProjectStatus(`默认项目路径：${state.projectPath}`);
    }
  }
}

start().catch(error => {
  console.error(error);
  document.body.innerHTML = `<div class="empty-state">无法读取示例 CSV。请使用项目启动器打开页面。</div>`;
});
