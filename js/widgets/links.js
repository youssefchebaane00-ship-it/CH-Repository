// =========================================================
// FAVORITE LINKS: grouped by category, with each website's own icon.
// The icon is loaded straight from the site (site.com/favicon.ico), not
// through a third-party service, so no list of your sites is sent anywhere.
// If a site has no icon, the first letter of its name is shown instead.
// =========================================================

const Links = {
  CATEGORIES: { study: "Study", work: "Work", tools: "Tools", social: "Social", entertainment: "Entertainment", other: "Other" },

  all() {
    return Store.get("links");
  },

  // Accept "youtube.com" or "https://youtube.com". Returns a full, safe
  // http(s) address, or null if it isn't a valid web address.
  normalizeUrl(text) {
    let value = String(text).trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = "https://" + value;
    try {
      const url = new URL(value);
      const looksReal = url.hostname.includes(".") || url.hostname === "localhost";
      return (url.protocol === "http:" || url.protocol === "https:") && looksReal ? url.href : null;
    } catch {
      return null;
    }
  },

  faviconUrl(url) {
    try {
      return new URL("/favicon.ico", url).href;
    } catch {
      return null;
    }
  },

  add(name, url, category = "other") {
    const link = { id: Store.newId(), name: String(name).trim().slice(0, 40), url, category: category in this.CATEGORIES ? category : "other" };
    Store.set("links", [...this.all(), link]);
    return link;
  },

  remove(id) {
    const links = this.all();
    const index = links.findIndex((l) => l.id === id);
    if (index === -1) return;
    const removed = links[index];
    Store.set("links", links.filter((l) => l.id !== id));
    UI.toast(`Removed ${removed.name}`, {
      actionLabel: "Undo",
      onAction: () => {
        const current = [...this.all()];
        current.splice(index, 0, removed);
        Store.set("links", current);
        Router.refresh();
      },
    });
  },

  // Create or edit a link. Returns the link, "deleted", or null.
  async openEditor(link = null, { quiet = false } = {}) {
    const l = link || { name: "", url: "", category: "other" };
    const values = await UI.form({
      title: link ? "Edit link" : "New favorite link",
      submitLabel: link ? "Save changes" : "Add link",
      deleteLabel: link ? "Delete" : null,
      fields: [
        { name: "name", label: "Name", value: l.name, required: true, placeholder: "e.g. GitHub",
          validate: (v) => (v.length > 40 ? "Keep it under 40 characters." : "") },
        { name: "url", label: "Address", value: l.url, required: true, placeholder: "e.g. github.com",
          validate: (v) => (this.normalizeUrl(v) ? "" : "Enter a valid web address, like github.com") },
        { name: "category", label: "Category", type: "select", value: l.category,
          options: Object.entries(this.CATEGORIES).map(([value, label]) => ({ value, label })) },
      ],
    });
    if (values === null) return null;
    if (values === "delete") {
      this.remove(link.id);
      return "deleted";
    }
    const url = this.normalizeUrl(values.url);
    const category = values.category in this.CATEGORIES ? values.category : "other";
    if (link) {
      Store.set("links", this.all().map((x) => (x.id === link.id ? { ...x, name: values.name.slice(0, 40), url, category } : x)));
      UI.toast("Link updated");
      return this.all().find((x) => x.id === link.id);
    }
    const created = this.add(values.name, url, category);
    if (!quiet) UI.toast(`${created.name} added`);
    return created;
  },

  createTile(link) {
    const safeUrl = this.normalizeUrl(link.url) || "#"; // never allow "javascript:" links
    const favicon = safeUrl !== "#" ? this.faviconUrl(safeUrl) : null;
    const tile = UI.html(`
      <div class="link-tile" data-id="${UI.escape(link.id)}">
        <a href="${UI.escape(safeUrl)}" target="_blank" rel="noopener noreferrer" title="${UI.escape(safeUrl)}">
          <span class="link-initial">${UI.escape(link.name.charAt(0).toUpperCase())}</span>
          <span class="link-name">${UI.escape(link.name)}</span>
        </a>
        <div class="link-actions">
          <button class="btn-icon small" type="button" data-edit aria-label="Edit ${UI.escape(link.name)}" title="Edit">${icon("pencil")}</button>
          <button class="btn-icon small danger" type="button" data-delete aria-label="Remove ${UI.escape(link.name)}" title="Remove">${icon("x")}</button>
        </div>
      </div>`);

    // Try the site's own icon; keep the letter if it fails to load
    if (favicon) {
      const img = document.createElement("img");
      img.className = "link-favicon";
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("load", () => {
        if (img.naturalWidth > 1) tile.querySelector(".link-initial").replaceWith(img);
      });
      img.src = favicon; // set after the listener, so we never miss the event
    }
    return tile;
  },

  render(container) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon sky">${icon("link")}</span>Favorite links</h3>
        <button class="btn-icon small" type="button" data-add aria-label="Add a link" title="Add a link">${icon("plus")}</button>
      </div>
      <div data-groups></div>`;

    const groups = container.querySelector("[data-groups]");
    const draw = () => {
      const links = this.all();
      if (!links.length) {
        groups.innerHTML = UI.emptyState("link", "No links yet", "Click + to add the websites you visit most.");
        return;
      }
      // Group by category, in the order of CATEGORIES. With only one category, skip the headings.
      const used = Object.keys(this.CATEGORIES).filter((c) => links.some((l) => (l.category || "other") === c));
      groups.innerHTML = "";
      used.forEach((category) => {
        const section = UI.html(`
          <div class="link-group">
            ${used.length > 1 ? `<p class="link-group-title">${this.CATEGORIES[category]}</p>` : ""}
            <div class="link-grid"></div>
          </div>`);
        const grid = section.querySelector(".link-grid");
        links.filter((l) => (l.category || "other") === category).forEach((l) => grid.appendChild(this.createTile(l)));
        groups.appendChild(section);
      });
    };

    container.querySelector("[data-add]").addEventListener("click", async () => {
      const created = await this.openEditor();
      if (created) {
        draw();
        const tile = groups.querySelector(`[data-id="${CSS.escape(created.id)}"]`);
        if (tile) UI.replayAnimation(tile, "entering");
      }
    });

    groups.addEventListener("click", async (event) => {
      const tile = event.target.closest(".link-tile");
      if (!tile) return;
      const link = this.all().find((l) => l.id === tile.dataset.id);
      if (!link) return;
      if (event.target.closest("[data-edit]")) {
        event.preventDefault();
        if (await this.openEditor(link)) draw();
      } else if (event.target.closest("[data-delete]")) {
        event.preventDefault();
        UI.removeWithAnimation(tile, () => { this.remove(link.id); draw(); });
      }
    });

    draw();
  },
};

// ---------------------------------------------------------
// Register the Favorite links module (see js/modules.js).
// It has no page of its own: it lives on the dashboard.
// ---------------------------------------------------------
Modules.register({
  id: "links",
  order: 85,

  collections: {
    // { id, name, url, category }
    links: {
      default: [
        { id: "default-google", name: "Google", url: "https://www.google.com", category: "tools" },
        { id: "default-youtube", name: "YouTube", url: "https://www.youtube.com", category: "entertainment" },
        { id: "default-gmail", name: "Gmail", url: "https://mail.google.com", category: "tools" },
      ],
      backup: true,
      normalize: (l) => ({ category: "other", ...l }),
    },
  },

  search(q, has) {
    return {
      label: "Links",
      items: Links.all().filter((l) => has(l.name) || has(l.url)).slice(0, 6)
        .map((l) => ({ text: l.name, icon: "external-link", url: Links.normalizeUrl(l.url), hint: "Opens in new tab" })),
    };
  },

  quickAdd: [{
    id: "link", label: "New favorite link", icon: "link", key: "L", order: 80,
    async run() {
      const created = await Links.openEditor(null, { quiet: true });
      return { created, page: "dashboard", label: "Link", onDashboard: true };
    },
  }],

  widgets: [{ id: "links", label: "Favorite links", span: 4, order: 80, render: (el) => Links.render(el) }],
});
