"use strict";

const token = new URLSearchParams(location.search).get("token") || "";
const form = document.getElementById("builderForm");
const previewButton = document.getElementById("previewButton");
const emptyState = document.getElementById("emptyState");
const resultPanel = document.getElementById("resultPanel");
const errorPanel = document.getElementById("errorPanel");
const errorMessage = document.getElementById("errorMessage");
const statusDot = document.getElementById("statusDot");

function splitList(value) {
  return String(value || "").split(/[,，]/).map(item => item.trim()).filter(Boolean);
}

function configFromForm() {
  const mappingFields = {};
  for (const key of ["userField", "earField", "deviceField"]) {
    const value = document.getElementById(key).value.trim();
    if (value) mappingFields[key] = value;
  }
  if (document.getElementById("noEarField").checked) mappingFields.earField = null;
  if (document.getElementById("noDeviceField").checked) mappingFields.deviceField = null;
  return {
    projectName: document.getElementById("projectName").value.trim(),
    csvPath: document.getElementById("csvPath").value.trim(),
    photoRoot: document.getElementById("photoRoot").value.trim(),
    outputRoot: document.getElementById("outputRoot").value.trim(),
    mode: document.getElementById("mode").value,
    views: splitList(document.getElementById("views").value),
    expectedEars: splitList(document.getElementById("expectedEars").value),
    mappingFields,
    singleEarMode: document.getElementById("singleEarMode").checked,
    photoEarMode: document.getElementById("photoEarMode").checked,
    includeBareEarPhotos: document.getElementById("includeBareEarPhotos").checked
  };
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Builder-Token": token },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "操作失败");
  return result;
}

function setBusy(busy) {
  [...form.querySelectorAll("button")].forEach(button => { button.disabled = busy; });
  statusDot.className = `status-dot ${busy ? "working" : "idle"}`;
}

function showError(error) {
  emptyState.hidden = true;
  resultPanel.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = error.message;
  statusDot.className = "status-dot error";
}

function textCell(row, key) {
  const cell = document.createElement("td");
  cell.textContent = row[key] ?? "";
  return cell;
}

function renderResult(result, built) {
  const summary = result.summary;
  emptyState.hidden = true;
  errorPanel.hidden = true;
  resultPanel.hidden = false;
  document.getElementById("resultState").textContent = built ? "PROJECT READY" : "CHECK COMPLETE";
  document.getElementById("resultProject").textContent = summary.projectName;
  document.getElementById("issueCount").textContent = String(summary.issues);
  document.getElementById("metrics").innerHTML = [
    [summary.csvRows, "CSV ROWS"], [summary.photos, "PHOTOS"], [summary.photoFields.length, "PHOTO FIELDS"]
  ].map(([value, label]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
  const fields = summary.fields;
  document.getElementById("detectedFields").textContent = `用户 ${fields.userField || "—"} / 耳侧 ${fields.earField || "未配置"} / 设备 ${fields.deviceField || "未配置"}`;
  document.getElementById("detectedViews").textContent = `${summary.mode} / ${summary.views.join(" · ")}`;
  const headerList = document.getElementById("csvHeaders");
  headerList.replaceChildren();
  (summary.headers || []).forEach(header => {
    const option = document.createElement("option");
    option.value = header;
    headerList.appendChild(option);
  });
  document.getElementById("auditMeta").textContent = summary.issues ? `${summary.issues} 项需要注意` : "全部匹配";
  const tbody = document.getElementById("auditBody");
  tbody.replaceChildren();
  const rows = result.audit.length ? result.audit : [{ status: "ok", message: "未发现缺失照片或映射异常" }];
  rows.forEach(row => {
    const tr = document.createElement("tr");
    if (row.status === "ok") tr.className = "audit-ok";
    ["status", "user", "device", "view", "message"].forEach(key => tr.appendChild(textCell(row, key)));
    tbody.appendChild(tr);
  });
  document.getElementById("outputPath").textContent = built ? `已生成：${result.outputPath}` : "检查模式没有写入文件。确认无误后点击“生成项目”。";
  statusDot.className = `status-dot ${summary.issues ? "warning" : "good"}`;
}

async function run(preview) {
  if (!form.reportValidity()) return;
  setBusy(true);
  try {
    const result = await api(preview ? "/api/preview" : "/api/build", configFromForm());
    renderResult(result, !preview);
  } catch (error) {
    showError(error);
  } finally {
    [...form.querySelectorAll("button")].forEach(button => { button.disabled = false; });
  }
}

document.querySelectorAll("[data-pick]").forEach(button => {
  button.addEventListener("click", async () => {
    setBusy(true);
    try {
      const kind = button.dataset.pick;
      const result = await api("/api/pick", { kind });
      if (result.path) {
        const target = kind === "csv" ? "csvPath" : kind === "photos" ? "photoRoot" : "outputRoot";
        document.getElementById(target).value = result.path;
        if (kind === "csv" && !document.getElementById("projectName").value) {
          document.getElementById("projectName").value = result.path.split(/[\\/]/).pop().replace(/\.csv$/i, "");
        }
      }
    } catch (error) {
      if (!/cancel|canceled|取消/i.test(error.message)) showError(error);
    } finally {
      [...form.querySelectorAll("button")].forEach(item => { item.disabled = false; });
      if (resultPanel.hidden && errorPanel.hidden) statusDot.className = "status-dot idle";
    }
  });
});

previewButton.addEventListener("click", () => run(true));
form.addEventListener("submit", event => { event.preventDefault(); run(false); });
[["noEarField", "earField"], ["noDeviceField", "deviceField"]].forEach(([toggleId, fieldId]) => {
  document.getElementById(toggleId).addEventListener("change", event => {
    const field = document.getElementById(fieldId);
    field.disabled = event.target.checked;
    if (event.target.checked) field.value = "";
  });
});
api("/api/health").catch(showError);
