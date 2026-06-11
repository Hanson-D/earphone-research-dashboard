const DEFAULT_CSV = "headphone_sample.csv";

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
    const saved = JSON.parse(localStorage.getItem("headphoneDashboardLayout"));
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

const state = {
  rows: [],
  mappingRows: [],
  mappedRows: [],
  mappingFiles: [],
  mappingViews: [],
  viewLabels: {},
  globalView: "",
  userViews: {},
  selectedGroup: null,
  primaryDimension: "device_name",
  secondaryDimension: "concha_size",
  metric: "comfort_score",
  yAxisMode: "adaptive",
  search: "",
  columnFilters: {},
  headers: [],
  dimensionFields: [],
  metricFields: [],
  userIdField: "user_id",
  photoFields: [],
  layout: loadLayout()
};

const els = Object.fromEntries([
  "resetButton", "dataSourceLabel", "primaryDimension", "secondaryDimension",
  "metricSelect", "yAxisMode", "clearGroupButton", "kpiGrid", "pivotHead", "pivotBody",
  "pivotHint", "barChart", "chartTitle", "detailTitle", "detailDescription",
  "groupStats", "detailSearch", "detailCount", "detailBody", "detailHead",
  "detailColgroup", "fontSizeControl", "fontSizeValue", "photoSizeControl",
  "photoSizeValue", "resetLayoutButton", "columnConfigList", "clearColumnFilters",
  "mappingPage", "dashboardPage", "mappingCsvInput", "photoRootInput",
  "mappingUserField", "mappingDeviceField", "viewNamesInput", "runMappingButton",
  "applyMappingButton", "downloadMappedCsvButton", "mappingSummary", "mappingPreview",
  "globalViewControl", "globalViewSelect", "resetViewsButton"
].map(id => [id, document.getElementById(id)]));

function saveLayout() {
  localStorage.setItem("headphoneDashboardLayout", JSON.stringify(state.layout));
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
  const values = state.rows.map(row => row[field]).filter(value => value !== "");
  return values.length > 0 && values.every(value => Number.isFinite(Number(value)));
}

function isPhotoField(field) {
  return /photo|image|picture|照片|图片/i.test(field) ||
    state.rows.some(row => /\.(png|jpe?g|webp|gif)$/i.test(row[field] || ""));
}

function photoUrl(path) {
  if (!path) return "";
  if (/^(blob:|data:|https?:|\/api\/)/i.test(path)) return path;
  if (/^[A-Za-z]:[\\/]|^\//.test(path)) return `/api/photo?path=${encodeURIComponent(path)}`;
  return path;
}

function isUserLevelField(field) {
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
  state.userIdField = state.headers.find(field => /^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) || state.headers[0];
  state.photoFields = state.headers.filter(isPhotoField);
  state.photoFields.forEach((field, index) => {
    if (!state.viewLabels[field]) state.viewLabels[field] = fieldLabels[field] || field.replace(/^photo_/, "");
  });
  if (!state.photoFields.includes(state.globalView)) state.globalView = state.photoFields[0] || "";
  state.metricFields = state.headers.filter(field => isNumericField(field) && !/^(record_id|user_id|device_id)$/i.test(field));
  state.dimensionFields = state.headers.filter(field => {
    const count = unique(field).length;
    return !isPhotoField(field) && !isNumericField(field) &&
      field !== state.userIdField && !/record|comment|备注/i.test(field) && count > 0 && count <= 50;
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
    visible: !/^(record_id|device_id)$/i.test(field) && !/pressure_score$/i.test(field) && !isPhotoField(field),
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
    if (/pressure_score$/i.test(column.id)) column.visible = false;
  });
  const schema = state.headers.join("|||");
  const orderedSaved = state.layout.version === 5 && state.layout.schema === schema ? state.layout.columns
    .filter(column => dynamicColumns.some(item => item.id === column.id))
    .map(column => ({ ...dynamicColumns.find(item => item.id === column.id), ...column })) : [];
  const newColumns = dynamicColumns.filter(column => !orderedSaved.some(item => item.id === column.id));
  const combined = [...orderedSaved, ...newColumns];
  combined.forEach(column => {
    if (/pressure_score$/i.test(column.id)) column.visible = false;
  });
  state.layout.columns = [...combined.filter(column => !column.photo), ...combined.filter(column => column.photo)];
  state.layout.version = 5;
  state.layout.schema = schema;
  saveLayout();
}

function average(rows, field) {
  if (!field) return 0;
  const values = rows.map(row => Number(row[field])).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
  renderViewControls();
}

function renderViewControls() {
  els.globalViewControl.hidden = state.photoFields.length === 0;
  els.resetViewsButton.hidden = state.photoFields.length === 0;
  els.globalViewSelect.innerHTML = state.photoFields.map(field =>
    `<option value="${field}" ${field === state.globalView ? "selected" : ""}>${state.viewLabels[field] || field}</option>`
  ).join("");
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
  const values = groups.map(group => average(group.rows, metric));
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const padding = Math.max((dataMax - dataMin) * 0.2, 0.5);
  const axisMin = state.yAxisMode === "full" ? 0 : Math.max(0, Math.floor((dataMin - padding) * 2) / 2);
  const axisMax = state.yAxisMode === "full" ? 10 : Math.min(10, Math.ceil((dataMax + padding) * 2) / 2);
  const range = axisMax - axisMin || 1;
  const ticks = Array.from({ length: 6 }, (_, index) => axisMax - range * index / 5);
  els.chartTitle.textContent = `${fieldLabels[metric] || metric}组间柱状对比`;
  els.barChart.innerHTML = groups.length ? `<div class="academic-chart">
    <div class="y-axis-title">${fieldLabels[metric] || metric}均值</div>
    <div class="y-axis">${ticks.map(tick => `<span style="top:${(axisMax - tick) / range * 100}%">${tick.toFixed(1)}</span>`).join("")}</div>
    <div class="plot-area">
      <div class="grid-lines">${ticks.map(tick => `<i style="top:${(axisMax - tick) / range * 100}%"></i>`).join("")}</div>
      <div class="column-chart">${groups.slice(0, 12).map(group => {
    const value = average(group.rows, metric);
    return `<div class="column-item" title="${group.values.join(" / ")}：${value.toFixed(1)}">
      <span class="column-value">${value.toFixed(1)}</span>
      <div class="column-bar" style="height:${Math.max(0, (value - axisMin) / range * 100)}%"></div>
      <span class="column-label">${group.values.join(" / ")}</span>
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
    const pressureFields = state.headers.filter(item => /pressure_score$/i.test(item));
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
  if (/pressure_score$/i.test(field)) {
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
  const selectedView = state.userViews[user] || state.globalView || state.photoFields[0];
  const items = userRows.filter(row => row[selectedView]).map(row => `
    <figure class="photo-thumb">
      <img class="ear-photo" src="${photoUrl(row[selectedView])}" alt="${row[state.userIdField]} ${row[deviceField] || column.label}" loading="lazy">
      <figcaption>${row[deviceField] || column.label}</figcaption>
    </figure>
  `).join("");
  const options = state.photoFields.map(field =>
    `<option value="${field}" ${state.userViews[user] === field ? "selected" : ""}>${state.viewLabels[field] || field}</option>`
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
      column.id === "__photo_view" ? userRows.filter(row => row[state.globalView] || state.photoFields.some(field => row[field])).length : userRows.filter(row => row[column.id]).length
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

function photoFieldNames(views) {
  const used = new Set();
  return views.map((view, index) => {
    const base = `photo_${view.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || `view_${index + 1}`}`;
    let field = base;
    let suffix = 2;
    while (used.has(field)) field = `${base}_${suffix++}`;
    used.add(field);
    return field;
  });
}

function initializeMappingFields() {
  const headers = Object.keys(state.mappingRows[0] || {});
  fillSelect(els.mappingUserField, headers, false, fieldLabels);
  fillSelect(els.mappingDeviceField, headers, false, fieldLabels);
  els.mappingUserField.value = headers.find(field => /^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) || headers[0] || "";
  els.mappingDeviceField.value = headers.find(field => /^device_name$/i.test(field)) ||
    headers.find(field => /device_name|device_id|condition|设备|条件/i.test(field)) || headers[1] || "";
}

async function scanPhotoRoot() {
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

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function buildPhotoMapping() {
  const views = mappingViews();
  const userField = els.mappingUserField.value;
  const deviceField = els.mappingDeviceField.value;
  if (!state.mappingRows.length) throw new Error("请先选择 CSV。");
  if (!views.length) throw new Error("请至少填写一个视角名称。");
  if (!userField || !deviceField) throw new Error("请选择用户字段和设备字段。");

  const photoFields = photoFieldNames(views);
  const filesByUser = new Map();
  state.mappingFiles.forEach(file => {
    if (!filesByUser.has(file.user_folder)) filesByUser.set(file.user_folder, []);
    filesByUser.get(file.user_folder).push(file);
  });
  filesByUser.forEach(files => files.sort((a, b) => naturalCompare(a.name, b.name)));

  const rowsByUser = new Map();
  state.mappingRows.forEach((row, rowIndex) => {
    const user = row[userField];
    if (!rowsByUser.has(user)) rowsByUser.set(user, []);
    rowsByUser.get(user).push({ row, rowIndex });
  });

  const existingPhotoFields = Object.keys(state.mappingRows[0] || {}).filter(field =>
    /photo|image|picture|照片|图片/i.test(field)
  );
  const mapped = state.mappingRows.map(row => {
    const copy = { ...row };
    existingPhotoFields.forEach(field => delete copy[field]);
    return copy;
  });
  const reviews = [];
  rowsByUser.forEach((entries, user) => {
    const files = filesByUser.get(user) || [];
    const expected = entries.length * views.length;
    entries.forEach((entry, deviceIndex) => {
      views.forEach((view, viewIndex) => {
        const field = photoFields[viewIndex];
        const file = files[deviceIndex * views.length + viewIndex];
        mapped[entry.rowIndex][field] = file?.absolute_path || "";
      });
    });
    reviews.push({
      user,
      entries,
      files,
      expected,
      status: files.length === expected ? "ok" : files.length < expected ? "missing" : "extra"
    });
  });

  state.mappedRows = mapped;
  state.mappingViews = views;
  photoFields.forEach((field, index) => {
    state.viewLabels[field] = views[index];
    fieldLabels[field] = views[index];
  });
  renderMappingPreview(reviews, userField, deviceField, photoFields);
  els.applyMappingButton.disabled = false;
  els.downloadMappedCsvButton.disabled = false;
}

function renderMappingPreview(reviews, userField, deviceField, photoFields) {
  const ok = reviews.filter(review => review.status === "ok").length;
  const issues = reviews.length - ok;
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
            return `<figure>${path ? `<img src="${photoUrl(path)}" alt="${state.viewLabels[field]}">` : `<div class="missing-photo">缺失</div>`}<figcaption>${state.viewLabels[field]}</figcaption></figure>`;
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
  renderColumnConfig();
  render();
  els.dataSourceLabel.textContent = "照片映射数据";
  switchPage("dashboard");
}

function bindEvents() {
  document.querySelectorAll(".page-tab").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.page)));
  els.mappingCsvInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.mappingRows = parseCSV(reader.result);
      initializeMappingFields();
      els.mappingSummary.textContent = `${file.name} · ${state.mappingRows.length} 条记录`;
    };
    reader.readAsText(file, "UTF-8");
  });
  els.runMappingButton.addEventListener("click", async () => {
    els.runMappingButton.disabled = true;
    els.mappingSummary.textContent = "正在扫描并映射照片…";
    try {
      await scanPhotoRoot();
      buildPhotoMapping();
    } catch (error) {
      els.mappingSummary.textContent = error.message;
    } finally {
      els.runMappingButton.disabled = false;
    }
  });
  els.applyMappingButton.addEventListener("click", applyMappedRows);
  els.downloadMappedCsvButton.addEventListener("click", downloadMappedCsv);
  els.primaryDimension.addEventListener("change", () => { state.primaryDimension = els.primaryDimension.value; state.selectedGroup = null; render(); });
  els.secondaryDimension.addEventListener("change", () => { state.secondaryDimension = els.secondaryDimension.value; state.selectedGroup = null; render(); });
  els.metricSelect.addEventListener("change", () => { state.metric = els.metricSelect.value; render(); });
  els.yAxisMode.addEventListener("change", () => { state.yAxisMode = els.yAxisMode.value; renderChart(groupedRows(filteredRows())); });
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
  });
  els.resetViewsButton.addEventListener("click", () => {
    state.globalView = state.photoFields[0] || "";
    state.userViews = {};
    renderViewControls();
    renderDetails(filteredRows(), groupedRows(filteredRows()));
  });
  els.detailBody.addEventListener("change", event => {
    if (!event.target.classList.contains("user-view-select")) return;
    const user = event.target.dataset.user;
    if (event.target.value) state.userViews[user] = event.target.value;
    else delete state.userViews[user];
    renderDetails(filteredRows(), groupedRows(filteredRows()));
  });
  els.fontSizeControl.addEventListener("input", () => {
    state.layout.fontSize = Number(els.fontSizeControl.value);
    applyLayoutVariables(); saveLayout();
  });
  els.photoSizeControl.addEventListener("input", () => {
    state.layout.photoSize = Number(els.photoSizeControl.value);
    applyLayoutVariables(); saveLayout();
  });
  els.columnConfigList.addEventListener("change", event => {
    const row = event.target.closest(".column-config-row");
    if (!row) return;
    const column = state.layout.columns.find(item => item.id === row.dataset.columnId);
    if (event.target.classList.contains("column-visible")) column.visible = event.target.checked;
    saveLayout(); render();
  });
  els.columnConfigList.addEventListener("input", event => {
    if (!event.target.classList.contains("column-width")) return;
    const row = event.target.closest(".column-config-row");
    const column = state.layout.columns.find(item => item.id === row.dataset.columnId);
    column.width = Math.max(60, Math.min(500, Number(event.target.value) || column.width));
    saveLayout(); render();
  });
  els.columnConfigList.addEventListener("click", event => {
    const row = event.target.closest(".column-config-row");
    if (!row || !event.target.matches("button")) return;
    const index = state.layout.columns.findIndex(item => item.id === row.dataset.columnId);
    const targetIndex = event.target.classList.contains("column-up") ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= state.layout.columns.length) return;
    [state.layout.columns[index], state.layout.columns[targetIndex]] = [state.layout.columns[targetIndex], state.layout.columns[index]];
    saveLayout(); renderColumnConfig(); render();
  });
  els.resetLayoutButton.addEventListener("click", () => {
    state.layout = defaultLayout();
    buildSchema();
    saveLayout(); applyLayoutVariables(); renderColumnConfig(); render();
  });
  els.resetButton.addEventListener("click", () => {
    state.primaryDimension = "device_name"; state.secondaryDimension = "concha_size"; state.metric = "comfort_score";
    state.yAxisMode = "adaptive";
    state.selectedGroup = null; state.search = ""; state.columnFilters = {}; els.detailSearch.value = "";
    buildSchema();
    initializeControls(); render();
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
  renderColumnConfig();
  bindEvents();
  render();
}

start().catch(error => {
  console.error(error);
  document.body.innerHTML = `<div class="empty-state">无法读取示例 CSV。请从本目录启动本地服务器后访问页面。</div>`;
});
