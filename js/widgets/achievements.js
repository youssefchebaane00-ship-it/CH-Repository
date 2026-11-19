// =========================================================
// ACHIEVEMENTS (optional): XP, levels, achievements and challenges.
//
// XP is CALCULATED from your saved history every time, never stored as a
// counter. So past work counts, nothing can drift, and deleting a task
// you never did also removes its XP. Challenges are just for fun: they
// give no XP, so XP always means real work done.
// Everything can be switched off in Settings.
// =========================================================

const Achievements = {
  XP: { task: 10, highPriority: 5, habit: 5, studyPer5Min: 1, goal: 50, milestone: 25, project: 100, streak7: 25, streak30: 100 },
  TITLES: [[1, "Beginner"], [3, "Apprentice"], [5, "Focused"], [8, "Achiever"], [12, "Expert"], [16, "Master"], [20, "Legend"]],

  enabled() {
    return Store.get("settings").gamification !== false;
  },

  // ---------- XP events, from history ----------
  // Every piece of real work becomes { xp, date, source }. date can be null when unknown.
  events() {
    const list = [];
    const dateOf = (iso) => (iso ? UI.dateKey(new Date(iso)) : null);

    Tasks.all().filter((t) => t.done).forEach((t) =>
      list.push({ xp: this.XP.task + (t.priority === "high" ? this.XP.highPriority : 0), date: dateOf(t.completedAt), source: "Tasks" }));

    Habits.all().forEach((h) => {
      const days = [...new Set(h.doneDays)].sort();
      days.forEach((d) => list.push({ xp: this.XP.habit, date: d, source: "Habits" }));
      if (Habits.isWeekly(h)) return;
      // Streak bonuses: the day a run of consecutive days reaches 7 and 30
      let run = 0;
      days.forEach((d, i) => {
        run = i > 0 && UI.diffDays(days[i - 1], d) === 1 ? run + 1 : 1;
        if (run === 7) list.push({ xp: this.XP.streak7, date: d, source: "Streak bonuses" });
        if (run === 30) list.push({ xp: this.XP.streak30, date: d, source: "Streak bonuses" });
      });
    });

    Study.sessions().forEach((s) => {
      const xp = Math.floor(s.durationSec / 300) * this.XP.studyPer5Min;
      if (xp) list.push({ xp, date: s.date, source: "Study" });
    });

    Goals.all().filter((g) => g.status === "completed").forEach((g) => list.push({ xp: this.XP.goal, date: dateOf(g.completedAt), source: "Goals" }));

    Projects.all().forEach((p) => {
      p.milestones.filter((m) => m.done).forEach((m) => list.push({ xp: this.XP.milestone, date: dateOf(m.doneAt), source: "Projects" }));
      if (p.status === "completed") list.push({ xp: this.XP.project, date: null, source: "Projects" });
    });
    return list;
  },

  // Total XP needed to REACH a level: 0, 100, 300, 600, 1000, 1500…
  xpForLevel(level) {
    return 50 * level * (level - 1);
  },

  levelInfo(xp) {
    let level = 1;
    while (this.xpForLevel(level + 1) <= xp) level++;
    const from = this.xpForLevel(level);
    const to = this.xpForLevel(level + 1);
    const title = [...this.TITLES].reverse().find(([min]) => level >= min)[1];
    return { level, title, xp, into: xp - from, needed: to - from, percent: Math.round(((xp - from) / (to - from)) * 100) };
  },

  state() {
    const events = this.events();
    const total = events.reduce((n, e) => n + e.xp, 0);
    const today = UI.dateKey();
    const weekStart = UI.startOfWeek(today);
    const bySource = {};
    events.forEach((e) => { bySource[e.source] = (bySource[e.source] || 0) + e.xp; });
    return {
      ...this.levelInfo(total),
      today: events.filter((e) => e.date === today).reduce((n, e) => n + e.xp, 0),
      week: events.filter((e) => e.date && e.date >= weekStart).reduce((n, e) => n + e.xp, 0),
      bySource,
    };
  },

  // ---------- Achievements ----------
  // The date a count reached `target`, from a list of dates (null if unknown or not reached)
  dateReached(dates, target) {
    const known = dates.filter(Boolean).sort();
    return known.length >= target ? known[target - 1] : null;
  },

  // Cumulative amount (e.g. study seconds) per date → date the total reached `target`
  dateTotalReached(entries, target) {
    let sum = 0;
    for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
      sum += e.amount;
      if (sum >= target) return e.date;
    }
    return null;
  },

  bestStreakDate(target) {
    let best = null;
    Habits.all().filter((h) => !Habits.isWeekly(h)).forEach((h) => {
      const days = [...new Set(h.doneDays)].sort();
      let run = 0;
      for (let i = 0; i < days.length; i++) {
        run = i > 0 && UI.diffDays(days[i - 1], days[i]) === 1 ? run + 1 : 1;
        if (run === target) { if (!best || days[i] < best) best = days[i]; break; }
      }
    });
    return best;
  },

  list() {
    const doneTasks = Tasks.all().filter((t) => t.done);
    const taskDates = doneTasks.map((t) => (t.completedAt ? UI.dateKey(new Date(t.completedAt)) : null));
    const study = Study.sessions().map((s) => ({ date: s.date, amount: s.durationSec }));
    const studySec = study.reduce((n, s) => n + s.amount, 0);
    const pomodoros = Study.sessions().filter((s) => s.source === "pomodoro");
    const goals = Goals.all().filter((g) => g.status === "completed");
    const longest = Math.max(0, ...Habits.all().filter((h) => !Habits.isWeekly(h)).map((h) => Habits.longestStreak(h)));
    const early = doneTasks.filter((t) => t.completedAt && new Date(t.completedAt).getHours() < 8).map((t) => UI.dateKey(new Date(t.completedAt))).sort();
    const blocks = Planner.all();
    const linkedNotes = Notes.all().filter((n) => Notes.outgoing(n).resolved.length > 0);
    const projectsDone = Projects.all().filter((p) => p.status === "completed");

    const count = (id, iconName, title, desc, value, target, date) => ({ id, icon: iconName, title, desc, value: Math.min(value, target), target, done: value >= target, date: value >= target ? date : null });
    return [
      count("first-task", "circle-check", "First step", "Finish your first task", doneTasks.length, 1, this.dateReached(taskDates, 1)),
      count("tasks-10", "list-checks", "Getting things done", "Finish 10 tasks", doneTasks.length, 10, this.dateReached(taskDates, 10)),
      count("tasks-50", "list-checks", "Productive", "Finish 50 tasks", doneTasks.length, 50, this.dateReached(taskDates, 50)),
      count("tasks-200", "crown", "Task master", "Finish 200 tasks", doneTasks.length, 200, this.dateReached(taskDates, 200)),
      count("study-1h", "graduation-cap", "Hitting the books", "Study for 1 hour in total", Math.floor(studySec / 60), 60, this.dateTotalReached(study, 3600)),
      count("study-10h", "graduation-cap", "Dedicated student", "Study for 10 hours in total", Math.floor(studySec / 3600), 10, this.dateTotalReached(study, 36000)),
      count("study-100h", "award", "Scholar", "Study for 100 hours in total", Math.floor(studySec / 3600), 100, this.dateTotalReached(study, 360000)),
      count("pomodoro-1", "timer", "Tomato", "Complete a Pomodoro focus session", pomodoros.length, 1, this.dateReached(pomodoros.map((s) => s.date), 1)),
      count("pomodoro-25", "timer", "Focus machine", "Complete 25 Pomodoro sessions", pomodoros.length, 25, this.dateReached(pomodoros.map((s) => s.date), 25)),
      count("streak-7", "flame", "On fire", "Keep a daily habit 7 days in a row", longest, 7, this.bestStreakDate(7)),
      count("streak-30", "flame", "Unstoppable", "Keep a daily habit 30 days in a row", longest, 30, this.bestStreakDate(30)),
      count("goal-1", "target", "Goal getter", "Complete a goal", goals.length, 1, this.dateReached(goals.map((g) => (g.completedAt ? UI.dateKey(new Date(g.completedAt)) : null)), 1)),
      count("goal-10", "trophy", "Visionary", "Complete 10 goals", goals.length, 10, this.dateReached(goals.map((g) => (g.completedAt ? UI.dateKey(new Date(g.completedAt)) : null)), 10)),
      count("project-1", "folder-kanban", "Ship it", "Mark a project as completed", projectsDone.length, 1, null),
      count("early-bird", "sunrise", "Early bird", "Finish a task before 8:00", early.length, 1, early[0] || null),
      count("planner-10", "calendar-clock", "Planner", "Plan 10 time blocks", blocks.length, 10, this.dateReached(blocks.map((b) => (b.createdAt ? UI.dateKey(new Date(b.createdAt)) : null)), 10)),
      count("knowledge-10", "network", "Connected thinker", "Have 10 notes that link to other notes", linkedNotes.length, 10, null),
    ];
  },

  // ---------- Challenges (just for fun, no XP) ----------
  // Picked from what you actually use, the same set all day / all week.
  pick(pool, count, seedText) {
    let seed = [...seedText].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
    const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  },

  dailyChallenges() {
    const today = UI.dateKey();
    const doneToday = Tasks.all().filter((t) => Tasks.completedToday(t));
    const studyToday = Study.secondsBetween(today, today);
    const habits = Habits.all();
    const pool = [
      { id: "tasks3", title: "Finish 3 tasks", value: doneToday.length, target: 3, show: true },
      { id: "high1", title: "Finish a high-priority task", value: doneToday.filter((t) => t.priority === "high").length, target: 1, show: Tasks.all().some((t) => t.priority === "high") },
      { id: "study45", title: "Study for 45 minutes", value: Math.floor(studyToday / 60), target: 45, unit: "min", show: Study.subjects().length > 0 },
      { id: "pomodoro", title: "Complete a Pomodoro", value: Study.sessions().filter((s) => s.date === today && s.source === "pomodoro").length, target: 1, show: Study.subjects().length > 0 },
      { id: "habits", title: "Do all your habits", value: habits.filter((h) => Habits.doneForToday(h)).length, target: Math.max(1, habits.length), show: habits.length > 0 },
      { id: "note", title: "Write or improve a note", value: Notes.all().filter((n) => n.updatedAt && UI.dateKey(new Date(n.updatedAt)) === today).length, target: 1, show: true },
      { id: "plan", title: "Plan 2 time blocks for today", value: Planner.blocksOn(today).length, target: 2, show: Tasks.all().some((t) => !t.done) },
    ].filter((c) => c.show);
    return this.pick(pool, 3, `day-${today}`).map((c) => ({ ...c, done: c.value >= c.target }));
  },

  weeklyChallenges() {
    const today = UI.dateKey();
    const weekStart = UI.startOfWeek(today);
    const tasksWeek = Tasks.all().filter((t) => t.done && t.completedAt && UI.dateKey(new Date(t.completedAt)) >= weekStart).length;
    const pool = [
      { id: "study5h", title: "Study 5 hours this week", value: Math.floor(Study.secondsBetween(weekStart, today) / 60), target: 300, unit: "min", show: Study.subjects().length > 0 },
      { id: "tasks15", title: "Finish 15 tasks this week", value: tasksWeek, target: 15, show: true },
      { id: "checkins20", title: "20 habit check-ins this week", value: Habits.all().reduce((n, h) => n + Habits.countBetween(h, weekStart, today), 0), target: 20, show: Habits.all().length > 0 },
      { id: "goal", title: "Complete a goal this week", value: Goals.all().filter((g) => g.status === "completed" && g.completedAt && UI.dateKey(new Date(g.completedAt)) >= weekStart).length, target: 1, show: Goals.all().length > 0 },
      { id: "streak7", title: "Reach a 7-day habit streak", value: Math.max(0, ...Habits.all().filter((h) => !Habits.isWeekly(h)).map((h) => Habits.countStreak(h))), target: 7, show: Habits.all().length > 0 },
    ].filter((c) => c.show);
    return this.pick(pool, 2, `week-${weekStart}`).map((c) => ({ ...c, value: Math.min(c.value, c.target), done: c.value >= c.target }));
  },

  // ---------- Celebrations ----------
  // Compare with what was last seen; celebrate only NEW levels and achievements.
  checkProgress() {
    if (!this.enabled()) return;
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      Shell.renderProfile(); // keep the sidebar level line up to date
      const { level, title } = this.state();
      const unlocked = this.list().filter((a) => a.done).map((a) => a.id);
      const seen = Store.get("gamification");
      if (!seen) { Store.set("gamification", { level, achievements: unlocked }); return; } // first time: no party for old progress
      const fresh = unlocked.filter((id) => !seen.achievements.includes(id));
      if (level === seen.level && !fresh.length) return;
      Store.set("gamification", { level: Math.max(level, seen.level), achievements: [...new Set([...seen.achievements, ...unlocked])] });
      if (Store.get("settings").celebrations === false) return;
      if (level > seen.level) { UI.confetti(); UI.toast(`Level up! You're now level ${level} · ${title}`, { duration: 6000 }); }
      fresh.forEach((id) => {
        const a = this.list().find((x) => x.id === id);
        if (a) UI.toast(`Achievement unlocked: ${a.title}`, { type: "info", duration: 6000 });
      });
      Shell.renderProfile();
    }, 400);
  },

  // ---------- Pieces of HTML ----------
  challengeHtml(c) {
    const pct = Math.round((Math.min(c.value, c.target) / c.target) * 100);
    return `
      <li class="challenge${c.done ? " done" : ""}">
        <span class="challenge-check">${icon(c.done ? "circle-check" : "circle")}</span>
        <span class="challenge-main">
          <span class="challenge-top"><strong>${UI.escape(c.title)}</strong><span>${Math.min(c.value, c.target)}/${c.target}${c.unit ? " " + c.unit : ""}</span></span>
          <span class="progress-track thin"><span class="progress-bar${c.done ? " complete" : ""}" style="width:${pct}%"></span></span>
        </span>
      </li>`;
  },

  offHtml() {
    return `${UI.emptyState("trophy", "Achievements are switched off", "Turn them on in Settings → Achievements if you'd like XP, levels and challenges.")}
      <div class="center"><button class="btn btn-secondary" type="button" data-enable-gamification>${icon("zap")}Turn on</button></div>`;
  },

  // ---------- Page ----------
  renderPage(container) {
    if (!this.enabled()) {
      container.innerHTML = `<section class="card">${this.offHtml()}</section>`;
      container.querySelector("[data-enable-gamification]").addEventListener("click", () => {
        Store.setSetting("gamification", true);
        Shell.renderProfile();
        Router.refresh();
      });
      return;
    }
    const s = this.state();
    const achievements = this.list();
    const unlocked = achievements.filter((a) => a.done).length;
    const sources = ["Tasks", "Habits", "Streak bonuses", "Study", "Goals", "Projects"];
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Achievements</h2><p>XP comes only from real work you've saved. Challenges are just for fun.</p></div>
      </div>
      <div class="achievements-top">
        <section class="card level-card">
          <div class="level-badge"><span>Level</span><strong>${s.level}</strong></div>
          <div class="level-main">
            <h3>${UI.escape(s.title)}</h3>
            <div class="daily-progress-info"><span>${s.into} / ${s.needed} XP to level ${s.level + 1}</span><strong>${s.xp} XP total</strong></div>
            <div class="progress-track"><div class="progress-bar" style="width:${s.percent}%"></div></div>
            <p class="muted small">${s.today} XP today · ${s.week} XP this week</p>
          </div>
        </section>
        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon amber">${icon("zap")}</span>Where your XP comes from</h3></div>
          ${s.xp ? Charts.hbars(sources.map((src, i) => ({ label: src, value: s.bySource[src] || 0, color: ["var(--emerald)", "var(--amber)", "var(--rose)", "var(--accent)", "var(--violet)", "var(--sky)"][i], valueText: `${s.bySource[src] || 0} XP` })))
            : `<div class="chart-empty">Finish a task, tick a habit or study to earn your first XP</div>`}
          <p class="muted small xp-rules">Task ${this.XP.task} (+${this.XP.highPriority} high priority) · habit check-in ${this.XP.habit} · 5 min of study ${this.XP.studyPer5Min} · goal ${this.XP.goal} · milestone ${this.XP.milestone} · project ${this.XP.project} · 7/30-day streak ${this.XP.streak7}/${this.XP.streak30}</p>
        </section>
      </div>
      <div class="study-grid">
        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon">${icon("sparkles")}</span>Today's challenges</h3><span class="muted small">New ones tomorrow</span></div>
          <ul class="challenge-list">${this.dailyChallenges().map((c) => this.challengeHtml(c)).join("")}</ul>
        </section>
        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon violet">${icon("calendar-range")}</span>This week's challenges</h3><span class="muted small">New ones on Monday</span></div>
          <ul class="challenge-list">${this.weeklyChallenges().map((c) => this.challengeHtml(c)).join("")}</ul>
        </section>
      </div>
      <section class="card achievements-card">
        <div class="card-header"><h3 class="card-title"><span class="card-icon amber">${icon("trophy")}</span>Achievements</h3><span class="badge accent">${unlocked} / ${achievements.length} unlocked</span></div>
        <ul class="achievement-grid">
          ${achievements.map((a) => `
            <li class="achievement${a.done ? " unlocked" : ""}" data-achievement="${a.id}">
              <span class="achievement-icon">${icon(a.done ? a.icon : "lock")}</span>
              <span class="achievement-text">
                <strong>${UI.escape(a.title)}</strong>
                <span>${UI.escape(a.desc)}</span>
                ${a.done
                  ? `<small>${a.date ? `Unlocked ${UI.escape(UI.formatDay(a.date, { day: "numeric", month: "short", year: "numeric" }))}` : "Unlocked"}</small>`
                  : `<span class="progress-track thin"><span class="progress-bar" style="width:${Math.round((a.value / a.target) * 100)}%"></span></span><small>${a.value} / ${a.target}</small>`}
              </span>
            </li>`).join("")}
        </ul>
      </section>`;
  },

  // ---------- Dashboard widget ----------
  renderWidget(container) {
    if (!this.enabled()) {
      container.innerHTML = `<div class="card-header"><h3 class="card-title"><span class="card-icon amber">${icon("trophy")}</span>Challenges</h3></div>${this.offHtml()}`;
      container.querySelector("[data-enable-gamification]").addEventListener("click", () => { Store.setSetting("gamification", true); Shell.renderProfile(); Router.refresh(); });
      return;
    }
    const s = this.state();
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon amber">${icon("trophy")}</span>Level ${s.level} · ${UI.escape(s.title)}</h3>
        <a class="card-link" href="#/achievements">All ${icon("chevron-right")}</a>
      </div>
      <div class="daily-progress-info"><span>${s.into} / ${s.needed} XP</span><strong>+${s.today} today</strong></div>
      <div class="progress-track"><div class="progress-bar" style="width:${s.percent}%"></div></div>
      <ul class="challenge-list compact">${this.dailyChallenges().map((c) => this.challengeHtml(c)).join("")}</ul>`;
  },

  // Small level line under the name in the sidebar
  profileHtml() {
    if (!this.enabled()) return "";
    const s = this.state();
    return `<span class="profile-level"><span>Lv ${s.level} · ${UI.escape(s.title)}</span><span class="profile-xp"><span style="width:${s.percent}%"></span></span></span>`;
  },
};

// ---------------------------------------------------------
// Register the Achievements module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "achievements",
  order: 94,
  nav: { label: "Achievements", icon: "trophy" },
  page: (container) => Achievements.renderPage(container),
  collections: {
    // What has already been celebrated: { level, achievements: [ids] }. Not in backups.
    gamification: { default: null },
  },
  widgets: [{ id: "challenges", label: "Level & challenges", span: 4, order: 68, render: (el) => Achievements.renderWidget(el) }],
  commands: [
    { label: "Turn achievements on or off", icon: "trophy", keywords: "gamification xp level achievements toggle", run: () => {
      Store.setSetting("gamification", !Achievements.enabled());
      Shell.renderProfile();
      UI.toast(`Achievements ${Achievements.enabled() ? "on" : "off"}`, { type: "info" });
      if (["achievements", "dashboard"].includes(Router.currentId())) Router.refresh();
    } },
  ],
});
