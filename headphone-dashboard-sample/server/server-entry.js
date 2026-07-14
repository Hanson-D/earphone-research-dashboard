const els = {
  list: document.getElementById("serverProjectList"),
  count: document.getElementById("projectCount"),
  status: document.getElementById("serverEntryStatus"),
  refresh: document.getElementById("refreshProjectsButton"),
  form: document.getElementById("createProjectForm"),
  id: document.getElementById("newProjectId"),
  title: document.getElementById("newProjectTitle"),
};

function dashboardUrl(projectId) {
  const url = new URL("../index.html", window.location.href);
  url.searchParams.set("projectId", projectId);
  return url.toString();
}

function setStatus(message) {
  els.status.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderProjects(projects) {
  els.count.textContent = `${projects.length} 个项目`;
  els.list.innerHTML = projects.length ? projects.map(project => `
    <article class="server-project-card">
      <div>
        <strong>${escapeHtml(project.title || project.id)}</strong>
        <span>${escapeHtml(project.id)} · rev ${Number(project.revision) || 1} · ${Number(project.rows) || 0} 行</span>
      </div>
      <a class="outline-button" href="${escapeHtml(dashboardUrl(project.id))}" target="_blank" rel="noopener">打开看板</a>
    </article>
  `).join("") : `<div class="empty-state">还没有服务器项目。可以先新建一个，再在看板中导入 CSV 和照片。</div>`;
}

async function loadProjects() {
  const response = await fetch("/api/server/projects");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "项目列表读取失败。");
  renderProjects(result.projects || []);
  setStatus("项目列表已更新。");
}

async function createProject(event) {
  event.preventDefault();
  const id = els.id.value.trim();
  const title = els.title.value.trim() || id;
  const project = {
    version: 1,
    rows: [],
    mappingRows: [],
    mappingMode: "sequence",
    mappingFields: {},
    mappingViews: [],
    dashboardConfig: {}
  };
  const response = await fetch("/api/server/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title, project })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "项目创建失败。");
  await loadProjects();
  window.open(dashboardUrl(result.id), "_blank", "noopener");
}

els.refresh.addEventListener("click", () => {
  setStatus("正在刷新项目列表…");
  loadProjects().catch(error => setStatus(error.message));
});

els.form.addEventListener("submit", event => {
  setStatus("正在创建项目…");
  createProject(event).catch(error => setStatus(error.message));
});

loadProjects().catch(error => {
  els.list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  setStatus(error.message);
});
