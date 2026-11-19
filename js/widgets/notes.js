// =========================================================
// NOTES
//   QuickNote: the scratchpad on the dashboard (+ recent notes)
//   Notes:     the full notes app (list + editor) on the Notes page
// =========================================================

const Notes = {
  CATEGORIES: { personal: "Personal", university: "University", projects: "Projects", ideas: "Ideas", other: "Other" },
  state: { selectedId: null, query: "", category: "all", showEditor: false },

  // ---------- Data helpers ----------
  all() {
    return Store.get("notes");
  },

  // Pinned notes first, then the most recently edited
  sorted(list) {
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },

  create(fields = {}) {
    const now = new Date().toISOString();
    const note = Store.NORMALIZE.notes({ id: Store.newId(), title: "", content: "", createdAt: now, updatedAt: now, ...fields });
    Store.set("notes", [note, ...this.all()]);
    return note;
  },

  update(id, changes) {
    Store.set("notes", this.all().map((n) => (n.id === id ? { ...n, ...changes, updatedAt: new Date().toISOString() } : n)));
    return this.all().find((n) => n.id === id);
  },

  matches(note, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [note.title, note.content, note.tags.join(" ")].some((text) => text.toLowerCase().includes(q));
  },

  titleOf(note) {
    return note.title.trim() || "Untitled note";
  },

  snippet(note, length = 90) {
    const text = note.content.replace(/\s+/g, " ").trim();
    return text ? (text.length > length ? text.slice(0, length) + "…" : text) : "No content yet";
  },

  timeAgo(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    const minutes = Math.round((Date.now() - date) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const key = UI.dateKey(date);
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (key === UI.dateKey()) return `today ${time}`;
    return `${UI.relativeDay(key)} ${time}`;
  },

  // ---------- Notes page ----------
  renderPage(container) {
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Notes</h2><p>Write, organize and find your notes. Everything saves automatically.</p></div>
        <button class="btn btn-primary" type="button" data-new>${icon("plus")}New note</button>
      </div>
      <div class="notes-app" data-app>
        <section class="card notes-sidebar">
          <div class="notes-filters">
            <div class="search-field">
              ${icon("search")}
              <input class="input" type="search" placeholder="Search notes…" data-query aria-label="Search notes">
            </div>
            <select class="input" data-category aria-label="Filter by category">
              <option value="all">All categories</option>
              ${Object.entries(this.CATEGORIES).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
            </select>
          </div>
          <ul class="note-list" data-list></ul>
        </section>
        <section class="card note-editor" data-editor></section>
      </div>`;

    const app = container.querySelector("[data-app]");
    const list = container.querySelector("[data-list]");
    const editor = container.querySelector("[data-editor]");
    const queryInput = container.querySelector("[data-query]");
    const categorySelect = container.querySelector("[data-category]");
    queryInput.value = this.state.query;
    categorySelect.value = this.state.category;

    // Opening a note from the global search
    if (Router.highlightId && this.all().some((n) => n.id === Router.highlightId)) {
      this.state.selectedId = Router.highlightId;
      this.state.showEditor = true;
    }

    const visibleNotes = () => this.sorted(this.all().filter((n) =>
      (this.state.category === "all" || n.category === this.state.category) && this.matches(n, this.state.query)));

    const drawList = () => {
      const notes = visibleNotes();
      list.innerHTML = notes.length ? notes.map((n) => `
        <li>
          <button type="button" class="note-row${n.id === this.state.selectedId ? " active" : ""}" data-id="${UI.escape(n.id)}">
            <span class="note-row-top">
              <strong>${UI.escape(this.titleOf(n))}</strong>
              ${n.pinned ? `<span class="pin-mark" title="Pinned">${icon("pin")}</span>` : ""}
            </span>
            <span class="note-row-snippet">${UI.escape(this.snippet(n))}</span>
            <span class="note-row-meta">
              <span>${UI.escape(this.timeAgo(n.updatedAt))}</span>
              <span class="badge">${UI.escape(this.CATEGORIES[n.category] || "Other")}</span>
              ${n.tags.slice(0, 2).map((t) => `<span class="badge tag">#${UI.escape(t)}</span>`).join("")}
            </span>
          </button>
        </li>`).join("")
        : `<li>${this.all().length
            ? UI.emptyState("search", "No matching notes", "Try another search or category.")
            : UI.emptyState("notebook-pen", "No notes yet", "Click “New note” to write your first one.")}</li>`;
    };

    const drawEditor = () => {
      const note = this.all().find((n) => n.id === this.state.selectedId);
      app.classList.toggle("show-editor", Boolean(note) && this.state.showEditor);
      if (!note) {
        editor.innerHTML = UI.emptyState("file-text", "Select or create a note", "Your notes are saved in this browser and included in backups.");
        return;
      }

      editor.innerHTML = `
        <div class="note-toolbar">
          <button class="btn-icon back-button" type="button" data-back aria-label="Back to notes list">${icon("chevron-left")}</button>
          <select class="input compact" data-field="category" aria-label="Category">
            ${Object.entries(this.CATEGORIES).map(([v, l]) => `<option value="${v}"${v === note.category ? " selected" : ""}>${l}</option>`).join("")}
          </select>
          <select class="input compact" data-field="projectId" aria-label="Project" title="Link this note to a project">
            <option value="">No project</option>
            ${Projects.all().filter((p) => p.status !== "archived" || p.id === note.projectId)
              .map((p) => `<option value="${UI.escape(p.id)}"${p.id === note.projectId ? " selected" : ""}>${UI.escape(p.name)}</option>`).join("")}
          </select>
          <div class="search-field tags-field" title="Tags, separated by commas">
            ${icon("tag")}
            <input class="input compact" data-field="tags" value="${UI.escape(note.tags.join(", "))}" placeholder="tags, comma, separated" aria-label="Tags">
          </div>
          <button class="btn-icon${note.pinned ? " is-active" : ""}" type="button" data-pin aria-pressed="${note.pinned}"
                  aria-label="${note.pinned ? "Unpin note" : "Pin note"}" title="${note.pinned ? "Unpin" : "Pin to top"}">${icon(note.pinned ? "pin-off" : "pin")}</button>
          <button class="btn-icon danger" type="button" data-delete aria-label="Delete note" title="Delete">${icon("trash-2")}</button>
        </div>
        <input class="note-title-input" data-field="title" value="${UI.escape(note.title)}" placeholder="Title" maxlength="120" aria-label="Note title">
        <textarea class="note-body-input" data-field="content" placeholder="Start writing…" aria-label="Note content">${UI.escape(note.content)}</textarea>
        <div class="note-footer">
          <span>Created ${UI.escape(this.timeAgo(note.createdAt))}</span>
          <span data-saved>Edited ${UI.escape(this.timeAgo(note.updatedAt))}</span>
        </div>`;

      // Autosave half a second after you stop typing (debounce)
      let timer;
      const saved = editor.querySelector("[data-saved]");
      const save = () => {
        const values = {
          title: editor.querySelector('[data-field="title"]').value.slice(0, 120),
          content: editor.querySelector('[data-field="content"]').value,
          category: editor.querySelector('[data-field="category"]').value,
          tags: UI.parseTags(editor.querySelector('[data-field="tags"]').value),
          projectId: editor.querySelector('[data-field="projectId"]').value || null,
        };
        this.update(note.id, values);
        saved.textContent = "Saved ✓";
        drawList();
      };
      editor.querySelectorAll("[data-field]").forEach((field) => {
        const eventName = field.tagName === "SELECT" ? "change" : "input";
        field.addEventListener(eventName, () => {
          saved.textContent = "Saving…";
          clearTimeout(timer);
          timer = setTimeout(save, 500);
        });
      });
      // Leaving the field saves immediately (no waiting)
      editor.addEventListener("focusout", () => { if (saved.textContent === "Saving…") { clearTimeout(timer); save(); } });

      editor.querySelector("[data-pin]").addEventListener("click", () => {
        clearTimeout(timer);
        save();
        const current = this.all().find((n) => n.id === note.id);
        this.update(note.id, { pinned: !current.pinned });
        UI.toast(current.pinned ? "Note unpinned" : "Note pinned to the top", { type: "info" });
        drawList();
        drawEditor();
      });

      editor.querySelector("[data-delete]").addEventListener("click", async () => {
        clearTimeout(timer);
        const ok = await UI.confirm({ title: "Delete this note?", message: `“${this.titleOf(note)}” will be permanently deleted.` });
        if (!ok) return;
        Store.set("notes", this.all().filter((n) => n.id !== note.id));
        this.state.selectedId = visibleNotes()[0]?.id || null;
        this.state.showEditor = false;
        UI.toast("Note deleted");
        drawList();
        drawEditor();
      });

      editor.querySelector("[data-back]").addEventListener("click", () => {
        this.state.showEditor = false;
        app.classList.remove("show-editor");
      });
    };

    list.addEventListener("click", (event) => {
      const row = event.target.closest("[data-id]");
      if (!row) return;
      this.state.selectedId = row.dataset.id;
      this.state.showEditor = true;
      drawList();
      drawEditor();
    });

    queryInput.addEventListener("input", () => { this.state.query = queryInput.value; drawList(); });
    categorySelect.addEventListener("change", () => { this.state.category = categorySelect.value; drawList(); });

    container.querySelector("[data-new]").addEventListener("click", () => {
      const category = this.state.category !== "all" ? this.state.category : "personal";
      const note = this.create({ category });
      this.state.selectedId = note.id;
      this.state.showEditor = true;
      this.state.query = "";
      queryInput.value = "";
      drawList();
      drawEditor();
      editor.querySelector('[data-field="title"]').focus();
    });

    if (!this.all().some((n) => n.id === this.state.selectedId)) this.state.selectedId = visibleNotes()[0]?.id || null;
    drawList();
    drawEditor();
  },
};

// ---------------------------------------------------------
// QUICK NOTE (dashboard): a scratchpad that saves automatically,
// a button to turn it into a real note, and your 3 latest notes.
// ---------------------------------------------------------
const QuickNote = {
  render(container) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon violet">${icon("notebook-pen")}</span>Quick note</h3>
        <button class="btn-icon small" type="button" data-save-note aria-label="Save as a new note" title="Save as a new note">${icon("save")}</button>
        <a class="card-link" href="#/notes">Notes ${icon("chevron-right")}</a>
      </div>
      <textarea class="input note-area" data-note-input placeholder="Jot something down… it saves automatically."
                aria-label="Quick note"></textarea>
      <span class="note-status" data-status></span>
      <ul class="recent-notes" data-recent></ul>`;

    const textarea = container.querySelector("[data-note-input]");
    const status = container.querySelector("[data-status]");
    const recent = container.querySelector("[data-recent]");
    textarea.value = Store.get("quickNote");

    const drawRecent = () => {
      const notes = Notes.sorted(Notes.all()).slice(0, 3);
      recent.innerHTML = notes.map((n) => `
        <li><a href="#/notes" data-open="${UI.escape(n.id)}">${icon(n.pinned ? "pin" : "file-text")}
          <span>${UI.escape(Notes.titleOf(n))}</span><small>${UI.escape(Notes.timeAgo(n.updatedAt))}</small></a></li>`).join("");
    };

    // Debounce: save half a second after you stop typing
    let timer;
    textarea.addEventListener("input", () => {
      status.textContent = "Typing…";
      clearTimeout(timer);
      timer = setTimeout(() => {
        Store.set("quickNote", textarea.value);
        status.textContent = "Saved ✓";
      }, 500);
    });

    container.querySelector("[data-save-note]").addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) {
        UI.toast("Write something first, then save it as a note.", { type: "info" });
        return;
      }
      clearTimeout(timer);
      const firstLine = text.split("\n")[0].slice(0, 60);
      const note = Notes.create({ title: firstLine, content: text });
      textarea.value = "";
      Store.set("quickNote", "");
      status.textContent = "";
      drawRecent();
      UI.toast("Saved as a new note", { actionLabel: "Open", onAction: () => Router.go("notes", note.id) });
    });

    recent.addEventListener("click", (event) => {
      const link = event.target.closest("[data-open]");
      if (!link) return;
      event.preventDefault();
      Router.go("notes", link.dataset.open);
    });

    drawRecent();
  },
};

// ---------------------------------------------------------
// Register the Notes module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "notes",
  order: 60,
  nav: { label: "Notes", icon: "notebook-pen" },
  page: (container) => Notes.renderPage(container),

  collections: {
    // { id, title, content, category, tags, pinned, createdAt, updatedAt }
    notes: {
      default: [],
      backup: true,
      normalize: (n) => ({
        title: "", content: "", category: "personal", pinned: false, createdAt: null, updatedAt: null, projectId: null,
        ...n,
        tags: Array.isArray(n.tags) ? n.tags : [],
      }),
    },
    quickNote: { default: "", backup: true }, // the dashboard scratchpad
  },

  search(q) {
    const items = Notes.sorted(Notes.all().filter((n) => Notes.matches(n, q))).slice(0, 6).map((n) => ({
      text: Notes.titleOf(n), icon: n.pinned ? "pin" : "file-text", page: "notes", id: n.id, hint: Notes.CATEGORIES[n.category],
      before: () => { Notes.state.query = ""; Notes.state.category = "all"; },
    }));
    const quick = Store.get("quickNote");
    const at = quick.toLowerCase().indexOf(q);
    if (at !== -1) {
      const snippet = (at > 20 ? "…" : "") + quick.slice(Math.max(0, at - 20), at + q.length + 40).replace(/\s+/g, " ");
      items.push({ text: snippet, icon: "notebook-pen", page: "dashboard", hint: "Quick note" });
    }
    return { label: "Notes", items };
  },

  quickAdd: [{
    id: "note", label: "New note", icon: "file-text", key: "N", order: 30,
    run() {
      const note = Notes.create({});
      Notes.state.query = "";
      Notes.state.category = "all";
      Router.go("notes", note.id);
      setTimeout(() => document.querySelector('.note-editor [data-field="title"]')?.focus(), 50);
    },
  }],

  widgets: [{ id: "note", label: "Quick note", span: 4, order: 70, render: (el) => QuickNote.render(el) }],
});
