(function () {
  const nativeFetch = window.fetch.bind(window);

  function cookieValue(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split("; ").find(value => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  }

  window.fetch = function dashboardFetch(input, options = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : input, window.location.href);
    const method = String(options.method || request?.method || "GET").toUpperCase();
    if (url.origin === window.location.origin && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      const headers = new Headers(options.headers || request?.headers || {});
      const csrf = cookieValue("dashboard_csrf");
      if (csrf) headers.set("X-Dashboard-CSRF", csrf);
      options = { ...options, headers };
    }
    return nativeFetch(input, options).then(response => {
      if (response.status === 401 && url.pathname.startsWith("/api/") && url.pathname !== "/api/auth/login") {
        const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
        window.location.replace(`/server/login.html?next=${next}`);
      }
      return response;
    });
  };

  async function showIdentity() {
    const response = await nativeFetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) {
      const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.replace(`/server/login.html?next=${next}`);
      return;
    }
    if (!response.ok) return;
    const result = await response.json();
    if (!result.enabled || !result.user) return;
    window.dashboardAuth = result;
    document.documentElement.dataset.dashboardAdmin = result.user.admin ? "true" : "false";
    const actions = document.querySelector(".top-actions");
    if (!actions) return;
    const identity = document.createElement("span");
    identity.className = "dashboard-identity";
    identity.textContent = result.user.displayName || result.user.username;
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "ghost-button";
    logout.textContent = "退出";
    logout.addEventListener("click", async () => {
      await window.fetch("/api/auth/logout", { method: "POST" });
      window.location.replace("/server/login.html");
    });
    actions.prepend(identity, logout);
    window.dispatchEvent(new CustomEvent("dashboard-auth-ready", { detail: result }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => showIdentity().catch(() => {}));
  } else {
    showIdentity().catch(() => {});
  }
})();
