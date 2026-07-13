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

  function pressureSiteLabel(field, label = "") {
    const source = String(label || field || "").trim();
    const known = {
      tragus: "耳屏",
      antitragus: "对耳屏",
      helix: "耳轮",
      concha: "耳甲腔",
      canal: "耳道"
    };
    const token = source
      .toLowerCase()
      .replace(/(?:^|[_\-\s])(?:pressure|relief|score|rating|degree|level|value)(?=$|[_\-\s])/g, " ")
      .replace(/(?:分数|评分|得分|程度|挤压|压力)+$/g, "")
      .replace(/[_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (known[token]) return known[token];
    const cleaned = source
      .replace(/(?:挤压程度|挤压分数|挤压评分|挤压得分|挤压|压力程度|压力分数|压力评分|压力得分|压力)$/g, "")
      .replace(/(?:^|[_\-\s])(?:pressure|relief|score|rating|degree|level|value)(?=$|[_\-\s])/gi, " ")
      .replace(/[_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return known[cleaned.toLowerCase()] || cleaned || source;
  }

  function pressureRiskScore(value, pressureWorst = "low") {
    if (value === "" || value == null) return null;
    const score = Number(value);
    if (!Number.isFinite(score)) return null;
    const clipped = Math.max(0, Math.min(10, score));
    return pressureWorst === "high" ? clipped : 10 - clipped;
  }

  function pressureSiteMeta(field, label = "") {
    const text = `${field || ""} ${label || ""} ${pressureSiteLabel(field, label)}`.toLowerCase();
    const source = `${field || ""} ${label || ""} ${pressureSiteLabel(field, label)}`;
    const includes = (...patterns) => patterns.some(pattern => pattern.test(source) || pattern.test(text));
    if (includes(/耳后|后耳|耳背|后脑|后侧|夹持|耳夹|rear|back|behind|postauricular|clip/i)) {
      return { siteKey: "postauricular", label: "耳后", view: "rear" };
    }
    if (includes(/耳上|上耳|耳挂|挂钩|挂耳|upper|top|hook|hanger/i)) {
      return { siteKey: "upper-ear", label: "耳上/耳挂", view: "top" };
    }
    if (includes(/对耳屏|antitragus/i)) return { siteKey: "antitragus", label: "对耳屏", view: "front" };
    if (includes(/耳屏|tragus/i)) return { siteKey: "tragus", label: "耳屏", view: "front" };
    if (includes(/耳轮|helix/i)) return { siteKey: "helix", label: "耳轮", view: "front" };
    if (includes(/耳甲|concha/i)) return { siteKey: "concha", label: "耳甲腔", view: "front" };
    if (includes(/耳道|耳塞|canal/i)) return { siteKey: "canal", label: "耳道口", view: "front" };
    if (includes(/耳垂|lobe/i)) return { siteKey: "lobe", label: "耳垂", view: "front" };
    const fallback = pressureSiteLabel(field, label);
    return { siteKey: normalizeToken(fallback) || normalizeToken(field), label: fallback, view: "front" };
  }

  function median(values = []) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function aggregatePressureSites(rows = [], pressureFields = [], options = {}) {
    const {
      labels = {},
      pressureWorst = "low",
      aggregation = "mean",
      highThreshold = 6
    } = options;
    const bySite = new Map();
    pressureFields.forEach(field => {
      const meta = pressureSiteMeta(field, labels[field]);
      if (!bySite.has(meta.siteKey)) bySite.set(meta.siteKey, { ...meta, fields: [], risks: [] });
      const site = bySite.get(meta.siteKey);
      site.fields.push(field);
      rows.forEach(row => {
        const risk = pressureRiskScore(row[field], pressureWorst);
        if (risk != null) site.risks.push(risk);
      });
    });
    return [...bySite.values()].map(site => {
      const n = site.risks.length;
      const mean = n ? site.risks.reduce((sum, value) => sum + value, 0) / n : 0;
      const med = median(site.risks);
      const highCount = site.risks.filter(value => value >= highThreshold).length;
      const highRate = n ? highCount / n : 0;
      const value = aggregation === "median" ? med : aggregation === "highRate" ? highRate : mean;
      return {
        siteKey: site.siteKey,
        label: site.label,
        view: site.view,
        fields: site.fields,
        n,
        mean,
        median: med,
        highCount,
        highRate,
        value,
        valueLabel: aggregation === "highRate" ? `${Math.round(value * 100)}%` : value.toFixed(1)
      };
    }).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "zh-CN"));
  }

  function swapMappedPhotoAssignments(rows = [], source = {}, target = {}) {
    const nextRows = rows.map(row => ({ ...row }));
    const sourceRow = nextRows[source.rowIndex];
    const targetRow = nextRows[target.rowIndex];
    if (!sourceRow || !targetRow || !source.field || !target.field) return nextRows;
    const sourceValue = sourceRow[source.field] || "";
    sourceRow[source.field] = targetRow[target.field] || "";
    targetRow[target.field] = sourceValue;
    return nextRows;
  }

  function swapMappedPhotoDeviceGroups(rows = [], sourceRowIndex, targetRowIndex, fields = []) {
    const nextRows = rows.map(row => ({ ...row }));
    const sourceRow = nextRows[sourceRowIndex];
    const targetRow = nextRows[targetRowIndex];
    if (!sourceRow || !targetRow) return nextRows;
    fields.forEach(field => {
      const sourceValue = sourceRow[field] || "";
      sourceRow[field] = targetRow[field] || "";
      targetRow[field] = sourceValue;
    });
    return nextRows;
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

  function combinedEarValues(rows = [], earField, files = [], expectedEars = []) {
    const ears = folderEarValues(rows, earField, files);
    const seen = new Set(ears.map(ear => normalizeToken(ear)));
    expectedEars.forEach(value => {
      const label = inferEarLabel(value) || String(value || "").trim();
      const key = normalizeToken(label);
      if (!label || !key || seen.has(key)) return;
      seen.add(key);
      ears.push(label);
    });
    return ears.sort((a, b) => earSortKey(a) - earSortKey(b) || naturalCompare(a, b));
  }

  function stripEarFromView(view, ear) {
    return String(view || "")
      .replace(new RegExp(String(ear).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
      .replace(/^[\s_\-—–/\\()[\]{}【】（）:：,，.。]+|[\s_\-—–/\\()[\]{}【】（）:：,，.。]+$/g, "") ||
      String(view || "");
  }

  function stripAnyEarFromView(view) {
    const ear = inferEarLabel(view);
    return ear ? stripEarFromView(view, ear) : String(view || "").trim();
  }

  function firstEarInParts(parts = []) {
    for (const part of parts) {
      const ear = inferEarLabel(part);
      if (ear) return ear;
    }
    return "";
  }

  function singleEarViewItems(views = []) {
    const items = [];
    const seen = new Set();
    views.forEach(view => {
      const cleanView = stripAnyEarFromView(view);
      const key = normalizeToken(cleanView);
      if (!cleanView || !key || seen.has(key)) return;
      seen.add(key);
      items.push({ ear: "", view: cleanView, label: cleanView });
    });
    return items;
  }

  function resolveSingleEarMode(rows = [], files = [], options = {}) {
    const { mode = "sequence", userField, earField, deviceField, singleEarMode = false, expectedEars = [] } = options;
    const sortedFiles = (files || [])
      .slice()
      .sort((a, b) => naturalCompare(a.relative_path || a.name || a.absolute_path, b.relative_path || b.name || b.absolute_path));
    const firstEar = folderEarValues([], "", sortedFiles)[0] || firstEarInParts(sortedFiles.flatMap(file => pathParts(file)));
    if (singleEarMode) return { enabled: true, forced: true, automatic: false, ear: firstEar };
    if (mode !== "folders" || !userField || !rows.length || !sortedFiles.length) {
      return { enabled: false, forced: false, automatic: false, ear: "" };
    }
    const expectedEarCount = new Set((expectedEars || []).map(value => inferEarLabel(value) || String(value || "").trim()).filter(Boolean).map(normalizeToken)).size;
    if (earField || expectedEarCount > 0) {
      return { enabled: false, forced: false, automatic: false, ear: firstEar };
    }

    const users = uniqueValues(rows, userField);
    const devices = uniqueValues(rows, deviceField);
    const groups = new Map();
    sortedFiles.forEach(file => {
      if (pathHasBareEar(file)) return;
      const parts = pathParts(file);
      const user = users.find(value => partsInclude(parts, value)) || "";
      if (!user) return;
      const device = deviceField ? devices.find(value => partsInclude(parts, value)) || "" : "";
      if (deviceField && !device) return;
      const ear = firstEarInParts(parts);
      if (!ear) return;
      const key = deviceField ? [user, device].join("|||") : user;
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(ear);
    });

    if (!groups.size) return { enabled: false, forced: false, automatic: false, ear: "" };
    const groupEars = [...groups.values()];
    if (groupEars.some(ears => ears.size !== 1)) return { enabled: false, forced: false, automatic: false, ear: firstEar };
    return { enabled: true, forced: false, automatic: true, ear: firstEar || [...groupEars[0]][0] || "" };
  }

  function viewDescriptors(rows = [], options = {}) {
    const { mode = "sequence", earField, views = [], files = [], expectedEars = [] } = options;
    if (resolveSingleEarMode(rows, files, options).enabled) {
      const items = singleEarViewItems(views);
      const fields = photoFieldNames(items.map(item => item.label));
      return items.map((item, index) => ({
        ...item,
        field: fields[index],
        label: item.view
      }));
    }
    const ears = mode === "folders" ? combinedEarValues(rows, earField, files, expectedEars) : (earField ? combinedEarValues(rows, earField, files, expectedEars) : []);
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

  function bareEarFieldName(ear = "") {
    return ear ? `bare_ear_photo_${String(ear).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "")}` : "bare_ear_photo";
  }

  function numberedBareEarFieldName(ear = "", index = 1, total = 1) {
    const suffix = total > 1 ? `_${index}` : "";
    if (!ear) return `bare_ear_photo${suffix}`;
    return `${bareEarFieldName(ear)}${suffix}`;
  }

  function normalizeBareEarConfig(options = {}) {
    const config = options.bareEarConfig && typeof options.bareEarConfig === "object" ? options.bareEarConfig : {};
    const enabled = Boolean(config.enabled ?? options.includeBareEar);
    const splitByEar = Boolean(config.splitByEar);
    const genericCount = Math.max(0, Math.floor(Number(config.genericCount ?? config.count ?? 1)) || 0);
    const leftCount = Math.max(0, Math.floor(Number(config.leftCount ?? 1)) || 0);
    const rightCount = Math.max(0, Math.floor(Number(config.rightCount ?? 1)) || 0);
    return { enabled, splitByEar, genericCount, leftCount, rightCount };
  }

  function configuredBareEarDescriptors(options = {}) {
    if (!options.bareEarConfig || typeof options.bareEarConfig !== "object") return [];
    const config = normalizeBareEarConfig(options);
    if (!config.enabled) return [];
    if (!config.splitByEar) {
      const count = Math.max(1, config.genericCount);
      return Array.from({ length: count }, (_, index) => ({
        ear: "",
        sequenceIndex: index,
        field: numberedBareEarFieldName("", index + 1, count),
        label: count > 1 ? `空耳 ${index + 1}` : "空耳"
      }));
    }
    return [
      ["左耳", config.leftCount],
      ["右耳", config.rightCount]
    ].flatMap(([ear, count]) => Array.from({ length: count }, (_, index) => ({
      ear,
      sequenceIndex: index,
      field: numberedBareEarFieldName(ear, index + 1, count),
      label: count > 1 ? `${ear} · 空耳 ${index + 1}` : `${ear} · 空耳`
    })));
  }

  function bareEarDescriptorsForEntries(entries = [], options = {}) {
    const { earField } = options;
    const configured = configuredBareEarDescriptors(options);
    if (configured.length) {
      if (!earField || options.singleEarMode) return configured.map(item => ({ ...item, ear: "" }));
      const presentEars = new Set();
      entries.forEach(entry => {
        const raw = entry.row?.[earField] || "";
        const ear = inferEarLabel(raw) || String(raw || "").trim();
        const key = normalizeToken(ear);
        if (key) presentEars.add(key);
      });
      return configured.filter(item => !item.ear || presentEars.has(normalizeToken(item.ear)));
    }
    if (!earField || options.singleEarMode) return [{ ear: "", field: bareEarFieldName(), label: "空耳" }];
    const ears = [];
    const seen = new Set();
    entries.forEach(entry => {
      const raw = entry.row?.[earField] || "";
      const ear = inferEarLabel(raw) || String(raw || "").trim();
      const key = normalizeToken(ear);
      if (!ear || !key || seen.has(key)) return;
      seen.add(key);
      ears.push(ear);
    });
    return ears
      .sort((a, b) => earSortKey(a) - earSortKey(b) || naturalCompare(a, b))
      .map(ear => ({ ear, field: bareEarFieldName(ear), label: `${ear} · 空耳` }));
  }

  function bareEarDescriptors(rows = [], options = {}) {
    const hasFolderBare = options.mode === "folders" && (options.files || []).some(pathHasBareEar);
    const config = normalizeBareEarConfig(options);
    if ((!config.enabled && !hasFolderBare)) return [];
    const byUser = new Map();
    rows.forEach((row, rowIndex) => {
      const user = row[options.userField];
      if (!byUser.has(user)) byUser.set(user, []);
      byUser.get(user).push({ row, rowIndex });
    });
    const fields = new Map();
    byUser.forEach(entries => {
      bareEarDescriptorsForEntries(entries, options).forEach(item => {
        if (!fields.has(item.field)) fields.set(item.field, item);
      });
    });
    return [...fields.values()];
  }

  function isBareEarPart(part) {
    const token = normalizeToken(part);
    return /^(空耳|裸耳|无设备|未佩戴|bare|bareear|noearphone|nodevice|unworn)$/.test(token);
  }

  function pathHasBareEar(file) {
    return pathParts(file).some(isBareEarPart);
  }

  function photoFilesFromBrowserSelection(files = [], options = {}) {
    const imageFiles = [...files].filter(file => isImagePath(file.name || file.webkitRelativePath || ""));
    const rawPaths = imageFiles.map(file => file.webkitRelativePath || file.name || "");
    const firstParts = rawPaths.map(path => path.split(/[\\/]/).filter(Boolean)[0]).filter(Boolean);
    const stripSelectedRoot = firstParts.length > 0 && firstParts.every(part => part === firstParts[0]) &&
      rawPaths.some(path => path.split(/[\\/]/).filter(Boolean).length > 1);
    return imageFiles.map(file => {
      const rawPath = file.webkitRelativePath || file.name || "";
      const parts = rawPath.split(/[\\/]/).filter(Boolean);
      const relativePath = stripSelectedRoot ? parts.slice(1).join("/") : parts.join("/");
      const relativeParts = relativePath.split(/[\\/]/).filter(Boolean);
      const url = options.urlForFile ? options.urlForFile(file) : (file.absolute_path || relativePath);
      return {
        name: file.name || relativeParts[relativeParts.length - 1] || "",
        relative_path: relativePath,
        absolute_path: url,
        user_folder: relativeParts.length > 1 ? relativeParts[0] : "",
        url,
        source: "browser_folder"
      };
    }).sort((a, b) => naturalCompare(a.relative_path, b.relative_path));
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
      .filter(part => part && !isBareEarPart(part) && !excluded.some(value => value && folderPartMatches(part, value)));
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
      if (pathHasBareEar(file) && deviceField) return;
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
      if (pathHasBareEar(file)) return;
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

  function folderRowIdentityKey(row, options = {}) {
    const { userField, earField, deviceField } = options;
    return [
      row[userField] || "",
      earField ? row[earField] || "" : "",
      deviceField ? row[deviceField] || "" : ""
    ].join("|||");
  }

  function folderPhotoComboKey(rowOrCombo, options = {}) {
    const { userField, deviceField } = options;
    const user = rowOrCombo.user ?? rowOrCombo[userField] ?? "";
    const device = rowOrCombo.device ?? (deviceField ? rowOrCombo[deviceField] : "") ?? "";
    return deviceField ? [user, device].join("|||") : String(user || "");
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

    const existingRowsByIdentity = new Map();
    const existingCombos = new Set();
    rows.forEach(row => {
      const identity = folderRowIdentityKey(row, options);
      if (!existingRowsByIdentity.has(identity)) existingRowsByIdentity.set(identity, row);
      existingCombos.add(folderPhotoComboKey(row, options));
    });

    const expanded = [...existingRowsByIdentity.values()].map(row => ({ ...row }));
    combos.forEach(combo => {
      const key = folderPhotoComboKey(combo, options);
      if (existingCombos.has(key)) return;
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
        if (pathHasBareEar(file)) return;
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
    const { mode = "sequence", userField, earField, deviceField, views = [], overrides = {}, expectedEars = [] } = options;
    const expandedRows = expandRowsForPhotoCombos(rows, files, options);
    const singleEarInfo = resolveSingleEarMode(expandedRows, files, options);
    const effectiveOptions = { ...options, singleEarMode: singleEarInfo.enabled };
    const descriptors = viewDescriptors(expandedRows, { ...effectiveOptions, files });
    const bareDescriptors = bareEarDescriptors(expandedRows, { ...effectiveOptions, mode, files });
    const bareDescriptorFields = new Set(bareDescriptors.map(item => item.field));
    const photoFields = [...bareDescriptors.map(item => item.field), ...descriptors.map(item => item.field)];
    const singleDeviceSelections = mode === "folders" ? inferSingleDeviceSelections(expandedRows, files, { ...effectiveOptions, views }) : new Map();
    const folderEars = mode === "folders" ? combinedEarValues(expandedRows, earField, files, expectedEars) : [];
    const applicableDescriptors = row => descriptors.filter(item =>
      mode === "folders" || !item.ear || !earField || !row[earField] || folderPartMatches(row[earField], item.ear)
    );
    if (mode === "folders") {
      const mapped = emptyPhotoRows(expandedRows, photoFields);
      const reviewMap = new Map();
      const bareOverrideValues = new Set(Object.entries(overrides)
        .filter(([key, value]) => /::bare_ear_photo/.test(key) && value)
        .map(([, value]) => value));
      expandedRows.forEach((row, rowIndex) => {
        const matchedFiles = [];
        const extras = [];
        const user = row[userField] || `第 ${rowIndex + 1} 行`;
        const review = reviewMap.get(user) || {
          user,
          entries: [],
          files: [],
          extras: [],
          expected: 0,
          bareSlots: [],
          notes: [],
          status: "ok"
        };
        const existingBareKeys = new Set(review.bareSlots.map(slot => slot.field));
        const bareSlots = bareEarDescriptorsForEntries([{ row, rowIndex }], { ...effectiveOptions, mode })
          .filter(slot => bareDescriptorFields.has(slot.field));
        bareSlots.forEach(slot => {
          if (existingBareKeys.has(slot.field)) return;
          const overrideKey = `${rowIndex}::${slot.field}`;
          const candidates = files
            .slice()
            .sort((a, b) => naturalCompare(a.relative_path || a.name, b.relative_path || b.name))
            .filter(candidate => {
              const parts = pathParts(candidate);
              return pathHasBareEar(candidate) &&
                partsInclude(parts, row[userField]) &&
                (!slot.ear || partsInclude(parts, slot.ear));
            });
          const file = candidates[0];
          const value = overrideKey in overrides ? overrides[overrideKey] : file?.absolute_path || "";
          mapped[rowIndex][slot.field] = value;
          if (value) bareOverrideValues.add(value);
          if (file) matchedFiles.push(file);
          review.bareSlots.push({ ...slot, rowIndex, value });
        });
        const applicable = applicableDescriptors(row);
        applicable.forEach(item => {
          const overrideKey = `${rowIndex}::${item.field}`;
          const candidates = files
            .slice()
            .sort((a, b) => naturalCompare(a.relative_path || a.name, b.relative_path || b.name))
            .filter(candidate => {
              const parts = pathParts(candidate);
              const singleDevice = singleDeviceSelections.get(row[userField]);
              const inferredDevice = singleDevice ? residualFolderParts(parts, [row[userField], ...folderEars, item.view])[0] || "" : "";
              return !pathHasBareEar(candidate) &&
                !bareOverrideValues.has(candidate.absolute_path) &&
                partsInclude(parts, row[userField]) &&
                (!item.ear || partsInclude(parts, item.ear)) &&
                (!singleEarInfo.forced || !singleEarInfo.ear || !firstEarInParts(parts) || partsInclude(parts, singleEarInfo.ear)) &&
                (mode === "folders" || !earField || !row[earField] || partsInclude(parts, row[earField])) &&
                (!deviceField || partsInclude(parts, row[deviceField])) &&
                (!singleDevice || !inferredDevice || folderPartMatches(inferredDevice, singleDevice.selected)) &&
                partsInclude(parts, item.view);
            });
          const file = candidates[0];
          if (file) matchedFiles.push(file);
          if (candidates.length > 1) {
            matchedFiles.push(...candidates.slice(1));
            extras.push({
              row,
              rowIndex,
              field: item.field,
              view: item.label,
              files: candidates.slice(1)
            });
          }
          mapped[rowIndex][item.field] = overrideKey in overrides ? overrides[overrideKey] : file?.absolute_path || "";
        });
        const expected = applicable.length;
        review.entries.push({ row, rowIndex });
        review.files.push(...matchedFiles);
        review.extras.push(...extras);
        review.expected += expected;
        const note = singleDeviceSelections.get(row[userField])?.candidates.length > 1 ?
          `未配置设备字段，已按自然排序使用第一套设备：${singleDeviceSelections.get(row[userField]).selected}` : "";
        if (note && !review.notes.includes(note)) review.notes.push(note);
        const totalExpected = review.expected + review.bareSlots.length;
        review.status = review.files.length === totalExpected ? "ok" : review.files.length < totalExpected ? "missing" : "extra";
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
      const bareConfig = normalizeBareEarConfig(options);
      const bareSlots = bareConfig.enabled ? bareEarDescriptorsForEntries(entries, { ...effectiveOptions, mode }) : [];
      const bareValues = new Set();
      bareSlots.forEach((slot, index) => {
        const applicableEntries = entries.filter(entry =>
          !slot.ear || !earField || folderPartMatches(entry.row[earField], slot.ear)
        );
        const rowIndex = applicableEntries[0]?.rowIndex ?? entries[0]?.rowIndex;
        const overrideKey = `${rowIndex}::${slot.field}`;
        const value = overrideKey in overrides ? overrides[overrideKey] : userFiles[index]?.absolute_path || "";
        if (value) bareValues.add(value);
        applicableEntries.forEach(entry => {
          mapped[entry.rowIndex][slot.field] = value;
        });
        slot.rowIndex = rowIndex;
        slot.value = value;
      });
      const deviceFiles = bareConfig.enabled ?
        userFiles.filter(file => !bareValues.has(file.absolute_path)) :
        userFiles;
      let cursor = 0;
      entries.forEach(entry => {
        applicableDescriptors(entry.row).forEach(item => {
          const overrideKey = `${entry.rowIndex}::${item.field}`;
          const file = deviceFiles[cursor];
          mapped[entry.rowIndex][item.field] = overrideKey in overrides ? overrides[overrideKey] : file?.absolute_path || "";
          cursor += 1;
        });
      });
      const expected = entries.reduce((sum, entry) => sum + applicableDescriptors(entry.row).length, 0);
      reviews.push({
        user,
        entries,
        files: userFiles,
        deviceFiles,
        bareSlots,
        expected,
        status: deviceFiles.length === expected ? "ok" : deviceFiles.length < expected ? "missing" : "extra"
      });
    });

    return { mapped, reviews, photoFields, photoViews: descriptors };
  }

  function buildPhotoAuditRows(reviews = [], photoFields = [], mappedRows = [], options = {}) {
    const { deviceField = "", viewLabels = {} } = options;
    const auditRows = [];
    reviews.forEach(review => {
      review.entries.forEach(entry => {
        photoFields.forEach(field => {
          if (String(field).startsWith("bare_ear_photo")) return;
          const row = mappedRows[entry.rowIndex] || {};
          if (row[field]) return;
          auditRows.push({
            status: "missing",
            user: review.user,
            device: deviceField ? entry.row[deviceField] || "" : "",
            rowIndex: entry.rowIndex + 1,
            field,
            view: viewLabels[field] || field,
            message: "缺失照片"
          });
        });
      });
      (review.bareSlots || []).forEach(slot => {
        const row = mappedRows[slot.rowIndex] || {};
        if (row[slot.field]) return;
        auditRows.push({
          status: "missing",
          user: review.user,
          device: "",
          rowIndex: slot.rowIndex + 1,
          field: slot.field,
          view: slot.label || viewLabels[slot.field] || slot.field,
          message: "缺失空耳照片"
        });
      });
      (review.extras || []).forEach(extra => {
        (extra.files || []).forEach(file => {
          auditRows.push({
            status: "extra",
            user: review.user,
            device: deviceField ? extra.row[deviceField] || "" : "",
            rowIndex: extra.rowIndex + 1,
            field: extra.field,
            view: viewLabels[extra.field] || extra.view || extra.field,
            message: `重复/补拍照片：${file.relative_path || file.name || file.absolute_path || ""}`
          });
        });
      });
      if (review.files.length > review.expected) {
        auditRows.push({
          status: "extra",
          user: review.user,
          device: "",
          rowIndex: "",
          field: "",
          view: "",
          message: `照片过多：实际 ${review.files.length} 张，预期 ${review.expected} 张`
        });
      }
      (review.notes || []).forEach(note => {
        auditRows.push({
          status: "note",
          user: review.user,
          device: "",
          rowIndex: "",
          field: "",
          view: "",
          message: note
        });
      });
    });
    return auditRows;
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
    const userPhotoPositions = Object.fromEntries(Object.entries(config.userPhotoPositions || {})
      .filter(([, value]) => value && typeof value === "object")
      .map(([user, value]) => [user, {
        x: Math.max(0, Math.min(100, Number(value.x))),
        y: Math.max(0, Math.min(100, Number(value.y)))
      }])
      .filter(([, value]) => Number.isFinite(value.x) && Number.isFinite(value.y)));
    const userField = headers.find(field => /^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) || headers[0] || "";
    const validUsers = new Set((config.rows || []).map(row => row?.[userField]).filter(Boolean).map(String));
    const userFilter = Array.isArray(config.userFilter) ?
      config.userFilter.map(String).filter(user => !validUsers.size || validUsers.has(user)) : null;
    const deviceOrderMode = ["source", "asc", "desc"].includes(config.deviceOrderMode) ? config.deviceOrderMode : "";
    const keepField = field => headerSet.has(field) ? field : "";
    return {
      layout,
      fieldRoleOverrides,
      primaryDimension: keepField(config.primaryDimension),
      secondaryDimension: keepField(config.secondaryDimension),
      metric: keepField(config.metric),
      yAxisMode: config.yAxisMode === "full" ? "full" : config.yAxisMode === "adaptive" ? "adaptive" : "",
      showErrorBars: typeof config.showErrorBars === "boolean" ? config.showErrorBars : undefined,
      pressureWorst: config.pressureWorst === "high" ? "high" : config.pressureWorst === "low" ? "low" : "",
      userPhotoPositions,
      userFilter,
      deviceOrderMode
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
      protocolTemplate: state.protocolTemplate && typeof state.protocolTemplate === "object" ? state.protocolTemplate : null,
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
      protocolTemplate: project.protocolTemplate && typeof project.protocolTemplate === "object" ? project.protocolTemplate : null,
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
    pressureSiteLabel,
    pressureRiskScore,
    pressureSiteMeta,
    aggregatePressureSites,
    swapMappedPhotoAssignments,
    swapMappedPhotoDeviceGroups,
    inferFieldRole,
    resolveFieldRoles,
    naturalCompare,
    photoFieldNames,
    photoFilesFromBrowserSelection,
    folderEarValues,
    combinedEarValues,
    resolveSingleEarMode,
    inferFolderPhotoCombos,
    expandRowsForPhotoCombos,
    viewDescriptors,
    inferFolderViews,
    mapPhotosToRows,
    buildPhotoAuditRows,
    validateRows,
    sanitizeDashboardConfig,
    buildProjectDocument,
    sanitizeProjectDocument
  };
});
