(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DashboardCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic"];

  function imagePathPattern() {
    return new RegExp(`\\.(${IMAGE_EXTENSIONS.join("|")})(?:[?#].*)?$`, "i");
  }

  function isImagePath(value) {
    return imagePathPattern().test(String(value || ""));
  }

  function isPhotoField(field, rows = []) {
    return /photo|image|picture|照片|图片/i.test(field) ||
      rows.some(row => isImagePath(row[field]));
  }

  function isNumericField(field, rows = []) {
    const values = rows.map(row => row[field]).filter(value => value !== "");
    return values.length > 0 && values.every(value => Number.isFinite(Number(value)));
  }

  function isScoreMetric(field) {
    return /score$|rating$|satisfaction|comfort|stability|满意|舒适|稳定|评分|得分/i.test(field);
  }

  function computeAxisRange(values, mode, metric) {
    const finiteValues = values.map(Number).filter(Number.isFinite);
    if (!finiteValues.length) return { axisMin: 0, axisMax: isScoreMetric(metric) ? 10 : 1 };
    if (mode === "full" && isScoreMetric(metric)) return { axisMin: 0, axisMax: 10 };

    const dataMin = Math.min(...finiteValues);
    const dataMax = Math.max(...finiteValues);
    const padding = Math.max((dataMax - dataMin) * 0.2, 0.5);
    const axisMin = Math.max(0, Math.floor((dataMin - padding) * 2) / 2);
    const axisMax = Math.ceil((dataMax + padding) * 2) / 2;
    return { axisMin, axisMax: axisMax > axisMin ? axisMax : axisMin + 1 };
  }

  function numericSummary(rows = [], field) {
    const values = rows
      .map(row => row[field])
      .filter(value => value !== "" && value != null)
      .map(Number)
      .filter(Number.isFinite);
    const n = values.length;
    const mean = n ? values.reduce((sum, value) => sum + value, 0) / n : 0;
    const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
    return { n, mean, sd: Math.sqrt(variance) };
  }

  function isPressureField(field) {
    return /pressure_score$|挤压/i.test(field);
  }

  function inferFieldRole(field, rows = []) {
    if (/^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) return "user_id";
    if (/^device_name$|device_id|condition|设备|条件/i.test(field)) return "device";
    if (isPhotoField(field, rows)) return "photo";
    if (isPressureField(field)) return "pressure";
    if (/record|comment|备注|说明|description/i.test(field)) return "ignore";
    if (/gender|sex|age|年龄|性别|ear_|concha|canal|protrusion|helix|耳|甲腔|耳道|外展|耳轮/i.test(field)) return "user";
    if (isScoreMetric(field) && isNumericField(field, rows)) return "metric";
    if (isNumericField(field, rows)) return "metric";
    return "dimension";
  }

  function resolveFieldRoles(headers = [], rows = [], overrides = {}) {
    return Object.fromEntries(headers.map(field => [field, overrides[field] || inferFieldRole(field, rows)]));
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function photoFieldNames(views = []) {
    const used = new Set();
    return views.map((view, index) => {
      const base = `photo_${String(view).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || `view_${index + 1}`}`;
      let field = base;
      let suffix = 2;
      while (used.has(field)) field = `${base}_${suffix++}`;
      used.add(field);
      return field;
    });
  }

  function mapPhotosToRows(rows = [], files = [], options = {}) {
    const { userField, views = [], overrides = {} } = options;
    const photoFields = photoFieldNames(views);
    const filesByUser = new Map();
    files.forEach(file => {
      if (!filesByUser.has(file.user_folder)) filesByUser.set(file.user_folder, []);
      filesByUser.get(file.user_folder).push(file);
    });
    filesByUser.forEach(userFiles => userFiles.sort((a, b) => naturalCompare(a.name, b.name)));

    const rowsByUser = new Map();
    rows.forEach((row, rowIndex) => {
      const user = row[userField];
      if (!rowsByUser.has(user)) rowsByUser.set(user, []);
      rowsByUser.get(user).push({ row, rowIndex });
    });

    const existingPhotoFields = Object.keys(rows[0] || {}).filter(field => /photo|image|picture|照片|图片/i.test(field));
    const mapped = rows.map(row => {
      const copy = { ...row };
      existingPhotoFields.forEach(field => delete copy[field]);
      return copy;
    });
    const reviews = [];

    rowsByUser.forEach((entries, user) => {
      const userFiles = filesByUser.get(user) || [];
      const expected = entries.length * views.length;
      entries.forEach((entry, deviceIndex) => {
        views.forEach((view, viewIndex) => {
          const field = photoFields[viewIndex];
          const overrideKey = `${entry.rowIndex}::${field}`;
          const file = userFiles[deviceIndex * views.length + viewIndex];
          mapped[entry.rowIndex][field] = overrideKey in overrides ? overrides[overrideKey] : file?.absolute_path || "";
        });
      });
      reviews.push({
        user,
        entries,
        files: userFiles,
        expected,
        status: userFiles.length === expected ? "ok" : userFiles.length < expected ? "missing" : "extra"
      });
    });

    return { mapped, reviews, photoFields };
  }

  function validateRows(rows = [], options = {}) {
    const { userIdField, deviceField, scoreFields = [], userLevelFields = [] } = options;
    const items = [];
    const seenConditions = new Map();
    const userLevelValues = new Map();

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const user = String(row[userIdField] || "").trim();
      const device = String(row[deviceField] || "").trim();
      if (!user) items.push({ type: "missing_user", severity: "error", rowNumber, message: `第 ${rowNumber} 行缺少用户编号。` });
      if (!device) items.push({ type: "missing_device", severity: "warning", rowNumber, message: `第 ${rowNumber} 行缺少设备/条件。` });

      if (user && device) {
        const key = `${user}|||${device}`;
        if (seenConditions.has(key)) {
          items.push({
            type: "duplicate_condition",
            severity: "warning",
            rowNumber,
            message: `${user} / ${device} 出现重复记录：第 ${seenConditions.get(key)} 行与第 ${rowNumber} 行。`
          });
        } else {
          seenConditions.set(key, rowNumber);
        }
      }

      scoreFields.forEach(field => {
        const raw = row[field];
        if (raw === "" || raw == null) return;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 10) {
          items.push({
            type: "score_out_of_range",
            severity: "error",
            rowNumber,
            field,
            message: `第 ${rowNumber} 行 ${field}=${raw}，不在 0-10 范围内。`
          });
        }
      });

      if (!user) return;
      if (!userLevelValues.has(user)) userLevelValues.set(user, new Map());
      const values = userLevelValues.get(user);
      userLevelFields.forEach(field => {
        const value = String(row[field] || "").trim();
        if (!value) return;
        if (!values.has(field)) {
          values.set(field, { value, rowNumber });
        } else if (values.get(field).value !== value) {
          items.push({
            type: "user_level_conflict",
            severity: "error",
            rowNumber,
            field,
            message: `${user} 的 ${field} 不一致：第 ${values.get(field).rowNumber} 行为 ${values.get(field).value}，第 ${rowNumber} 行为 ${value}。`
          });
        }
      });
    });

    const errors = items.filter(item => item.severity === "error").length;
    const warnings = items.filter(item => item.severity === "warning").length;
    return { totalIssues: items.length, errors, warnings, items };
  }

  function sanitizeDashboardConfig(config = {}, headers = []) {
    const headerSet = new Set(headers);
    const layout = config.layout && typeof config.layout === "object" ? { ...config.layout } : {};
    layout.columns = Array.isArray(layout.columns) ?
      layout.columns.filter(column => headerSet.has(column.id) || String(column.id || "").startsWith("__")) : [];
    const fieldRoleOverrides = Object.fromEntries(Object.entries(config.fieldRoleOverrides || {})
      .filter(([field]) => headerSet.has(field)));
    const keepField = field => headerSet.has(field) ? field : "";
    return {
      layout,
      fieldRoleOverrides,
      primaryDimension: keepField(config.primaryDimension),
      secondaryDimension: keepField(config.secondaryDimension),
      metric: keepField(config.metric),
      yAxisMode: config.yAxisMode === "full" ? "full" : config.yAxisMode === "adaptive" ? "adaptive" : "",
      showErrorBars: typeof config.showErrorBars === "boolean" ? config.showErrorBars : undefined
    };
  }

  function buildProjectDocument(state = {}) {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      rows: Array.isArray(state.rows) ? state.rows : [],
      mappingRows: Array.isArray(state.mappingRows) ? state.mappingRows : [],
      photoRoot: state.photoRoot || "",
      mappingViews: Array.isArray(state.mappingViews) ? state.mappingViews : [],
      photoMappingOverrides: state.photoMappingOverrides || {},
      dashboardConfig: state.dashboardConfig || {}
    };
  }

  function sanitizeProjectDocument(project = {}) {
    const rows = Array.isArray(project.rows) ? project.rows : [];
    const headers = Object.keys(rows[0] || {});
    return {
      version: Number(project.version) || 1,
      savedAt: project.savedAt || "",
      rows,
      mappingRows: Array.isArray(project.mappingRows) ? project.mappingRows : rows.map(row => ({ ...row })),
      photoRoot: String(project.photoRoot || ""),
      mappingViews: Array.isArray(project.mappingViews) ? project.mappingViews.map(String).filter(Boolean) : [],
      photoMappingOverrides: project.photoMappingOverrides && typeof project.photoMappingOverrides === "object" ? project.photoMappingOverrides : {},
      dashboardConfig: sanitizeDashboardConfig(project.dashboardConfig || {}, headers)
    };
  }

  return {
    IMAGE_EXTENSIONS,
    isImagePath,
    isPhotoField,
    isNumericField,
    isScoreMetric,
    computeAxisRange,
    numericSummary,
    isPressureField,
    inferFieldRole,
    resolveFieldRoles,
    naturalCompare,
    photoFieldNames,
    mapPhotosToRows,
    validateRows,
    sanitizeDashboardConfig,
    buildProjectDocument,
    sanitizeProjectDocument
  };
});
