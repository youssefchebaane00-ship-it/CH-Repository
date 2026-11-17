// =========================================================
// FAVORITE LINKS widget
// =========================================================

const Links = {
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

  render(container) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon sky">${icon("link")}</span>Favorite links</h3>
        <button class="btn-icon small" type="button" data-toggle-form aria-label="Add a link" title="Add a link" aria-expanded="false">${icon("plus")}</button>
      </div>
      <form class="link-form" data-form hidden novalidate>
        <input class="input" name="name" type="text" placeholder="Name, e.g. GitHub" maxlength="40" aria-label="Link name" autocomplete="off">
        <input class="input" name="url" type="text" placeholder="Address, e.g. github.com" aria-label="Link address" autocomplete="off">
        <button class="btn btn-primary" type="submit">Add</button>
      </form>
      <div class="link-grid" data-grid></div>
      <div data-empty></div>`;

    const grid = container.querySelector("[data-grid]");
    const empty = container.querySelector("[data-empty]");
    const form = container.querySelector("[data-form]");
    const toggle = container.querySelector("[data-toggle-form]");
    const updateEmpty = () => {
      empty.innerHTML = grid.children.length ? "" : UI.emptyState("link", "No links yet", "Click + to add the websites you visit most.");
    };

    Store.get("links").forEach((link) => grid.appendChild(this.createTile(link, updateEmpty)));
    updateEmpty();

    toggle.addEventListener("click", () => {
      form.hidden = !form.hidden;
      toggle.setAttribute("aria-expanded", String(!form.hidden));
      if (!form.hidden) form.elements.name.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = form.elements.name.value.trim();
      const url = this.normalizeUrl(form.elements.url.value);

      form.elements.name.classList.toggle("invalid", !name);
      form.elements.url.classList.toggle("invalid", !url);
      if (!name) return form.elements.name.focus();
      if (!url) {
        UI.toast("That doesn't look like a web address. Try something like github.com", { type: "error" });
        return form.elements.url.focus();
      }

      const link = this.add(name, url);
      const tile = this.createTile(link, updateEmpty);
      tile.classList.add("entering");
      grid.appendChild(tile);
      updateEmpty();
      form.reset();
      form.elements.name.focus();
    });
  },

  add(name, url) {
    const link = { id: Store.newId(), name: name.slice(0, 40), url };
    Store.set("links", [...Store.get("links"), link]);
    return link;
  },

  createTile(link, updateEmpty) {
    const safeUrl = this.normalizeUrl(link.url) || "#"; // never allow "javascript:" links
    const tile = UI.html(`
      <div class="link-tile" data-id="${UI.escape(link.id)}">
        <a href="${UI.escape(safeUrl)}" target="_blank" rel="noopener noreferrer" title="${UI.escape(safeUrl)}">
          <span class="link-initial">${UI.escape(link.name.charAt(0).toUpperCase())}</span>
          <span class="link-name">${UI.escape(link.name)}</span>
        </a>
        <button class="btn-icon small danger" type="button" aria-label="Remove ${UI.escape(link.name)}" title="Remove">${icon("x")}</button>
      </div>`);

    const button = tile.querySelector("button");
    button.addEventListener("click", () => {
      button.disabled = true;
      UI.removeWithAnimation(tile, () => {
        const links = Store.get("links");
        const index = links.findIndex((l) => l.id === link.id);
        const removed = links[index];
        tile.remove();
        Store.set("links", links.filter((l) => l.id !== link.id));
        updateEmpty();
        UI.toast(`Removed ${link.name}`, {
          actionLabel: "Undo",
          onAction: () => {
            const current = [...Store.get("links")];
            current.splice(index, 0, removed);
            Store.set("links", current);
            Router.refresh();
          },
        });
      });
    });

    return tile;
  },
};
