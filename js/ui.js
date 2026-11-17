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

  // A small form in a dialog. Resolves to { fieldName: value } or null if cancelled.
  // fields: [{ name, label, placeholder, value, required, validate(value) → error text or "" }]
  form({ title, submitLabel = "Save", fields }) {
    return new Promise((resolve) => {
      const fieldsHtml = fields.map((f) => `
        <div class="field">
          <label for="modal-${f.name}">${this.escape(f.label)}</label>
          <input class="input" id="modal-${f.name}" name="${f.name}" type="text" autocomplete="off"
                 placeholder="${this.escape(f.placeholder || "")}" value="${this.escape(f.value || "")}">
          <span class="field-error" data-error-for="${f.name}"></span>
        </div>`).join("");

      this.openModal(`
        <form novalidate>
          <h2>${this.escape(title)}</h2>
          <div class="modal-fields">${fieldsHtml}</div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" data-cancel>Cancel</button>
            <button class="btn btn-primary" type="submit">${this.escape(submitLabel)}</button>
          </div>
        </form>`,
        (modal, close) => {
          const form = modal.querySelector("form");
          const finish = (values) => { close(); resolve(values); };

          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const values = {};
            let valid = true;

            for (const f of fields) {
              const input = form.elements[f.name];
              const value = input.value.trim();
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
