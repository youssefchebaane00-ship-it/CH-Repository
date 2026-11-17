// =========================================================
// POMODORO TIMER
// Focus for 25 minutes, take a 5-minute break, and after every 4 focus
// sessions take a 15-minute break (all changeable in Settings).
//
// How the timer stays correct: instead of counting seconds, we save the
// moment the period ENDS (endsAt). The time left is always endsAt − now,
// so it keeps working across page changes, refreshes, even closing the tab.
// =========================================================

const Pomodoro = {
  MODES: {
    focus: { label: "Focus", icon: "brain", setting: "pomodoroFocus" },
    short: { label: "Short break", icon: "coffee", setting: "pomodoroShort" },
    long: { label: "Long break", icon: "coffee", setting: "pomodoroLong" },
  },

  // ---------- State ----------
  // { mode, status: "idle"|"running"|"paused", endsAt, remainingMs, cycle, subjectId, countDate, count }
  state() {
    const saved = Store.get("pomodoro");
    const fresh = { mode: "focus", status: "idle", endsAt: null, remainingMs: null, cycle: 0, subjectId: "", countDate: UI.dateKey(), count: 0 };
    const state = { ...fresh, ...(saved || {}) };
    if (!(state.mode in this.MODES)) state.mode = "focus";
    if (state.countDate !== UI.dateKey()) { state.countDate = UI.dateKey(); state.count = 0; } // new day, new count
    return state;
  },

  save(state) {
    Store.set("pomodoro", state);
  },

  durationMs(mode) {
    return Math.max(1, Number(Store.get("settings")[this.MODES[mode].setting]) || 1) * 60000;
  },

  remainingMs(state = this.state()) {
    if (state.status === "running") return Math.max(0, state.endsAt - Date.now());
    if (state.status === "paused") return state.remainingMs;
    return this.durationMs(state.mode);
  },

  isRunning() {
    return this.state().status === "running";
  },

  isActive() {
    return this.state().status !== "idle";
  },

  // ---------- Controls ----------
  start() {
    // Don't count the same minutes twice
    if (Study.activeElapsedMs() > 0 && this.state().mode === "focus") {
      UI.toast("Stop or save the study stopwatch first, so time isn't counted twice.", { type: "info" });
      return;
    }
    Sound.unlock(); // browsers only allow sound after a click
    const state = this.state();
    state.endsAt = Date.now() + this.remainingMs(state);
    state.status = "running";
    state.remainingMs = null;
    this.save(state);
  },

  pause() {
    const state = this.state();
    if (state.status !== "running") return;
    state.remainingMs = Math.max(0, state.endsAt - Date.now());
    state.status = "paused";
    state.endsAt = null;
    this.save(state);
  },

  reset() {
    const state = this.state();
    Object.assign(state, { status: "idle", endsAt: null, remainingMs: null });
    this.save(state);
  },

  switchMode(mode) {
    const state = this.state();
    Object.assign(state, { mode, status: "idle", endsAt: null, remainingMs: null });
    this.save(state);
  },

  // Jump to the next period without logging anything
  skip() {
    const state = this.state();
    this.switchMode(this.nextMode(state, false));
  },

  setSubject(subjectId) {
    const state = this.state();
    state.subjectId = subjectId;
    this.save(state);
  },

  nextMode(state, focusFinished) {
    if (state.mode !== "focus") return "focus";
    const every = Math.max(2, Number(Store.get("settings").pomodoroLongEvery) || 4);
    return focusFinished && state.cycle % every === 0 ? "long" : "short";
  },

  // Called by app.js every second. Finishes the period when time is up.
  tick() {
    const state = this.state();
    if (state.status === "running" && state.endsAt <= Date.now()) this.complete(state);
  },

  complete(state) {
    const wasFocus = state.mode === "focus";
    let message;

    if (wasFocus) {
      state.cycle += 1;
      state.count += 1;
      const minutes = Math.round(this.durationMs("focus") / 60000);
      const subject = Study.subject(state.subjectId);
      if (subject) {
        // Log the focus time as a study session
        Study.addSession({
          subjectId: subject.id,
          description: "Pomodoro focus session",
          durationSec: minutes * 60,
          startedAt: new Date(state.endsAt - minutes * 60000).toISOString(),
          source: "pomodoro",
        });
        message = `Focus session done! ${minutes} min added to ${subject.name}. Time for a break.`;
      } else {
        message = "Focus session done! Time for a break.";
      }
    } else {
      message = "Break's over. Ready to focus?";
    }

    const next = this.nextMode(state, wasFocus);
    Object.assign(state, { mode: next, status: "idle", endsAt: null, remainingMs: null });
    this.save(state);

    if (Store.get("settings").pomodoroSound) Sound.chime();
    UI.toast(message, { type: "info", duration: 8000 });
    if (wasFocus && state.count % 4 === 0) UI.confetti();

    // Redraw pages that show study data
    if (["study", "dashboard"].includes(Router.currentId())) Router.refresh();
  },

  // ---------- The Pomodoro card (Study page) ----------
  renderCard(container) {
    const RADIUS = 88;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon rose">${icon("timer")}</span>Pomodoro</h3>
        <span class="badge" data-pomo-count title="Focus sessions completed today"></span>
        <a class="btn-icon small" href="#/settings" aria-label="Pomodoro settings" title="Change durations">${icon("settings")}</a>
      </div>
      <div class="segmented pomo-modes" role="group" aria-label="Pomodoro mode" data-modes>
        ${Object.entries(this.MODES).map(([id, m]) => `<button type="button" data-mode="${id}">${icon(m.icon)}${m.label}</button>`).join("")}
      </div>
      <div class="pomo-ring" data-mode-color>
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle class="pomo-track" cx="100" cy="100" r="${RADIUS}"></circle>
          <circle class="pomo-progress" cx="100" cy="100" r="${RADIUS}" data-pomo-ring
                  stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0"></circle>
        </svg>
        <div class="pomo-center">
          <div class="pomo-time" data-pomo-time aria-live="off">25:00</div>
          <div class="pomo-label" data-pomo-label></div>
        </div>
      </div>
      <div class="timer-controls" data-pomo-controls></div>
      <label class="field pomo-subject">
        <span>Log focus time to</span>
        <select class="input" data-pomo-subject aria-label="Subject to log focus time to"></select>
      </label>`;

    const subjectSelect = container.querySelector("[data-pomo-subject]");
    const fillSubjects = () => {
      const state = this.state();
      subjectSelect.innerHTML = `<option value="">Don't log (just a timer)</option>` +
        Study.subjects().map((s) => `<option value="${UI.escape(s.id)}"${s.id === state.subjectId ? " selected" : ""}>${UI.escape(s.name)}</option>`).join("");
    };
    subjectSelect.addEventListener("change", () => this.setSubject(subjectSelect.value));

    const drawControls = () => {
      const state = this.state();
      const controls = container.querySelector("[data-pomo-controls]");
      const button = (action, label, iconName, cls = "btn-secondary") =>
        `<button class="btn ${cls}" type="button" data-action="${action}">${icon(iconName)}${label}</button>`;
      controls.innerHTML =
        (state.status === "running" ? button("pause", "Pause", "pause", "btn-primary")
          : button("start", state.status === "paused" ? "Resume" : "Start", "play", "btn-primary")) +
        button("reset", "Reset", "rotate-ccw") +
        button("skip", "Skip", "skip-forward");
      container.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
      container.querySelector("[data-mode-color]").dataset.modeColor = state.mode;
      const every = Math.max(2, Number(Store.get("settings").pomodoroLongEvery) || 4);
      container.querySelector("[data-pomo-count]").textContent = `${state.count} today · ${state.cycle % every}/${every} to long break`;
    };

    container.querySelector("[data-pomo-controls]").addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      this[action]();
      drawControls();
      this.updateDisplays();
    });

    container.querySelector("[data-modes]").addEventListener("click", async (event) => {
      const mode = event.target.closest("[data-mode]")?.dataset.mode;
      if (!mode || mode === this.state().mode) return;
      if (this.state().status === "running") {
        const ok = await UI.confirm({ title: "Switch mode?", message: "The running timer will be stopped. Nothing will be logged.", confirmLabel: "Switch", danger: false });
        if (!ok) return;
      }
      this.switchMode(mode);
      drawControls();
      this.updateDisplays();
    });

    this.circumference = CIRCUMFERENCE;
    fillSubjects();
    drawControls();
    this.updateDisplays();
  },

  // Update every Pomodoro display on screen (called every second)
  updateDisplays() {
    const state = this.state();
    const remaining = this.remainingMs(state);
    const total = this.durationMs(state.mode);
    const text = UI.formatClock(remaining);

    document.querySelectorAll("[data-pomo-time]").forEach((el) => { el.textContent = text; });
    document.querySelectorAll("[data-pomo-label]").forEach((el) => {
      el.textContent = `${this.MODES[state.mode].label}${state.status === "paused" ? " · paused" : ""}`;
    });
    document.querySelectorAll("[data-pomo-ring]").forEach((ring) => {
      ring.style.strokeDashoffset = String(this.circumference * (1 - remaining / total));
    });
  },
};

// =========================================================
// SOUND: a short three-note chime made by the browser (Web Audio API).
// No sound file needed. Browsers only allow audio after the user has
// clicked something, so unlock() is called from the Start buttons.
// =========================================================
const Sound = {
  context: null,

  unlock() {
    try {
      if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === "suspended") this.context.resume();
    } catch {
      // No audio support: the toast message still appears
    }
  },

  chime() {
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;
    [880, 660, 990].forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);   // quick fade in
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5); // gentle fade out
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  },
};
