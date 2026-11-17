// =========================================================
// QUICK NOTE widget: one notepad that saves automatically.
// (Multiple notes with titles, tags and search come in Phase 2.)
// =========================================================

const QuickNote = {
  render(container, { page = false } = {}) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon violet">${icon("notebook-pen")}</span>Quick note</h3>
        ${page ? "" : `<a class="card-link" href="#/notes">Open ${icon("chevron-right")}</a>`}
      </div>
      <textarea class="input note-area" data-note-input placeholder="Write anything here… it saves automatically."
                aria-label="Quick note"></textarea>
      <span class="note-status" data-status></span>`;

    const textarea = container.querySelector("[data-note-input]");
    const status = container.querySelector("[data-status]");
    textarea.value = Store.get("quickNote");

    // "Debounce": restart a short timer on every keystroke and only save
    // when you pause for half a second (instead of on every letter).
    let timer;
    textarea.addEventListener("input", () => {
      status.textContent = "Typing…";
      clearTimeout(timer);
      timer = setTimeout(() => {
        Store.set("quickNote", textarea.value);
        status.textContent = "Saved ✓";
      }, 500);
    });
  },
};
