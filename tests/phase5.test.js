// Automated test for PersonalDashboard Phase 5: analytics, weather forecast, settings, polish
(async () => {
  const out = [];
  const ok = (name, cond, extra = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  (" + extra + ")" : ""}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const go = async (id) => { location.hash = "/" + id; await wait(150); };
  const submit = (form) => form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  const toasts = () => $$(".toast-message").map((t) => t.textContent).join(" | ");
  const key = (k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  const today = UI.dateKey(), yesterday = UI.addDays(today, -1);
  const iso = (dateKey, h = 12) => new Date(UI.parseKey(dateKey).setHours(h)).toISOString();
  const noHScroll = (where) => { if (document.documentElement.scrollWidth > window.innerWidth + 1) ok(`no horizontal scroll on ${where}`, false, document.documentElement.scrollWidth + "px"); };

  try {
    await wait(300);
    out.push(`VIEWPORT ${innerWidth}x${innerHeight}, reduced motion: ${UI.reduceMotion.matches}`);

    // ---------- Sample data across all sections ----------
    const lastWeek = UI.addDays(today, -8);
    Store.set("tasks", [...Tasks.all(),
      { id: "a1", title: "Done today", done: true, completedAt: iso(today), createdAt: iso(today) },
      { id: "a2", title: "Done yesterday", done: true, completedAt: iso(yesterday), createdAt: iso(yesterday) },
      { id: "a3", title: "Done last week", done: true, completedAt: iso(lastWeek), createdAt: iso(lastWeek) }]);
    Store.set("subjects", [{ id: "s1", name: "Math", color: "#22d3ee", weeklyGoalHours: 5 }, { id: "s2", name: "Physics", color: "#a78bfa", weeklyGoalHours: 0 }]);
    Store.set("studySessions", [
      { id: "ss1", subjectId: "s1", date: today, durationSec: 3600, source: "timer" },
      { id: "ss2", subjectId: "s2", date: today, durationSec: 1800, source: "manual" },
      { id: "ss3", subjectId: "s1", date: lastWeek, durationSec: 2700, source: "timer" }]);
    Store.set("goals", [{ id: "go1", title: "Goal A", status: "completed", progress: 100, completedAt: iso(today), horizon: "weekly" },
                        { id: "go2", title: "Goal B", status: "active", progress: 30, horizon: "monthly" }]);
    Store.set("expenses", [{ id: "x1", amount: 20, category: "food", date: today }, { id: "x2", amount: 5.5, category: "transport", date: yesterday },
                           { id: "x3", amount: 100, category: "shopping", date: UI.addDays(today, -40) }]);

    // ---------- Navigation: no more "Soon" ----------
    ok("no 'Soon' badges left", $$(".nav-badge").length === 0);
    ok("Analytics in sidebar", !!$('[data-nav="analytics"]'));

    // ---------- Analytics ----------
    await go("analytics");
    ok("analytics page renders", $("#page-title").textContent === "Analytics" && $$("[data-summary] .stat-card").length === 5);
    $('[data-views] [data-value="weekly"]').click(); await wait(50);
    const weeks = Charts.buckets("weekly"), range = Charts.range(weeks);
    const expectTasks = Tasks.all().filter((t) => t.completedAt && UI.dateKey(new Date(t.completedAt)) >= range.from).length;
    ok("weekly: tasks completed stat = real count", $$("[data-summary] .stat-value")[0].textContent === String(expectTasks), `${$$("[data-summary] .stat-value")[0].textContent} vs ${expectTasks}`);
    ok("weekly: study time = 2h 15m", $$("[data-summary] .stat-value")[1].textContent === "2h 15m");
    ok("weekly: 12 bars in tasks chart", $$("[data-tasks] .bar-col").length === 12);
    ok("study chart stacks subject colors", $$("[data-study] .bar-col.today .bar-stack span").length === 2);
    ok("study legend", /Math/.test($("[data-study] .chart-legend").textContent) && /Physics/.test($("[data-study] .chart-legend").textContent));
    ok("study by subject percentages", /Math/.test($("[data-subjects]").textContent) && /78%/.test($("[data-subjects]").textContent), $("[data-subjects]").textContent.replace(/\s+/g, " ").slice(0, 120));
    ok("undated v1 task explained", /no completion date/.test($("[data-tasks] .chart-note")?.textContent || ""));
    ok("habit rates + streaks", /Current: 7 days/.test($("[data-habits]").textContent) && /Longest: 7 days/.test($("[data-habits]").textContent));
    ok("goals: completed overall badge", /1 of 2 completed overall/.test($("[data-goals]").textContent));
    ok("spending total for 12 weeks", /125[.,]500/.test($$("[data-summary] .stat-value")[4].textContent), $$("[data-summary] .stat-value")[4].textContent);

    $('[data-views] [data-value="daily"]').click(); await wait(50);
    ok("daily: 14 bars", $$("[data-tasks] .bar-col").length === 14);
    ok("daily: today's bar highlighted", !!$("[data-tasks] .bar-col.today"));
    ok("daily: tasks = 3 (today, yesterday, 8 days ago)", $$("[data-summary] .stat-value")[0].textContent === "3");
    ok("comparison text", /vs previous period|New this period/.test($$("[data-summary] .stat-sub")[0].textContent));

    $('[data-views] [data-value="monthly"]').click(); await wait(50);
    ok("monthly: 12 bars", $$("[data-money] .bar-col").length === 12);
    ok("monthly: 40-day-old expense in an earlier month bar", $$("[data-money] .bar-col").filter((c) => c.querySelector(".bar-stack").style.height !== "0%").length === 2);
    noHScroll("analytics");

    // ---------- Dashboard: weekly widget + widget preferences ----------
    await go("dashboard");
    ok("'This week' widget", $$('[data-widget="week"] .week-row').length === 3 && $$('[data-widget="week"] .week-cell').length === 21);
    ok("week widget study total", /1h 30m/.test($('[data-widget="week"]').textContent));

    // ---------- Weather forecast (real network) ----------
    await wait(3000);
    const days = $$('[data-widget="weather"] .forecast-day').length;
    ok("5-day forecast shown", days === 5, `${days} days; ${$('[data-widget="weather"] [data-body]').textContent.replace(/\s+/g, " ").slice(0, 80)}`);
    noHScroll("dashboard");

    // ---------- Settings: accent ----------
    await go("settings");
    $('[data-accent-choice] [data-value="violet"]').click(); await wait(30);
    ok("accent applied + saved", document.documentElement.dataset.accent === "violet" && Store.get("settings").accent === "violet");
    ok("accent changes the color", getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() === "#a78bfa");
    document.documentElement.dataset.theme = "light"; await wait(50);
    ok("light + violet uses darker shade", getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() === "#7c3aed");
    document.documentElement.dataset.theme = "dark"; await wait(50);
    $('[data-accent-choice] [data-value="cyan"]').click(); await wait(30);

    // Settings: dashboard widgets
    const weatherBox = $('[data-widget-toggles] [data-widget="weather"]');
    weatherBox.checked = false; weatherBox.dispatchEvent(new Event("change", { bubbles: true })); await wait(30);
    const statsBox = $('[data-widget-toggles] [data-widget="stats"]');
    statsBox.checked = false; statsBox.dispatchEvent(new Event("change", { bubbles: true })); await wait(30);
    await go("dashboard");
    ok("hidden widgets not on dashboard", !$('[data-widget="weather"]') && !$("[data-stats]") && !!$('[data-widget="tasks"]'));
    await go("settings");
    $('[data-widget-toggles] [data-widget="weather"]').checked = true; $('[data-widget-toggles] [data-widget="weather"]').dispatchEvent(new Event("change", { bubbles: true }));
    $('[data-widget-toggles] [data-widget="stats"]').checked = true; $('[data-widget-toggles] [data-widget="stats"]').dispatchEvent(new Event("change", { bubbles: true }));
    await wait(30);
    ok("storage usage shown", /KB used/.test($(".settings").textContent));

    // ---------- Import validation ----------
    const backup = Store.exportAll();
    const bad = (mutate) => { const copy = JSON.parse(JSON.stringify(backup)); mutate(copy); return JSON.stringify(copy); };
    const cases = [
      ["not JSON", "{oops"],
      ["wrong app", bad((b) => { b.app = "Other"; })],
      ["newer version", bad((b) => { b.version = 99; })],
      ["list not an array", bad((b) => { b.data.tasks = "nope"; })],
      ["item without id", bad((b) => { b.data.tasks.push({ title: "x" }); })],
      ["duplicate ids", bad((b) => { b.data.goals.push({ ...b.data.goals[0] }); })],
    ];
    for (const [label, text] of cases) ok(`import rejects: ${label}`, Store.validateBackup(text).ok === false, Store.validateBackup(text).error);
    const good = Store.validateBackup(JSON.stringify(backup));
    ok("valid backup accepted with summary", good.ok && good.summary.some((s) => /3 expenses/.test(s)), good.summary?.join(", "));
    const hostile = Store.validateBackup(bad((b) => { b.data.settings.theme = "<script>"; b.data.settings.pomodoroFocus = 9999; b.data.settings.evil = 1; }));
    ok("import sanitizes settings", hostile.ok && hostile.data.settings.theme === "dark" && hostile.data.settings.pomodoroFocus === 25 && !("evil" in hostile.data.settings));

    // Import through the UI: bad file → error toast, nothing changed
    const input = $("[data-import]");
    const pick = (text) => { const dt = new DataTransfer(); dt.items.add(new File([text], "backup.json", { type: "application/json" })); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); };
    const tasksBefore = Tasks.all().length;
    pick(cases[1][1]); for (let i = 0; i < 30 && !/Import cancelled/.test(toasts()); i++) await wait(100);
    ok("UI: invalid file → error, no dialog", /Import cancelled/.test(toasts()) && !$(".modal") && Tasks.all().length === tasksBefore);
    // Good file → confirm dialog listing contents; cancel keeps data
    const smaller = bad((b) => { b.data.tasks = b.data.tasks.slice(0, 1); });
    pick(smaller); for (let i = 0; i < 30 && !$(".modal"); i++) await wait(100);
    ok("UI: valid file → confirm with summary", /Replace all data/.test($(".modal h2")?.textContent || "") && /1 tasks/.test($(".modal-message")?.textContent || ""), "toasts: " + toasts() + " | modal: " + ($(".modal")?.textContent || "none").slice(0, 120));
    if (!$(".modal")) throw new Error("no import dialog");
    $(".modal [data-cancel]").click(); await wait(50);
    ok("UI: cancel keeps current data", Tasks.all().length === tasksBefore);
    // The actual replace (without the page reload)
    Store.importAll(Store.validateBackup(smaller).data);
    ok("importAll replaces data", Tasks.all().length === 1 && Expenses.all().length === 3 && Store.get("activeSession") === null);
    const roundTrip = Store.validateBackup(JSON.stringify(Store.exportAll()));
    ok("export → import round trip is valid", roundTrip.ok);

    // ---------- Keyboard shortcuts ----------
    document.body.focus();
    key("?"); await wait(50);
    ok("'?' shows shortcuts", /Keyboard shortcuts/.test($(".modal h2")?.textContent || "") && $$(".modal kbd").length > 5);
    key("Escape"); await wait(50);
    ok("Esc closes it", !$(".modal"));
    key("q"); await wait(30);
    ok("'q' opens quick add", !$("#quick-add-menu").hidden);
    key("Escape"); await wait(30);

    // ---------- Delete all (typed confirmation) ----------
    $("[data-delete-all]").click(); await wait(50);
    submit($(".modal form")); await wait(50);
    ok("delete-all needs typed DELETE", !!$(".modal") && /DELETE/.test($(".field-error").textContent));
    $(".modal [name=confirm]").value = "delete"; submit($(".modal form")); await wait(50);
    ok("lowercase not accepted", !!$(".modal"));
    $(".modal [data-cancel]").click(); await wait(50);
    ok("cancel keeps data", Tasks.all().length === 1);
    Store.clearAll();
    ok("clearAll empties data but keeps version", Store.get("tasks").length === 0 && Store.get("expenses").length === 0 && localStorage.getItem("pd.version") === "2" && localStorage.getItem("todos") === null);
  } catch (e) {
    out.push("CRASH  " + e.message + "\n" + e.stack);
  }

  out.push("JS ERRORS: " + (window.__errors.length ? window.__errors.join(" | ") : "none"));
  const pre = document.createElement("pre");
  pre.id = "test-output";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
})();
