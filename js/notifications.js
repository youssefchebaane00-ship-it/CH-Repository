// =========================================================
// NOTIFICATIONS: the bell in the top bar.
// These are live reminders built from your data (not stored messages),
// so they disappear by themselves once you deal with them.
// Each module provides its own reminders (see js/modules.js).
// =========================================================

const Notifications = {
  collect() {
    return Modules.notifications();
  },

  init() {
    const button = document.getElementById("notifications-button");
    const panel = document.getElementById("notifications-panel");

    button.addEventListener("click", () => {
      const open = panel.hidden;
      if (open) this.renderPanel();
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });

    panel.addEventListener("click", (event) => {
      const item = event.target.closest("[data-index]");
      if (!item) return;
      const target = this.lastItems[Number(item.dataset.index)];
      this.close();
      if (!target) return;
      target.before?.(); // the module prepares its page (e.g. shows the right filter or day)
      Router.go(target.page, target.id || null);
    });

    this.refresh();
  },

  lastItems: [],

  // Update the red counter on the bell (urgent items only)
  refresh() {
    const items = this.collect();
    const urgent = items.filter((i) => i.urgent).length;
    const button = document.getElementById("notifications-button");
    button.innerHTML = `${icon("bell")}${urgent ? `<span class="bell-count">${urgent > 9 ? "9+" : urgent}</span>` : ""}`;
    const label = urgent ? `Notifications: ${urgent} need attention` : "Notifications";
    button.setAttribute("aria-label", label);
    button.title = label;
    if (!document.getElementById("notifications-panel").hidden) this.renderPanel();
  },

  renderPanel() {
    const items = this.collect();
    this.lastItems = items;
    document.getElementById("notifications-panel").innerHTML = `
      <div class="dropdown-title">Notifications</div>
      ${items.length ? items.map((item, i) => `
        <button class="menu-item notification" type="button" data-index="${i}">
          <span class="card-icon ${item.tone === "danger" ? "rose" : item.tone === "accent" ? "" : item.tone}">${icon(item.icon)}</span>
          <span class="notification-text">
            <strong>${UI.escape(item.text)}</strong>
            <span>${UI.escape(item.sub)}</span>
          </span>
        </button>`).join("")
      : `<div class="search-empty">${icon("circle-check")} You're all caught up!</div>`}`;
  },

  close() {
    document.getElementById("notifications-panel").hidden = true;
    document.getElementById("notifications-button").setAttribute("aria-expanded", "false");
  },
};
