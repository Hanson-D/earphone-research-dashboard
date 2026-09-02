const form = document.getElementById("dashboardLoginForm");
const username = document.getElementById("dashboardUsername");
const password = document.getElementById("dashboardPassword");
const status = document.getElementById("dashboardLoginStatus");

function safeNext() {
  const value = new URLSearchParams(window.location.search).get("next") || "/server/server.html";
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return "/server/server.html";
    return target.pathname + target.search + target.hash;
  } catch (error) {
    return "/server/server.html";
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  status.textContent = "正在登录…";
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.value.trim(), password: password.value })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = result.error || "登录失败。";
    password.select();
    return;
  }
  window.location.replace(safeNext());
});
