(() => {
  const endpoint = "/__drivescope/startup";
  let latest = [];
  let loading = false;

  function isStartupPage() {
    return [...document.querySelectorAll("h2")].some((node) => node.textContent === "Windows startup programs");
  }

  async function refresh() {
    if (loading || !isStartupPage()) return;
    loading = true;
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      latest = response.ok && Array.isArray(body.items) ? body.items : [];
    } catch {
      latest = [];
    } finally {
      loading = false;
      decorate();
    }
  }

  function decorate() {
    if (!isStartupPage()) return;
    for (const row of document.querySelectorAll("li.ds-panel")) {
      const button = row.querySelector('button[role="switch"]');
      if (!button || button.dataset.aerusStartupDecorated === "1") continue;
      const label = button.getAttribute("aria-label") || "";
      const item = latest.find((entry) => label.startsWith(`${entry.name} `));
      if (!item) continue;
      button.dataset.aerusStartupDecorated = "1";
      button.title = item.canToggle === false ? item.reason || "Read-only in Aerus" : "Change Windows startup state";
      const text = button.firstElementChild;
      if (text) {
        text.style.left = "0";
        text.style.right = "0";
        text.style.textAlign = "center";
      }
      const info = row.querySelector(".min-w-0.flex-1");
      if (!info) continue;
      const details = document.createElement("div");
      details.className = "truncate text-[11px] text-faint";
      details.textContent = [item.source, item.publisher].filter(Boolean).join(" · ");
      if (details.textContent) info.insertBefore(details, info.children[1] || null);
      if (item.canToggle === false) {
        button.disabled = true;
        button.style.opacity = "0.55";
        button.style.cursor = "not-allowed";
        const note = document.createElement("div");
        note.className = "mt-1 text-[11px] text-warn";
        note.textContent = item.reason || "Read-only: this entry cannot be changed here.";
        info.appendChild(note);
      }
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest('[aria-label="Startup"]')) setTimeout(refresh, 0);
  }, true);
  new MutationObserver(() => {
    if (isStartupPage()) {
      decorate();
      refresh();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
