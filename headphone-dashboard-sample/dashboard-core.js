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
    return /pressure_(?:score|relief_score)$|挤压/i.test(field);
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

  function uniqueValues(rows = [], field) {
    return [...new Set(rows.map(row => row[field]).filter(Boolean))].sort((a, b) => naturalCompare(a, b));
  }

  function inferEarLabel(value) {
    const text = String(value || "").trim();
    const token = normalizeToken(text);
    if (!token) return "";
    if (/左耳|左侧|左/.test(text) || token === "l" || token === "left" || token.includes("leftear")) return "左耳";
    if (/右耳|右侧|右/.test(text) || token === "r" || token === "right" || token.includes("rightear")) return "右耳";
    return "";
  }

  function earSortKey(value) {
    const label = inferEarLabel(value) || String(value || "");
    if (label === "左耳") return 0;
    if (label === "右耳") return 1;
    return 2;
  }

  function viewSortKey(value) {
    const token = normalizeToken(value);
    if (/正面|front/.test(token)) return 0;
    if (/侧面|side|profile/.test(token)) return 1;
    if (/背面|后面|back|rear/.test(token)) return 2;
    return 10;
  }

  function folderEarValues(rows = [], earField, files = []) {
    const ears = [];
    const seen = new Set();
    const add = value => {
      const label = inferEarLabel(value) || String(value || "").trim();
      const key = normalizeToken(label);
      if (!label || !key || seen.has(key)) return;
      seen.add(key);
      ears.push(label);
    };
    if (earField) rows.forEach(row => add(row[earField]));
    files.forEach(file => pathParts(file).forEach(part => {
      const inferred = inferEarLabel(part);
      if (inferred) add(inferred);
    }));
    return ears.sort((a, b) => earSortKey(a) - earSortKey(b) || naturalCompare(a, b));
  }

  function stripEarFromView(view, ear) {
    return String(view || "")
      .replace(new RegExp(String(ear).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
      .replace(/^[\s_\-—–/\\()[\]{}【】（）:：,，.。]+|[\s_\-—–/\\()[\]{}【】（）:：,，.。]+$/g, "") ||
      String(view || "");
  }

  function viewDescriptors(rows = [], options = {}) {
    const { mode = "sequence", earField, views = [], files = [] } = options;
    const ears = mode === "folders" ? folderEarValues(rows, earField, files) : (earField ? folderEarValues(rows, earField, files) : []);
    const hasEarInViews = ears.length && views.some(view => ears.some(ear => folderPartMatches(view, ear)));
    const items = mode === "folders" && ears.length && !hasEarInViews ?
      ears.flatMap(ear => views.map(view => ({ ear, view, label: `${ear}_${view}` }))) :
      views.map(view => {
        const ear = ears.find(item => folderPartMatches(view, item)) || "";
        const cleanView = ear ? stripEarFromView(view, ear) : view;
        return { ear, view: cleanView, label: view };
      });
    const fields = photoFieldNames(items.map(item => item.label));
    return items.map((item, index) => ({
      ...item,
      field: fields[index],
      label: item.ear ? `${item.ear} · ${item.view}` : item.view
    }));
  }

  function pathParts(file) {
    return String(file.relative_path || file.path || file.absolute_path || "")
      .split(/[\\/]/)
      .filter(Boolean)
      .slice(0, -1);
  }

  function normalizeToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_\-—–/\\()[\]{}【】（）:：,，.。]+/g, "");
  }

  function folderPartMatches(part, value) {
    const token = normalizeToken(value);
    const folder = normalizeToken(part);
    return token && folder && (folder === token || folder.includes(token) || token.includes(folder));
  }

  function partsInclude(parts, value) {
    return parts.some(part => folderPartMatches(part, value));
  }

  function matchedPart(parts, value) {
    return parts.find(part => folderPartMatches(part, value)) || "";
  }

  function residualFolderParts(parts, excluded = []) {
    return parts
      .map(part => cleanFolderViewName(part))
      .filter(part => part && !excluded.some(value => value && folderPartMatches(part, value)));
  }

  function cleanFolderViewName(part) {
    return String(part || "")
      .trim()
      .replace(/^(view|angle|direction|方向|视角)[\s_\-—–:：]+/i, "")
      .trim();
  }

  function inferFolderViews(rows = [], files = [], options = {}) {
    const { userField, earField, deviceField } = options;
    const ears = folderEarValues(rows, earField, files);
    const views = [];
    const seen = new Set();
    files.forEach(file => {
      const parts = pathParts(file);
      rows.forEach(row => {
        if (!partsInclude(parts, row[userField])) return;
        if (deviceField && row[deviceField] && !partsInclude(parts, row[deviceField])) return;
        const residual = residualFolderParts(parts, [row[userField], ...ears, deviceField ? row[deviceField] : ""]);
        const candidates = deviceField ? residual : residual.slice(-1);
        candidates.forEach(view => {
          const key = normalizeToken(view);
          if (view && key && !seen.has(key)) {
            seen.add(key);
            views.push(view);
          }
        });
      });
    });
    return views.sort((a, b) => viewSortKey(a) - viewSortKey(b) || naturalCompare(a, b));
  }

  function emptyPhotoRows(rows, photoFields) {
    const existingPhotoFields = Object.keys(rows[0] || {}).filter(field => /photo|image|picture|照片|图片/i.test(field));
    return rows.map(row => {
      const copy = { ...row };
      existingPhotoFields.forEach(field => delete copy[field]);
      photoFields.forEach(field => { copy[field] = ""; });
      return copy;
    });
  }

  function inferFolderPhotoCombos(rows = [], files = [], options = {}) {
    const { userField, earField, deviceField, views = [] } = options;
    const ears = folderEarValues(rows, earField, files);
    const devices = uniqueValues(rows, deviceField);
    const users = uniqueValues(rows, userField);
    const combos = [];
    const seen = new Set();

    files.forEach(file => {
      const parts = pathParts(file);
      const user = users.find(value => partsInclude(parts, value)) || "";
      const ear = ears.find(value => partsInclude(parts, value)) || "";
      const view = views.find(value => partsInclude(parts, value)) || "";
      if (!deviceField) {
        if (!user || seen.has(user)) return;
        seen.add(user);
        combos.push({ user, device: "" });
        return;
      }
      const knownDevice = devices.find(value => partsInclude(parts, value));
      const residual = residualFolderParts(parts, [user, ear, view]);
      const device = knownDevice || residual[residual.length - 1] || "";
      if (!user || !device) return;
      const key = [user, device].join("|||");
      if (seen.has(key)) return;
      seen.add(key);
      combos.push({ user, device });
    });

    return combos.sort((a, b) =>
      naturalCompare(a.user, b.user) ||
      naturalCompare(a.device, b.device)
    );
  }

  function expandRowsForPhotoCombos(rows = [], files = [], options = {}) {
    const { mode = "sequence", userField, earField, deviceField, views = [] } = options;
    if (mode !== "folders") return rows.map(row => ({ ...row }));
    const combos = inferFolderPhotoCombos(rows, files, options);
    if (!combos.length) return rows.map(row => ({ ...row }));

    const templatesByUser = new Map();
    rows.forEach(row => {
      const user = row[userField];
      if (user && !templatesByUser.has(user)) templatesByUser.set(user, row);
    });

    const existingByCombo = new Map();
    rows.forEach(row => {
      const key = deviceField ? [row[userField] || "", row[deviceField] || ""].join("|||") : String(row[userField] || "");
      if (!existingByCombo.has(key)) existingByCombo.set(key, row);
    });

    const expanded = [...existingByCombo.values()].map(row => ({ ...row }));
    combos.forEach(combo => {
      const key = deviceField ? [combo.user, combo.device].join("|||") : combo.user;
      if (existingByCombo.has(key)) return;
      const source = templatesByUser.get(combo.user) || {};
      const row = {
        ...source,
        [userField]: combo.user
      };
      if (deviceField) row[deviceField] = combo.device;
      expanded.push(row);
    });

    return expanded;
  }

  function inferSingleDeviceSelections(rows = [], files = [], options = {}) {
    const { userField, earField, deviceField, views = [] } = options;
    if (deviceField) return new Map();
    const users = uniqueValues(rows, userField);
    const ears = folderEarValues(rows, earField, files);
    const selections = new Map();
    users.forEach(user => {
      const seen = new Set();
      const candidates = [];
      files.forEach(file => {
        const parts = pathParts(file);
        if (!partsInclude(parts, user)) return;
        const view = views.find(value => partsInclude(parts, value)) || "";
        const residual = residualFolderParts(parts, [user, ...ears, view]);
        const device = residual[0] || "";
        const key = normalizeToken(device);
        if (!device || !key || seen.has(key)) return;
        seen.add(key);
        candidates.push(device);
      });
      candidates.sort((a, b) => naturalCompare(a, b));
      if (candidates.length) selections.set(user, { selected: candidates[0], candidates });
    });
    return selections;
  }

  function mapPhotosToRows(rows = [], files = [], options = {}) {
    const { mode = "sequence", userField, earField, deviceField, views = [], overrides = {} } = options;
    const expandedRows = expandRowsForPhotoCombos(rows, files, options);
    const descriptors = viewDescriptors(expandedRows, { ...options, files });
    const photoFields = descriptors.map(item => item.field);
    const singleDeviceSelections = mode === "folders" ? inferSingleDeviceSelections(expandedRows, files, { ...options, views }) : new Map();
    const folderEars = mode === "folders" ? folderEarValues(expandedRows, earField, files) : [];
    const applicableDescriptors = row => descriptors.filter(item =>
      mode === "folders" || !item.ear || !earField || !row[earField] || folderPartMatches(row[earField], item.ear)
    );
    if (mode === "folders") {
      const mapped = emptyPhotoRows(expandedRows, photoFields);
      const reviewMap = new Map();
      expandedRows.forEach((row, rowIndex) => {
        const matchedFiles = [];
        const applicable = applicableDescriptors(row);
        applicable.forEach(item => {
          const overrideKey = `${rowIndex}::${item.field}`;
          const file = files
            .slice()
            .sort((a, b) => naturalCompare(a.relative_path || a.name, b.relative_path || b.name))
            .find(candidate => {
              const parts = pathParts(candidate);
              const singleDevice = singleDeviceSelections.get(row[userField]);
              const inferredDevice = singleDevice ? residualFolderParts(parts, [row[userField], ...folderEars, item.view])[0] || "" : "";
              return partsInclude(parts, row[userField]) &&
                (!item.ear || partsInclude(parts, item.ear)) &&
                (mode === "folders" || !earField || !row[earField] || partsInclude(parts, row[earField])) &&
                (!deviceField || partsInclude(parts, row[deviceField])) &&
                (!singleDevice || !inferredDevice || folderPartMatches(inferredDevice, singleDevice.selected)) &&
                partsInclude(parts, item.view);
            });
          if (file) matchedFiles.push(file);
          mapped[rowIndex][item.field] = overrideKey in overrides ? overrides[overrideKey] : file?.absolute_path || "";
        });
        const expected = applicable.length;
        const user = row[userField] || `第 ${rowIndex + 1} 行`;
        const review = reviewMap.get(user) || {
          user,
          entries: [],
          files: [],
          expected: 0,
          notes: [],
          status: "ok"
        };
        review.entries.push({ row, rowIndex });
        review.files.push(...matchedFiles);
        review.expected += expected;
        const note = singleDeviceSelections.get(row[userField])?.candidates.length > 1 ?
          `未配置设备字段，已按自然排序使用第一套设备：${singleDeviceSelections.get(row[userField]).selected}` : "";
        if (note && !review.notes.includes(note)) review.notes.push(note);
        review.status = review.files.length === review.expected ? "ok" : review.files.length < review.expected ? "missing" : "extra";
        reviewMap.set(user, review);
      });
      const reviews = [...reviewMap.values()];
      return { mapped, reviews, photoFields, photoViews: descriptors };
    }

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

    const mapped = emptyPhotoRows(rows, photoFields);
    const reviews = [];

    rowsByUser.forEach((entries, user) => {
      const userFiles = filesByUser.get(user) || [];
      let cursor = 0;
      entries.forEach(entry => {
        applicableDescriptors(entry.row).forEach(item => {
          const overrideKey = `${entry.rowIndex}::${item.field}`;
          const file = userFiles[cursor];
          mapped[entry.rowIndex][item.field] = overrideKey in overrides ? overrides[overrideKey] : file?.absolute_path || "";
          cursor += 1;
        });
      });
      const expected = entries.reduce((sum, entry) => sum + applicableDescriptors(entry.row).length, 0);
      reviews.push({
        user,
        entries,
        files: userFiles,
        expected,
        status: userFiles.length === expected ? "ok" : userFiles.length < expected ? "missing" : "extra"
      });
    });

    return { mapped, reviews, photoFields, photoViews: descriptors };
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
      mappingMode: state.mappingMode || "sequence",
      mappingFields: state.mappingFields || {},
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
      mappingMode: project.mappingMode === "folders" ? "folders" : "sequence",
      mappingFields: project.mappingFields && typeof project.mappingFields === "object" ? project.mappingFields : {},
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
    folderEarValues,
    inferFolderPhotoCombos,
    expandRowsForPhotoCombos,
    viewDescriptors,
    inferFolderViews,
    mapPhotosToRows,
    validateRows,
    sanitizeDashboardConfig,
    buildProjectDocument,
    sanitizeProjectDocument
  };
});
