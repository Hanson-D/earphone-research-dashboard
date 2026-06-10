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
    version: 3,
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
  selectedGroup: null,
  primaryDimension: "device_name",
  secondaryDimension: "concha_size",
  metric: "comfort_score",
  search: "",
  headers: [],
  dimensionFields: [],
  metricFields: [],
  userIdField: "user_id",
  photoFields: [],
  layout: loadLayout()
};

const els = Object.fromEntries([
  "csvInput", "resetButton", "dataSourceLabel", "deviceFilter", "genderFilter",
  "ageFilter", "earSizeFilter", "primaryDimension", "secondaryDimension",
  "metricSelect", "clearGroupButton", "kpiGrid", "pivotHead", "pivotBody",
  "pivotHint", "barChart", "chartTitle", "detailTitle", "detailDescription",
  "groupStats", "detailSearch", "detailCount", "detailBody", "detailHead",
  "detailColgroup", "fontSizeControl", "fontSizeValue", "photoSizeControl",
  "photoSizeValue", "resetLayoutButton", "columnConfigList"
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
  if (/name|device|ear_|concha|耳/i.test(field)) return 135;
  return 100;
}

function buildSchema() {
  state.headers = Object.keys(state.rows[0] || {});
  state.userIdField = state.headers.find(field => /^(user_id|participant_id|subject_id|用户编号|用户id)$/i.test(field)) || state.headers[0];
  state.photoFields = state.headers.filter(isPhotoField);
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
    visible: !/^(record_id|device_id)$/i.test(field),
    userLevel: isUserLevelField(field),
    photo: isPhotoField(field)
  }));
  const schema = state.headers.join("|||");
  const orderedSaved = state.layout.version === 3 && state.layout.schema === schema ? state.layout.columns
    .filter(column => dynamicColumns.some(item => item.id === column.id))
    .map(column => ({ ...dynamicColumns.find(item => item.id === column.id), ...column })) : [];
  const newColumns = dynamicColumns.filter(column => !orderedSaved.some(item => item.id === column.id));
  const combined = [...orderedSaved, ...newColumns];
  state.layout.columns = [...combined.filter(column => !column.photo), ...combined.filter(column => column.photo)];
  state.layout.version = 3;
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
  fillSelect(els.deviceFilter, unique("device_name"));
  ["genderFilter", "ageFilter", "earSizeFilter"].forEach((id, index) => {
    const field = ["gender", "age_group", "concha_size"][index];
    const select = els[id], current = select.value;
    select.innerHTML = '<option value="">全部</option>';
    unique(field).forEach(value => select.add(new Option(value, value)));
    select.value = current;
  });
  fillSelect(els.primaryDimension, state.dimensionFields);
  fillSelect(els.secondaryDimension, state.dimensionFields, true);
  fillSelect(els.metricSelect, state.metricFields);
  els.primaryDimension.value = state.primaryDimension;
  els.secondaryDimension.value = state.secondaryDimension;
  els.metricSelect.value = state.metric;
}

function selectedValues(select) {
  return [...select.selectedOptions].map(option => option.value);
}

function filteredRows() {
  const devices = selectedValues(els.deviceFilter);
  return state.rows.filter(row =>
    (!state.headers.includes("device_name") || !devices.length || devices.includes(row.device_name)) &&
    (!state.headers.includes("gender") || !els.genderFilter.value || row.gender === els.genderFilter.value) &&
    (!state.headers.includes("age_group") || !els.ageFilter.value || row.age_group === els.ageFilter.value) &&
    (!state.headers.includes("concha_size") || !els.earSizeFilter.value || row.concha_size === els.earSizeFilter.value)
  );
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
  const max = Math.max(...groups.map(group => average(group.rows, metric)), 10);
  els.chartTitle.textContent = `${fieldLabels[metric] || metric}组间柱状对比`;
  els.barChart.innerHTML = groups.length ? `<div class="column-chart">${groups.slice(0, 12).map(group => {
    const value = average(group.rows, metric);
    return `<div class="column-item" title="${group.values.join(" / ")}：${value.toFixed(1)}">
      <span class="column-value">${value.toFixed(1)}</span>
      <div class="column-bar" style="height:${value / max * 100}%"></div>
      <span class="column-label">${group.values.join(" / ")}</span>
    </div>`;
  }).join("")}</div>` : '<div class="empty-state">没有可绘制的数据。</div>';
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
  if (/pressure_score$/i.test(field)) {
    return `<td class="${classes}"><span class="pressure ${pressureClass(value)}">${value || "—"}</span></td>`;
  }
  if (/score$|rating$|satisfaction|comfort|stability/i.test(field) && isNumericField(field)) {
    return `<td class="${classes}"><span class="score ${scoreClass(value)}">${value || "—"}</span></td>`;
  }
  return `<td class="${classes}">${field === state.userIdField ? `<strong>${value}</strong>` : value || "—"}</td>`;
}

function photoGalleryCell(column, userRows) {
  const deviceField = state.headers.includes("device_name") ? "device_name" :
    state.headers.find(field => /device|condition|设备|条件/i.test(field));
  const items = userRows.filter(row => row[column.id]).map(row => `
    <figure class="photo-thumb">
      <img class="ear-photo" src="${row[column.id]}" alt="${row[state.userIdField]} ${row[deviceField] || column.label}" loading="lazy">
      <figcaption>${row[deviceField] || column.label}</figcaption>
    </figure>
  `).join("");
  return `<td class="photo-cell" rowspan="${userRows.length}"><div class="photo-gallery">${items || "—"}</div></td>`;
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
  const totalWeight = visibleColumns.reduce((sum, column) => sum + column.width, 0);
  els.detailColgroup.innerHTML = visibleColumns.map(column => `<col style="width:${column.width / totalWeight * 100}%">`).join("");
  els.detailHead.innerHTML = `<tr>${visibleColumns.map(column => `<th>${column.label}</th>`).join("")}</tr>`;
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

function bindEvents() {
  [els.deviceFilter, els.genderFilter, els.ageFilter, els.earSizeFilter].forEach(select =>
    select.addEventListener("change", () => { state.selectedGroup = null; render(); })
  );
  els.primaryDimension.addEventListener("change", () => { state.primaryDimension = els.primaryDimension.value; state.selectedGroup = null; render(); });
  els.secondaryDimension.addEventListener("change", () => { state.secondaryDimension = els.secondaryDimension.value; state.selectedGroup = null; render(); });
  els.metricSelect.addEventListener("change", () => { state.metric = els.metricSelect.value; render(); });
  els.clearGroupButton.addEventListener("click", () => { state.selectedGroup = null; render(); });
  els.detailSearch.addEventListener("input", () => { state.search = els.detailSearch.value; render(); });
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
    state.selectedGroup = null; state.search = ""; els.detailSearch.value = "";
    [els.deviceFilter, els.genderFilter, els.ageFilter, els.earSizeFilter].forEach(select => [...select.options].forEach(option => option.selected = false));
    buildSchema();
    initializeControls(); render();
  });
  els.csvInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.rows = parseCSV(reader.result);
      state.selectedGroup = null;
      els.dataSourceLabel.textContent = file.name;
      buildSchema();
      initializeControls(); renderColumnConfig(); render();
    };
    reader.readAsText(file, "UTF-8");
  });
}

async function start() {
  const response = await fetch(DEFAULT_CSV);
  state.rows = parseCSV(await response.text());
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
