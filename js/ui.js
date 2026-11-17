// =========================================================
// UI HELPERS: small tools used by every page:
// safe text, dates, toasts, dialogs, animations, confetti.
// =========================================================

const UI = {
  // Is "Animation effects" switched off in the system settings?
  reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)"),

  // Make user text safe to put inside HTML. Without this, a task named
  // "<img onerror=...>" could run code. ALWAYS use it for user data.
  escape(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  // A date as "2026-11-17", in your local time
  dateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0"); // months start at 0!
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  // The date key `days` days before today
  daysAgoKey(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this.dateKey(date);
  },

  // ----- More date tools. All work with "YYYY-MM-DD" keys in local time. -----

  // "2026-11-17" → a Date at midnight local time
  parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  },

  isDateKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(this.parseKey(value));
  },

  addDays(key, days) {
    const date = this.parseKey(key);
    date.setDate(date.getDate() + days);
    return this.dateKey(date);
  },

  // Whole days from key a to key b (b - a). Uses UTC so daylight saving can't shift it.
  diffDays(a, b) {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  },

  // Monday of the week containing `key` (weeks start on Monday)
  startOfWeek(key) {
    const day = this.parseKey(key).getDay();   // 0 = Sunday … 6 = Saturday
    return this.addDays(key, day === 0 ? -6 : 1 - day);
  },

  formatDay(key, options = { weekday: "short", day: "numeric", month: "short" }) {
    return this.parseKey(key).toLocaleDateString(undefined, options);
  },

  // "Today", "Tomorrow", "In 3 days", "2 days ago"…
  relativeDay(key) {
    const diff = this.diffDays(this.dateKey(), key);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff > 1 && diff < 7) return `In ${diff} days`;
    if (diff < -1 && diff > -7) return `${-diff} days ago`;
    return this.formatDay(key);
  },

  // 5400 seconds → "1h 30m"; 900 → "15m"; 40 → "40s"
  formatDuration(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m) return `${m}m`;
    return s ? `${s}s` : "0m";
  },

  // milliseconds → "1:05:09" or "25:00" (for running timers)
  formatClock(ms, alwaysHours = false) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h || alwaysHours ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  },

  // "a, b , c" → ["a", "b", "c"] (no duplicates, no empties)
  parseTags(text) {
    return [...new Set(String(text).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  },

  // Turn an HTML string into a real element
  html(markup) {
    const template = document.createElement("template");
    template.innerHTML = markup.trim();
    return template.content.firstElementChild;
  },

  // A friendly empty state (icon + title + hint)
  emptyState(iconName, title, hint) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon(iconName)}</div>
        <strong>${this.escape(title)}</strong>
        <p>${this.escape(hint)}</p>
      </div>`;
  },

  // ---------------------------------------------------------
  // TOASTS: small messages in the bottom-right corner.
  // UI.toast("Task added")
  // UI.toast("Task deleted", { actionLabel: "Undo", onAction: () => ... })
  // ---------------------------------------------------------
  toast(message, { type = "success", actionLabel, onAction, duration = 4000 } = {}) {
    const icons = { success: "circle-check", error: "x", info: "sparkles" };
    const toast = this.html(`
      <div class="toast ${type}" role="status">
        <span class="toast-icon">${icon(icons[type])}</span>
        <span class="toast-message">${this.escape(message)}</span>
        ${actionLabel ? `<button class="toast-action" type="button">${this.escape(actionLabel)}</button>` : ""}
      </div>`);

    const close = () => {
      clearTimeout(timer);
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 200);
    };

    if (actionLabel) {
      toast.querySelector(".toast-action").addEventListener("click", () => {
        onAction();
        close();
      });
    }

    document.getElementById("toasts").appendChild(toast);
    const timer = setTimeout(close, duration);
  },

  // ---------------------------------------------------------
  // MODAL DIALOGS
  // openModal builds the window; confirm and form use it.
  // They return a "Promise": a value that arrives later, when
  // the user clicks a button. Use them with `await`.
  // ---------------------------------------------------------
  openModal(contentHtml, onReady) {
    const previousFocus = document.activeElement;
    const backdrop = this.html(`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${contentHtml}</div></div>`);
    const modal = backdrop.firstElementChild;

    let closeHandler = null;
    const close = () => {
      document.removeEventListener("keydown", onKey); // clean up: no leftover listeners
      backdrop.remove();
      if (previousFocus) previousFocus.focus();
    };
    const onKey = (event) => {
      if (event.key === "Escape" && closeHandler) closeHandler();
    };

    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop && closeHandler) closeHandler(); // click outside = cancel
    });

    document.body.appendChild(backdrop);
    closeHandler = onReady(modal, close);
  },

  // Ask "Are you sure?". Resolves to true (confirmed) or false.
  confirm({ title, message, confirmLabel = "Delete", danger = true }) {
    return new Promise((resolve) => {
      this.openModal(`
        <h2>${this.escape(title)}</h2>
        <p class="modal-message">${this.escape(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" data-cancel>Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-ok>${this.escape(confirmLabel)}</button>
        </div>`,
        (modal, close) => {
          const finish = (answer) => { close(); resolve(answer); };
          modal.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
          modal.querySelector("[data-ok]").addEventListener("click", () => finish(true));
          modal.querySelector("[data-ok]").focus();
          return () => finish(false); // what Escape / clicking outside does
        });
    });
  },

  // A form in a dialog. Resolves to { fieldName: value }, or null if cancelled,
  // or "delete" if the optional Delete button was clicked (edit dialogs).
  // fields: [{ name, label, type, options, placeholder, value, required, half,
  //            validate(value) → error text or "" }]
  // type: "text" (default) | "textarea" | "select" | "date" | "time" | "number"
  form({ title, submitLabel = "Save", fields, deleteLabel = null }) {
    return new Promise((resolve) => {
      const fieldHtml = (f) => {
        const id = `modal-${f.name}`;
        const value = f.value === undefined || f.value === null ? "" : String(f.value);
        const common = `class="input" id="${id}" name="${f.name}"`;
        let control;
        if (f.type === "textarea") {
          control = `<textarea ${common} rows="${f.rows || 3}" placeholder="${this.escape(f.placeholder || "")}">${this.escape(value)}</textarea>`;
        } else if (f.type === "select") {
          control = `<select ${common}>${f.options.map((o) =>
            `<option value="${this.escape(o.value)}"${o.value === value ? " selected" : ""}>${this.escape(o.label)}</option>`).join("")}</select>`;
        } else {
          const extra = f.type === "number" ? ` min="${f.min ?? ""}" max="${f.max ?? ""}" step="1"` : "";
          control = `<input ${common} type="${f.type || "text"}" autocomplete="off"${extra}
                       placeholder="${this.escape(f.placeholder || "")}" value="${this.escape(value)}">`;
        }
        return `
          <div class="field${f.half ? " half" : ""}">
            <label for="${id}">${this.escape(f.label)}</label>
            ${control}
            <span class="field-error" data-error-for="${f.name}"></span>
          </div>`;
      };

      this.openModal(`
        <form novalidate>
          <h2>${this.escape(title)}</h2>
          <div class="modal-fields">${fields.map(fieldHtml).join("")}</div>
          <div class="modal-actions">
            ${deleteLabel ? `<button class="btn btn-secondary danger-text" type="button" data-delete>${icon("trash-2")}${this.escape(deleteLabel)}</button>` : ""}
            <button class="btn btn-secondary" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">${this.escape(submitLabel)}</button>
          </div>
        </form>`,
        (modal, close) => {
          const form = modal.querySelector("form");
          const finish = (values) => { close(); resolve(values); };
          if (deleteLabel) modal.querySelector("[data-delete]").addEventListener("click", () => finish("delete"));

          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const values = {};
            let valid = true;

            for (const f of fields) {
              const input = form.elements[f.name];
              const value = f.type === "textarea" ? input.value.replace(/\s+$/, "") : input.value.trim();
              let error = "";
              if (f.required && value === "") error = `${f.label} is required.`;
              else if (f.validate) error = f.validate(value) || "";

              form.querySelector(`[data-error-for="${f.name}"]`).textContent = error;
              input.classList.toggle("invalid", Boolean(error));
              if (error && valid) input.focus();
              if (error) valid = false;
              values[f.name] = value;
            }

            if (valid) finish(values);
          });

          modal.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
          form.elements[fields[0].name].focus();
          return () => finish(null);
        });
    });
  },

  // ---------------------------------------------------------
  // ANIMATION HELPERS
  // ---------------------------------------------------------

  // Play a CSS animation class again, even if it already played.
  // Reading offsetWidth in between forces the browser to notice the change.
  replayAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  },

  // Play the "leaving" animation, THEN run whenDone (which removes the element)
  removeWithAnimation(element, whenDone) {
    if (this.reduceMotion.matches) {
      whenDone();
      return;
    }
    element.classList.add("leaving");
    setTimeout(whenDone, 250); // = the animation length in animations.css
  },

  // Scroll to an element and make it glow briefly (used by search)
  highlight(element) {
    element.scrollIntoView({ block: "center", behavior: this.reduceMotion.matches ? "auto" : "smooth" });
    this.replayAnimation(element, "highlighted");
  },

  // 🎊 Confetti: ~150 paper pieces drawn on a temporary <canvas>.
  // Each frame, every piece moves a little and gravity pulls it down.
  confetti() {
    if (this.reduceMotion.matches) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed; inset:0; pointer-events:none; z-index:300;";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const colors = ["#22d3ee", "#2dd4bf", "#fbbf24", "#fb7185", "#60a5fa", "#a78bfa"];
    const pieces = Array.from({ length: 150 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      return {
        x: canvas.width / 2,
        y: canvas.height / 3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,  // negative = upwards
        size: 6 + Math.random() * 6,
        color: colors[i % colors.length],
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
      };
    });

    const start = performance.now();
    const frame = (now) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.vy += 0.25;   // gravity
        p.vx *= 0.99;   // air resistance
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (now - start < 3000) requestAnimationFrame(frame);
      else canvas.remove();
    };
    requestAnimationFrame(frame);
  },
};
