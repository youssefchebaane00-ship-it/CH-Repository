// =========================================================
// NOTES → KNOWLEDGE HUB
//   Notes:     the Knowledge Hub page: notes that link to each other with
//              [[Note title]], backlinks, links to projects and subjects,
//              favorites, recently opened, advanced search and a graph view
//   QuickNote: the scratchpad on the dashboard (+ recent notes)
// =========================================================

const Notes = {
  CATEGORIES: { personal: "Personal", university: "University", projects: "Projects", ideas: "Ideas", other: "Other" },
  FILTERS: { all: "All", favorites: "Favorites", recent: "Recent" },
  state: { selectedId: null, query: "", category: "all", filter: "all", view: "list", showEditor: false, showHelp: false },

  // [[Note title]] — a link to the note with that title
  LINK_PATTERN: /\[\[([^\[\]\n]{1,120})\]\]/g,

  // ---------- Data helpers ----------
  all() {
    return Store.get("notes");
  },

  get(id) {
    return this.all().find((n) => n.id === id) || null;
  },

  // Pinned (favorite) notes first, then the most recently edited
  sorted(list) {
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },

  create(fields = {}) {
    const now = new Date().toISOString();
    const note = Store.NORMALIZE.notes({ id: Store.newId(), title: "", content: "", createdAt: now, updatedAt: now, lastOpenedAt: now, ...fields });
    Store.set("notes", [note, ...this.all()]);
    return note;
  },

  update(id, changes) {
    const before = this.get(id);
    Store.set("notes", this.all().map((n) => (n.id === id ? { ...n, ...changes, updatedAt: new Date().toISOString() } : n)));
    if (before && "title" in changes) this.renameLinks(before, changes.title); // keep [[links]] pointing at it
    return this.get(id);
  },

  // Remember when a note was opened (for "Recent"), without counting it as an edit
  markOpened(id) {
    Store.set("notes", this.all().map((n) => (n.id === id ? { ...n, lastOpenedAt: new Date().toISOString() } : n)));
  },

  titleOf(note) {
    return note.title.trim() || "Untitled note";
  },

  snippet(note, length = 90) {
    const text = note.content.replace(this.LINK_PATTERN, "$1").replace(/\s+/g, " ").trim();
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

  // ---------- Links between notes ----------
  linkTitles(note) {
    const titles = new Set();
    for (const match of note.content.matchAll(this.LINK_PATTERN)) {
      const title = match[1].trim();
      if (title) titles.add(title);
    }
    return [...titles];
  },

  findByTitle(title) {
    const wanted = String(title).trim().toLowerCase();
    return wanted ? this.all().find((n) => n.title.trim().toLowerCase() === wanted) || null : null;
  },

  // Where this note's [[links]] go: existing notes, and titles with no note yet
  outgoing(note) {
    const resolved = [];
    const unresolved = [];
    for (const title of this.linkTitles(note)) {
      const target = this.findByTitle(title);
      if (target && target.id !== note.id) { if (!resolved.includes(target)) resolved.push(target); }
      else if (!target) unresolved.push(title);
    }
    return { resolved, unresolved };
  },

  // Notes that link TO this note ("backlinks")
  backlinks(note) {
    const title = note.title.trim().toLowerCase();
    if (!title) return [];
    return this.all().filter((n) => n.id !== note.id && this.linkTitles(n).some((t) => t.toLowerCase() === title));
  },

  // A note was renamed: rewrite [[Old title]] → [[New title]] everywhere.
  // Skipped when another note shares the old title (we couldn't know which one was meant).
  renameLinks(before, newTitle) {
    const oldTitle = before.title.trim();
    const title = String(newTitle).trim();
    if (!oldTitle || !title || oldTitle.toLowerCase() === title.toLowerCase()) return 0;
    if (this.all().some((n) => n.id !== before.id && n.title.trim().toLowerCase() === oldTitle.toLowerCase())) return 0;
    const pattern = new RegExp(`\\[\\[\\s*${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\]\\]`, "gi");
    let count = 0;
    const notes = this.all().map((n) => {
      const content = n.content.replace(pattern, () => { count++; return `[[${title}]]`; });
      return content === n.content ? n : { ...n, content };
    });
    if (count) Store.set("notes", notes);
    return count;
  },

  // ---------- Advanced search ----------
  // Words must all appear. Also understands:
  //   "exact phrase"   #tag   is:favorite   is:linked   is:orphan
  //   category:university   project:robot   subject:math
  parseQuery(query) {
    const q = { words: [], phrases: [], tags: [], is: [], category: null, project: null, subject: null };
    for (const [, phrase, word] of String(query).matchAll(/"([^"]+)"|(\S+)/g)) {
      if (phrase) { q.phrases.push(phrase.toLowerCase()); continue; }
      const w = word.toLowerCase();
      const value = w.slice(w.indexOf(":") + 1);
      if (w.startsWith("#") && w.length > 1) q.tags.push(w.slice(1));
      else if (w.startsWith("is:")) q.is.push(value);
      else if (w.startsWith("category:") || w.startsWith("cat:")) q.category = value;
      else if (w.startsWith("project:")) q.project = value;
      else if (w.startsWith("subject:")) q.subject = value;
      else q.words.push(w);
    }
    return q;
  },

  matches(note, query) {
    if (!String(query).trim()) return true;
    const q = this.parseQuery(query);
    const text = [note.title, note.content, note.tags.join(" ")].join(" ").toLowerCase();
    if (!q.words.every((w) => text.includes(w))) return false;
    if (!q.phrases.every((p) => text.includes(p))) return false;
    if (!q.tags.every((t) => note.tags.includes(t))) return false;
    if (q.category && !(note.category.startsWith(q.category) || (this.CATEGORIES[note.category] || "").toLowerCase().startsWith(q.category))) return false;
    if (q.project) {
      const project = note.projectId ? Projects.get(note.projectId) : null;
      if (!project || !project.name.toLowerCase().includes(q.project)) return false;
    }
    if (q.subject) {
      const subject = note.subjectId ? Study.subject(note.subjectId) : null;
      if (!subject || !subject.name.toLowerCase().includes(q.subject)) return false;
    }
    for (const flag of q.is) {
      const linked = this.linkTitles(note).length > 0 || this.backlinks(note).length > 0;
      if (["favorite", "fav", "pinned", "starred"].includes(flag) && !note.pinned) return false;
      if (flag === "linked" && !linked) return false;
      if (flag === "orphan" && linked) return false;
    }
    return true;
  },

  // ---------- Knowledge Hub page ----------
  renderPage(container) {
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Knowledge Hub</h2><p>Notes that connect: link them with [[Note title]], attach them to projects and subjects, and see how ideas fit together.</p></div>
        <div class="header-actions">
          <div class="segmented" role="group" aria-label="View" data-views>
            <button type="button" data-view="list">${icon("file-text")}Notes</button>
            <button type="button" data-view="graph">${icon("network")}Graph</button>
          </div>
          <button class="btn btn-primary" type="button" data-new>${icon("plus")}New note</button>
        </div>
      </div>
      <div data-body></div>`;

    container.querySelector("[data-views]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      this.state.view = button.dataset.view;
      draw();
    });

    container.querySelector("[data-new]").addEventListener("click", () => {
      const category = this.state.category !== "all" ? this.state.category : "personal";
      const note = this.create({ category });
      Object.assign(this.state, { selectedId: note.id, showEditor: true, query: "", filter: "all", view: "list" });
      draw();
      container.querySelector('.note-editor [data-field="title"]')?.focus();
    });

    // Opening a note from the global search, a project or a link
    if (Router.highlightId && this.get(Router.highlightId)) {
      Object.assign(this.state, { selectedId: Router.highlightId, showEditor: true, view: "list" });
    }

    const body = container.querySelector("[data-body]");
    const draw = () => {
      container.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === this.state.view)));
      if (this.state.view === "graph") this.renderGraph(body, (id) => { Object.assign(this.state, { selectedId: id, showEditor: true, view: "list" }); draw(); });
      else this.renderList(body);
    };
    draw();
  },

  visibleNotes() {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const list = this.all().filter((n) =>
      (this.state.category === "all" || n.category === this.state.category) &&
      (this.state.filter !== "favorites" || n.pinned) &&
      (this.state.filter !== "recent" || (n.lastOpenedAt && n.lastOpenedAt >= twoWeeksAgo)) &&
      this.matches(n, this.state.query));
    return this.state.filter === "recent"
      ? list.sort((a, b) => (b.lastOpenedAt || "").localeCompare(a.lastOpenedAt || ""))
      : this.sorted(list);
  },

  renderList(body) {
    body.innerHTML = `
      <div class="notes-app" data-app>
        <section class="card notes-sidebar">
          <div class="notes-filters">
            <div class="search-field">
              ${icon("search")}
              <input class="input" type="search" placeholder="Search… (try #tag or is:favorite)" data-query aria-label="Search notes">
              <button class="btn-icon small search-help-button" type="button" data-help aria-label="Search tips" title="Search tips" aria-expanded="${this.state.showHelp}">${icon("circle-help")}</button>
            </div>
            <div class="search-help" data-help-panel ${this.state.showHelp ? "" : "hidden"}>
              <p><strong>Search tips</strong>: combine any of these:</p>
              <ul>
                <li><code>word another</code> both words</li>
                <li><code>"exact phrase"</code></li>
                <li><code>#tag</code> notes with a tag</li>
                <li><code>is:favorite</code> · <code>is:linked</code> · <code>is:orphan</code></li>
                <li><code>category:university</code> · <code>project:robot</code> · <code>subject:math</code></li>
              </ul>
            </div>
            <div class="filter-tabs notes-tabs" role="tablist" aria-label="Show" data-filters>
              ${Object.entries(this.FILTERS).map(([id, label]) => `<button type="button" role="tab" data-filter="${id}" aria-selected="${id === this.state.filter}">${label}</button>`).join("")}
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

    const app = body.querySelector("[data-app]");
    const list = body.querySelector("[data-list]");
    const editor = body.querySelector("[data-editor]");
    const queryInput = body.querySelector("[data-query]");
    const categorySelect = body.querySelector("[data-category]");
    queryInput.value = this.state.query;
    categorySelect.value = this.state.category;

    const drawList = () => {
      const notes = this.visibleNotes();
      list.innerHTML = notes.length ? notes.map((n) => {
        const links = this.linkTitles(n).length + this.backlinks(n).length;
        return `
          <li>
            <button type="button" class="note-row${n.id === this.state.selectedId ? " active" : ""}" data-id="${UI.escape(n.id)}">
              <span class="note-row-top">
                <strong>${UI.escape(this.titleOf(n))}</strong>
                ${links ? `<span class="link-count" title="${links} link${links === 1 ? "" : "s"}">${icon("link-2")}${links}</span>` : ""}
                ${n.pinned ? `<span class="pin-mark" title="Favorite">${icon("pin")}</span>` : ""}
              </span>
              <span class="note-row-snippet">${UI.escape(this.snippet(n))}</span>
              <span class="note-row-meta">
                <span>${UI.escape(this.state.filter === "recent" ? "opened " + this.timeAgo(n.lastOpenedAt) : this.timeAgo(n.updatedAt))}</span>
                <span class="badge">${UI.escape(this.CATEGORIES[n.category] || "Other")}</span>
                ${n.tags.slice(0, 2).map((t) => `<span class="badge tag">#${UI.escape(t)}</span>`).join("")}
              </span>
            </button>
          </li>`;
      }).join("")
        : `<li>${this.all().length
            ? UI.emptyState("search", "No matching notes", this.state.filter === "recent" ? "Notes you open appear here for 2 weeks." : "Try another search, filter or category.")
            : UI.emptyState("notebook-pen", "No notes yet", "Click “New note” to write your first one.")}</li>`;
    };

    const drawLinks = (panel, note) => {
      const { resolved, unresolved } = this.outgoing(note);
      const back = this.backlinks(note);
      const project = note.projectId ? Projects.get(note.projectId) : null;
      const subject = note.subjectId ? Study.subject(note.subjectId) : null;
      const chip = (n) => `<button type="button" class="note-chip" data-open-note="${UI.escape(n.id)}">${icon("file-text")}${UI.escape(this.titleOf(n))}</button>`;
      panel.innerHTML = `
        <div class="links-group">
          <span class="links-label">${icon("link-2")}Links to</span>
          ${resolved.map(chip).join("")}
          ${unresolved.map((t) => `<button type="button" class="note-chip missing" data-create-note="${UI.escape(t)}" title="No note with this title yet: click to create it">${icon("plus")}${UI.escape(t)}</button>`).join("")}
          ${!resolved.length && !unresolved.length ? `<span class="muted small">Type [[Note title]] in the text, or use ${icon("link-2")} above.</span>` : ""}
        </div>
        <div class="links-group">
          <span class="links-label">${icon("arrow-left")}Linked from</span>
          ${back.map(chip).join("") || `<span class="muted small">No other note links here yet.</span>`}
        </div>
        ${project || subject ? `
          <div class="links-group">
            <span class="links-label">${icon("folder")}Belongs to</span>
            ${project ? `<a class="note-chip" href="#/projects" data-open-project="${UI.escape(project.id)}"><span class="subject-dot" style="--subject:${UI.escape(project.color)}"></span>${UI.escape(project.name)}</a>` : ""}
            ${subject ? `<a class="note-chip" href="#/study"><span class="subject-dot" style="--subject:${UI.escape(subject.color)}"></span>${UI.escape(subject.name)}</a>` : ""}
          </div>` : ""}`;
    };

    const drawEditor = () => {
      const note = this.get(this.state.selectedId);
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
          <select class="input compact" data-field="subjectId" aria-label="Subject" title="Link this note to a study subject">
            <option value="">No subject</option>
            ${Study.subjects().map((s) => `<option value="${UI.escape(s.id)}"${s.id === note.subjectId ? " selected" : ""}>${UI.escape(s.name)}</option>`).join("")}
          </select>
          <div class="search-field tags-field" title="Tags, separated by commas">
            ${icon("tag")}
            <input class="input compact" data-field="tags" value="${UI.escape(note.tags.join(", "))}" placeholder="tags, comma, separated" aria-label="Tags">
          </div>
          <button class="btn-icon" type="button" data-insert-link aria-label="Insert a link to another note" title="Link to another note">${icon("link-2")}</button>
          <button class="btn-icon${note.pinned ? " is-active" : ""}" type="button" data-pin aria-pressed="${note.pinned}"
                  aria-label="${note.pinned ? "Remove from favorites" : "Add to favorites"}" title="${note.pinned ? "Remove from favorites" : "Favorite (pinned to the top)"}">${icon(note.pinned ? "pin-off" : "pin")}</button>
          <button class="btn-icon danger" type="button" data-delete aria-label="Delete note" title="Delete">${icon("trash-2")}</button>
        </div>
        <input class="note-title-input" data-field="title" value="${UI.escape(note.title)}" placeholder="Title" maxlength="120" aria-label="Note title">
        <textarea class="note-body-input" data-field="content" placeholder="Start writing… Link other notes with [[Note title]]." aria-label="Note content">${UI.escape(note.content)}</textarea>
        <div class="note-links" data-links></div>
        <div class="note-footer">
          <span>Created ${UI.escape(this.timeAgo(note.createdAt))}</span>
          <span data-saved>Edited ${UI.escape(this.timeAgo(note.updatedAt))}</span>
        </div>`;

      const panel = editor.querySelector("[data-links]");
      const textarea = editor.querySelector('[data-field="content"]');
      drawLinks(panel, note);

      // Autosave half a second after you stop typing (debounce)
      let timer;
      const saved = editor.querySelector("[data-saved]");
      const save = () => {
        const values = {
          title: editor.querySelector('[data-field="title"]').value.slice(0, 120),
          content: textarea.value,
          category: editor.querySelector('[data-field="category"]').value,
          tags: UI.parseTags(editor.querySelector('[data-field="tags"]').value),
          projectId: editor.querySelector('[data-field="projectId"]').value || null,
          subjectId: editor.querySelector('[data-field="subjectId"]').value || null,
        };
        const updated = this.update(note.id, values);
        saved.textContent = "Saved ✓";
        drawList();
        drawLinks(panel, updated);
      };
      const queueSave = () => {
        saved.textContent = "Saving…";
        clearTimeout(timer);
        timer = setTimeout(save, 500);
      };
      editor.querySelectorAll("[data-field]").forEach((field) => {
        field.addEventListener(field.tagName === "SELECT" ? "change" : "input", queueSave);
      });
      // Leaving the field saves immediately (no waiting)
      editor.addEventListener("focusout", () => { if (saved.textContent === "Saving…") { clearTimeout(timer); save(); } });

      editor.querySelector("[data-insert-link]").addEventListener("click", async () => {
        const others = this.sorted(this.all().filter((n) => n.id !== note.id && n.title.trim()));
        if (!others.length) {
          UI.toast("Give another note a title first, then you can link to it.", { type: "info" });
          return;
        }
        const cursor = textarea.selectionStart ?? textarea.value.length;
        const values = await UI.form({
          title: "Link to another note", submitLabel: "Insert link",
          fields: [{ name: "target", label: "Note", type: "select", value: others[0].id, options: others.map((n) => ({ value: n.id, label: this.titleOf(n) })) }],
        });
        if (!values) return;
        const target = this.get(values.target);
        if (!target) return;
        const link = `[[${target.title.trim()}]]`;
        textarea.value = textarea.value.slice(0, cursor) + link + textarea.value.slice(cursor);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = cursor + link.length;
        clearTimeout(timer);
        save();
      });

      panel.addEventListener("click", (event) => {
        const open = event.target.closest("[data-open-note]");
        const create = event.target.closest("[data-create-note]");
        const project = event.target.closest("[data-open-project]");
        if (open) { clearTimeout(timer); save(); this.state.selectedId = open.dataset.openNote; select(); return; }
        if (create) {
          clearTimeout(timer); save();
          const created = this.create({ title: create.dataset.createNote, category: note.category, projectId: note.projectId, subjectId: note.subjectId });
          UI.toast(`Note “${created.title}” created`, { actionLabel: "Open", onAction: () => { this.state.selectedId = created.id; select(); } });
          drawList();
          drawLinks(panel, this.get(note.id));
          return;
        }
        if (project) { event.preventDefault(); Router.go("projects", project.dataset.openProject); }
      });

      editor.querySelector("[data-pin]").addEventListener("click", () => {
        clearTimeout(timer);
        save();
        const current = this.get(note.id);
        this.update(note.id, { pinned: !current.pinned });
        UI.toast(current.pinned ? "Removed from favorites" : "Added to favorites (pinned to the top)", { type: "info" });
        drawList();
        drawEditor();
      });

      editor.querySelector("[data-delete]").addEventListener("click", async () => {
        clearTimeout(timer);
        const back = this.backlinks(note).length;
        const ok = await UI.confirm({
          title: "Delete this note?",
          message: `“${this.titleOf(note)}” will be permanently deleted.${back ? ` ${back} other note${back === 1 ? " links" : "s link"} to it; those links will show as missing.` : ""}`,
        });
        if (!ok) return;
        Store.set("notes", this.all().filter((n) => n.id !== note.id));
        this.state.selectedId = this.visibleNotes()[0]?.id || null;
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

    // Opening a note also remembers it for "Recent"
    const select = () => {
      this.state.showEditor = true;
      if (this.state.selectedId) this.markOpened(this.state.selectedId);
      drawList();
      drawEditor();
    };

    list.addEventListener("click", (event) => {
      const row = event.target.closest("[data-id]");
      if (!row) return;
      this.state.selectedId = row.dataset.id;
      select();
    });

    queryInput.addEventListener("input", () => { this.state.query = queryInput.value; drawList(); });
    categorySelect.addEventListener("change", () => { this.state.category = categorySelect.value; drawList(); });
    body.querySelector("[data-filters]").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-filter]");
      if (!tab) return;
      this.state.filter = tab.dataset.filter;
      body.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
      drawList();
    });
    body.querySelector("[data-help]").addEventListener("click", (event) => {
      this.state.showHelp = !this.state.showHelp;
      body.querySelector("[data-help-panel]").hidden = !this.state.showHelp;
      event.currentTarget.setAttribute("aria-expanded", String(this.state.showHelp));
    });

    if (!this.get(this.state.selectedId)) this.state.selectedId = this.visibleNotes()[0]?.id || null;
    else if (this.state.showEditor) this.markOpened(this.state.selectedId);
    drawList();
    drawEditor();
  },

  // ---------- Graph view ----------
  // Notes are dots, [[links]] are lines. Projects and subjects appear as
  // colored dots joined to their notes. The layout is a small "force"
  // simulation: dots push each other apart, lines pull linked dots together.
  graphData() {
    const notes = this.sorted(this.all()).slice(0, 200); // keep it readable and fast
    const nodes = notes.map((n) => ({ id: n.id, kind: "note", label: this.titleOf(n), pinned: n.pinned }));
    const edges = [];
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const addGroup = (key, label, color, kind) => {
      if (!index.has(key)) { index.set(key, nodes.length); nodes.push({ id: key, kind, label, color }); }
      return index.get(key);
    };
    notes.forEach((n) => {
      const from = index.get(n.id);
      this.outgoing(n).resolved.forEach((target) => {
        if (index.has(target.id)) edges.push([from, index.get(target.id), "link"]);
      });
      const project = n.projectId ? Projects.get(n.projectId) : null;
      if (project) edges.push([from, addGroup(`project:${project.id}`, project.name, project.color, "project"), "group"]);
      const subject = n.subjectId ? Study.subject(n.subjectId) : null;
      if (subject) edges.push([from, addGroup(`subject:${subject.id}`, subject.name, subject.color, "subject"), "group"]);
    });
    return { nodes, edges, notes: notes.length, links: edges.filter((e) => e[2] === "link").length };
  },

  layout(nodes, edges, width, height) {
    const n = nodes.length;
    // Start on a circle (same start every time, so the graph doesn't jump around)
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2;
      node.x = width / 2 + Math.cos(angle) * width * 0.3;
      node.y = height / 2 + Math.sin(angle) * height * 0.3;
    });
    const k = Math.sqrt((width * height) / Math.max(1, n)) * 0.35; // ideal distance between dots
    for (let step = 0; step < 300; step++) {
      const heat = 1 - step / 300; // moves get smaller as the layout settles
      nodes.forEach((a) => { a.dx = 0; a.dy = 0; });
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          if (dist > k * 4) continue; // far apart: no need to push
          const push = (k * k) / dist;
          dx /= dist; dy /= dist;
          a.dx += dx * push; a.dy += dy * push;
          b.dx -= dx * push; b.dy -= dy * push;
        }
      }
      edges.forEach(([i, j]) => {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const pull = (dist * dist) / k;
        a.dx -= (dx / dist) * pull; a.dy -= (dy / dist) * pull;
        b.dx += (dx / dist) * pull; b.dy += (dy / dist) * pull;
      });
      nodes.forEach((a) => {
        a.dx += (width / 2 - a.x) * 0.08; // pull towards the centre (keeps unlinked notes close)
        a.dy += (height / 2 - a.y) * 0.08;
        const len = Math.max(0.01, Math.hypot(a.dx, a.dy));
        const move = Math.min(len, 20 * heat + 0.5);
        a.x += (a.dx / len) * move;
        a.y += (a.dy / len) * move;
      });
    }

    // Finally, scale the whole picture to fill the canvas, leaving room on the right for labels
    const xs = nodes.map((a) => a.x), ys = nodes.map((a) => a.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const left = 30, right = width - 150, top = 30, bottom = height - 30;
    nodes.forEach((a) => {
      a.x = maxX > minX ? left + ((a.x - minX) / (maxX - minX)) * (right - left) : width / 2;
      a.y = maxY > minY ? top + ((a.y - minY) / (maxY - minY)) * (bottom - top) : height / 2;
    });
  },

  renderGraph(body, openNote) {
    const data = this.graphData();
    body.innerHTML = `
      <section class="card graph-card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-icon violet">${icon("network")}</span>Knowledge graph</h3>
          <span class="muted small">${data.notes} note${data.notes === 1 ? "" : "s"} · ${data.links} link${data.links === 1 ? "" : "s"} between notes</span>
        </div>
        ${data.notes ? `
          <div class="graph-legend">
            <span><span class="legend-dot note"></span>Note</span>
            <span><span class="legend-dot pinned"></span>Favorite</span>
            <span><span class="legend-square"></span>Project or subject</span>
            <span class="muted">Click a note to open it.</span>
          </div>
          <canvas class="graph-canvas" data-graph aria-label="Graph of your notes and how they link to each other" role="img"></canvas>`
        : UI.emptyState("network", "No notes yet", "Write a few notes and link them with [[Note title]] to see your knowledge graph.")}
      </section>`;
    const canvas = body.querySelector("[data-graph]");
    if (!canvas) return;

    const width = canvas.clientWidth || 800;
    const height = Math.max(380, Math.min(640, Math.round(width * 0.6)));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);

    const { nodes, edges } = data;
    this.layout(nodes, edges, width, height);
    const degree = new Array(nodes.length).fill(0);
    edges.forEach(([i, j]) => { degree[i]++; degree[j]++; });
    const radius = (i) => (nodes[i].kind === "note" ? 5 + Math.min(8, degree[i] * 1.5) : 8);
    const css = getComputedStyle(document.documentElement);
    const colors = {
      line: css.getPropertyValue("--border-strong").trim(),
      text: css.getPropertyValue("--text-muted").trim(),
      note: css.getPropertyValue("--accent").trim(),
      pinned: css.getPropertyValue("--amber").trim(),
      bg: css.getPropertyValue("--surface").trim(),
    };

    let hover = -1;
    const drawGraph = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1.2;
      edges.forEach(([i, j, kind]) => {
        ctx.strokeStyle = colors.line;
        ctx.setLineDash(kind === "group" ? [4, 4] : []);
        ctx.globalAlpha = hover === -1 || hover === i || hover === j ? 1 : 0.35;
        ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
      });
      ctx.setLineDash([]);
      nodes.forEach((node, i) => {
        ctx.globalAlpha = 1;
        ctx.fillStyle = node.kind === "note" ? (node.pinned ? colors.pinned : colors.note) : node.color;
        ctx.beginPath();
        if (node.kind === "note") ctx.arc(node.x, node.y, radius(i), 0, Math.PI * 2);
        else ctx.rect(node.x - 7, node.y - 7, 14, 14);
        ctx.fill();
        if (i === hover) { ctx.strokeStyle = colors.text; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.2; }
        // Labels: always for projects/subjects and connected notes; otherwise on hover
        if (node.kind !== "note" || degree[i] > 0 || i === hover || nodes.length <= 30) {
          ctx.fillStyle = colors.text;
          ctx.font = `${i === hover ? "600 " : ""}12px Inter, Segoe UI, sans-serif`;
          const label = node.label.length > 24 && i !== hover ? node.label.slice(0, 23) + "…" : node.label;
          ctx.fillText(label, node.x + radius(i) + 4, node.y + 4);
        }
      });
    };
    drawGraph();

    const nodeAt = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      let best = -1, bestDist = Infinity;
      nodes.forEach((node, i) => {
        const d = Math.hypot(node.x - x, node.y - y);
        if (d < radius(i) + 6 && d < bestDist) { best = i; bestDist = d; }
      });
      return best;
    };
    canvas.addEventListener("mousemove", (event) => {
      const found = nodeAt(event);
      if (found === hover) return;
      hover = found;
      canvas.style.cursor = found === -1 ? "default" : "pointer";
      canvas.title = found === -1 ? "" : nodes[found].label;
      drawGraph();
    });
    canvas.addEventListener("click", (event) => {
      const found = nodeAt(event);
      if (found === -1) return;
      const node = nodes[found];
      if (node.kind === "note") openNote(node.id);
      else if (node.kind === "project") Router.go("projects", node.id.slice("project:".length));
      else Router.go("study");
    });
    this.lastGraph = { nodes, edges }; // used by the automated tests
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
  nav: { label: "Knowledge", icon: "book-marked" },
  page: (container) => Notes.renderPage(container),

  collections: {
    // { id, title, content, category, tags, pinned (favorite), projectId, subjectId, createdAt, updatedAt, lastOpenedAt }
    notes: {
      default: [],
      backup: true,
      normalize: (n) => ({
        title: "", content: "", category: "personal", pinned: false, createdAt: null, updatedAt: null, projectId: null, subjectId: null, lastOpenedAt: null,
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
