// Automated test for Stage B: projects + Kanban, planner, insights
(async () => {
  const out = [];
  const ok = (name, cond, extra = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  (" + extra + ")" : ""}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const go = async (id) => { location.hash = "/" + id; await wait(150); };
  const submit = (form) => form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  const fill = (values) => { const f = $(".modal form"); for (const [k, v] of Object.entries(values)) f.elements[k].value = v; return f; };
  const modalSubmit = async (values) => { submit(fill(values)); await wait(150); };
  const iso = (dateKey, h = 12) => new Date(UI.parseKey(dateKey).setHours(h)).toISOString();
  const today = UI.dateKey(), tomorrow = UI.addDays(today, 1), yesterday = UI.addDays(today, -1);
  const drop = (target, text, clientY = 0) => {
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    target.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true, clientY }));
    target.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientY }));
  };
  const noHScroll = (where) => { if (document.documentElement.scrollWidth > window.innerWidth + 1) ok(`no horizontal scroll on ${where}`, false, document.documentElement.scrollWidth + "px"); };

  try {
    await wait(300);
    out.push(`VIEWPORT ${innerWidth}x${innerHeight}, reduced motion: ${UI.reduceMotion.matches}`);

    // ---------- Insights with too little data ----------
    ok("insights: nothing claimed without enough data", Insights.collect().every((i) => i.id === "streak-risk"), Insights.collect().map((i) => i.id).join(","));

    // ================= PROJECTS =================
    await go("projects");
    ok("projects page + empty state", $("#page-title").textContent === "Projects" && !!$("[data-grid] .empty-state"));
    ok("old tasks get project fields", Tasks.all().every((t) => t.projectId === null && Array.isArray(t.blockedBy) && ["todo", "done"].includes(t.status)));
    $("[data-new]").click(); await wait(50);
    await modalSubmit({ name: "Robot arm", description: "Final year project", deadline: yesterday });
    const p = Projects.all()[0];
    ok("project created + detail opens", p && p.name === "Robot arm" && /Robot arm/.test($(".project-header h2").textContent));
    ok("board has 3 columns", $$(".kanban-column").length === 3);

    // Add tasks on the board
    const addOnBoard = async (title) => { const f = $("[data-add-form]"); f.querySelector("input").value = title; submit(f); await wait(30); };
    await addOnBoard("Design the gripper");
    await addOnBoard("Order servo motors");
    const t1 = Tasks.all().find((t) => t.title === "Design the gripper");
    const t2 = Tasks.all().find((t) => t.title === "Order servo motors");
    ok("board quick add puts task in project + To do", t1.projectId === p.id && t1.status === "todo" && $$('[data-drop="todo"] .kanban-card').length === 2);
    ok("project tasks also on the Tasks page data", Tasks.all().filter((t) => t.projectId === p.id).length === 2);

    // Move with arrows
    $(`[data-task="${t1.id}"] [data-move="doing"]`).click(); await wait(30);
    ok("arrow → Doing", Tasks.all().find((t) => t.id === t1.id).status === "doing" && !!$(`[data-drop="doing"] [data-task="${t1.id}"]`));
    $(`[data-task="${t1.id}"] [data-move="done"]`).click(); await wait(30);
    const t1done = Tasks.all().find((t) => t.id === t1.id);
    ok("moving to Done completes the task", t1done.done && !!t1done.completedAt && t1done.status === "done");
    ok("progress updates (1 of 2 = 50%)", /50%/.test($(".project-percent").textContent));
    $(`[data-task="${t1.id}"] [data-move="doing"]`).click(); await wait(30);
    ok("leaving Done reopens the task", !Tasks.all().find((t) => t.id === t1.id).done && Tasks.all().find((t) => t.id === t1.id).status === "doing");

    // Drag and drop
    drop($('[data-drop="done"]'), t2.id); await wait(30);
    ok("drag & drop to Done", Tasks.all().find((t) => t.id === t2.id).done === true);
    drop($('[data-drop="todo"]'), t2.id); await wait(30);
    ok("drag & drop back to To do", Tasks.all().find((t) => t.id === t2.id).done === false && Tasks.all().find((t) => t.id === t2.id).status === "todo");

    // Dependencies + loop prevention
    $(`[data-task="${t2.id}"] [data-edit-task]`).click(); await wait(50);
    ok("task editor has project, estimate and 'waits for'", !!$(".modal [name=projectId]") && !!$(".modal [name=estimateMinutes]") && !!$(".modal [name=blockedBy]"));
    await modalSubmit({ blockedBy: t1.id, estimateMinutes: "3" });
    ok("estimate validated (min 5)", !!$(".modal"));
    await modalSubmit({ estimateMinutes: "90" });
    const t2b = Tasks.all().find((t) => t.id === t2.id);
    ok("dependency + estimate saved", t2b.blockedBy[0] === t1.id && t2b.estimateMinutes === 90);
    ok("blocked badge shown", /Waits for: Design the gripper/.test($(`[data-task="${t2.id}"]`).textContent) && /1h 30m/.test($(`[data-task="${t2.id}"]`).textContent));
    ok("loop detected", Tasks.createsCycle(t1.id, t2.id) === true);
    $(`[data-task="${t1.id}"] [data-edit-task]`).click(); await wait(50);
    ok("editor won't offer a loop", ![...$(".modal [name=blockedBy]").options].some((o) => o.value === t2.id));
    $(".modal [data-cancel]").click(); await wait(30);
    Tasks.setDone(t1.id, true);
    ok("finishing the blocker unblocks", !Tasks.isBlocked(Tasks.all().find((t) => t.id === t2.id)));
    Tasks.setDone(t1.id, false);

    // Milestones
    $('[data-tab="milestones"]').click(); await wait(30);
    const mf = $("[data-milestone-form]");
    mf.elements.title.value = "Prototype ready"; mf.elements.dueDate.value = yesterday; submit(mf); await wait(30);
    ok("milestone added", Projects.get(p.id).milestones.length === 1 && /Prototype ready/.test($("[data-tab-body]").textContent));
    ok("overdue milestone + project in the bell", Notifications.collect().some((n) => n.text === "Prototype ready") && Notifications.collect().some((n) => n.text === "Robot arm" && /deadline passed/.test(n.sub)));
    const mbox = $("[data-milestone] input[type=checkbox]"); mbox.checked = true; mbox.dispatchEvent(new Event("change", { bubbles: true })); await wait(30);
    ok("milestone reached", Projects.get(p.id).milestones[0].done === true && /1\/1 milestones/.test($("[data-summary]").textContent));

    // Resources
    $('[data-tab="resources"]').click(); await wait(30);
    const rf = $("[data-resource-form]");
    rf.elements.title.value = "Bad"; rf.elements.url.value = "javascript:alert(1)"; submit(rf); await wait(30);
    ok("unsafe resource link rejected", Projects.get(p.id).resources.length === 0);
    rf.elements.title.value = "Repo"; rf.elements.url.value = "github.com/me/robot"; submit(rf); await wait(30);
    ok("resource added with https", Projects.get(p.id).resources[0]?.url === "https://github.com/me/robot");

    // Project notes
    $('[data-tab="notes"]').click(); await wait(30);
    $("[data-new-note]").click(); await wait(250);
    const pnote = Notes.all().find((n) => n.projectId === p.id);
    ok("project note created + opened", !!pnote && location.hash.startsWith("#/notes") && $('.note-editor [data-field="projectId"]').value === p.id);

    // Search + list
    const si = $("#search-input");
    si.value = "robot"; si.dispatchEvent(new Event("input"));
    ok("search finds the project", $$("#search-results .search-group").some((g) => g.textContent === "Projects"));
    $$("#search-results .menu-item").find((b) => b.dataset.page === "projects").click(); await wait(250);
    ok("search opens the project board", /Robot arm/.test($(".project-header h2")?.textContent || "") && $('[data-tab="board"]').getAttribute("aria-selected") === "true");
    $("[data-back]").click(); await wait(150);
    ok("project card with progress + overdue", $$(".project-card").length === 1 && $(".project-card").classList.contains("is-overdue"));
    noHScroll("projects");

    // Delete keeps tasks and notes
    Projects.state.selectedId = p.id; Router.refresh(); await wait(100);
    $("[data-edit-project]").click(); await wait(50);
    $(".modal [data-delete]").click(); await wait(80);
    ok("delete explains tasks/notes are kept", /2 tasks and 1 note are kept/.test($(".modal-message").textContent), $(".modal-message")?.textContent);
    $(".modal [data-ok]").click(); await wait(150);
    ok("project deleted, tasks/notes kept without project", !Projects.get(p.id) && Tasks.all().some((t) => t.id === t1.id && t.projectId === null) && Notes.all().some((n) => n.id === pnote.id && n.projectId === null));

    // ================= PLANNER =================
    Store.set("settings", { ...Store.get("settings"), plannerDayStart: "08:00", plannerDayEnd: "20:00" });
    Store.set("timeBlocks", []);
    Store.set("events", [{ id: "ev1", title: "Lab session", type: "exam", date: tomorrow, startTime: "10:00", endTime: "11:00" }]);
    Store.set("tasks", [
      { id: "pa", title: "Overdue report", priority: "low", dueDate: yesterday, estimateMinutes: 120, createdAt: iso(yesterday) },
      { id: "pb", title: "Due tomorrow essay", priority: "medium", dueDate: tomorrow, estimateMinutes: 90, createdAt: iso(today) },
      { id: "pc", title: "High priority no date", priority: "high", dueDate: null, createdAt: iso(today) },
      { id: "pd", title: "Huge task", priority: "low", dueDate: null, estimateMinutes: 780, createdAt: iso(today) },
      { id: "pe", title: "Waiting task", priority: "high", dueDate: null, blockedBy: ["pc"], createdAt: iso(today) },
      { id: "pf", title: "Finished one", done: true, completedAt: iso(today), createdAt: iso(today) },
    ]);
    Planner.state.date = tomorrow; Planner.state.suggestion = null;
    await go("planner");
    ok("planner page renders", $("#page-title").textContent === "Planner" && $$(".week-day-pill").length === 7);
    ok("candidates: open, overdue first, then by due date", $$("[data-candidates] [data-task]").map((r) => r.dataset.task).slice(0, 2).join(",") === "pa,pb");
    ok("overdue task offers 'move due date to today'", !!$('[data-task="pa"] [data-due-today]'));
    ok("event drawn on the grid", !!$('[data-event="ev1"]'));

    // Suggest a plan
    $("[data-suggest]").click(); await wait(50);
    const s = Planner.state.suggestion;
    const placed = s.placed.map((x) => `${x.task.id}@${Planner.toTime(x.start)}-${Planner.toTime(x.end)}`);
    ok("suggestion order + slots avoid the event", placed.join(" ") === "pa@08:00-10:00 pb@11:00-12:30 pc@12:30-13:30", placed.join(" "));
    ok("task that can't fit is reported, not forced", s.skipped.some((k) => k.task.id === "pd" && /no free/.test(k.reason)));
    ok("blocked task is skipped with the reason", s.skipped.some((k) => k.task.id === "pe" && /waits for/.test(k.reason)));
    ok("finished tasks never suggested", !placed.some((x) => x.startsWith("pf")));
    ok("nothing saved before accepting", Planner.all().length === 0);
    ok("preview shown as ghost blocks", $$(".day-item.ghost").length === 3);
    const third = $('[data-accept="2"]'); third.checked = false; third.dispatchEvent(new Event("change", { bubbles: true })); await wait(30);
    ok("unticking removes it from the preview", $$(".day-item.ghost").length === 2);
    $("[data-accept-suggestion]").click(); await wait(50);
    ok("only accepted blocks added", Planner.blocksOn(tomorrow).map((b) => b.taskId).join(",") === "pa,pb");
    ok("planned tasks leave the to-schedule list", !$('[data-candidates] [data-task="pa"]') && !!$('[data-candidates] [data-task="pc"]'));

    // Conflicts
    Planner.addBlock({ date: tomorrow, start: "10:30", end: "11:30", title: "Gym" });
    Router.refresh(); await wait(80);
    ok("conflicts detected (Gym vs Lab, Gym vs essay)", Planner.conflicts(tomorrow).length === 2 && !!$(".conflict-banner") && $$(".day-item.clash").length === 3);
    ok("week strip shows the conflict", !!$(`.week-day-pill[data-day="${tomorrow}"] .clash`));
    const gym = Planner.blocksOn(tomorrow).find((b) => b.title === "Gym");

    // Edit / move / complete
    $(`[data-block="${gym.id}"] [data-edit-block]`).click(); await wait(50);
    await modalSubmit({ start: "23:30", minutes: "60" });
    ok("block past midnight rejected", Planner.all().find((b) => b.id === gym.id).start === "10:30");
    $(`[data-block="${gym.id}"] [data-edit-block]`).click(); await wait(50);
    await modalSubmit({ start: "18:00", minutes: "60" });
    ok("block moved; conflict gone", Planner.all().find((b) => b.id === gym.id).start === "18:00" && Planner.conflicts(tomorrow).length === 0);
    $(`[data-block="${gym.id}"] [data-tomorrow]`).click(); await wait(50);
    ok("move to next day", Planner.all().find((b) => b.id === gym.id).date === UI.addDays(tomorrow, 1));
    const essay = Planner.blocksOn(tomorrow).find((b) => b.taskId === "pb");
    $(`[data-block="${essay.id}"] [data-complete]`).click(); await wait(50);
    ok("done button completes the task", Tasks.all().find((t) => t.id === "pb").done === true);

    // Drag a task onto the grid at 15:00
    const inner = $(".day-grid-inner");
    const first = Number(inner.dataset.first);
    const y = inner.getBoundingClientRect().top + ((15 * 60 - first) / 60) * Planner.HOUR_PX + 3;
    const candidateRow = $('[data-candidates] [data-task="pc"]');
    candidateRow.dispatchEvent(new DragEvent("dragstart", { dataTransfer: new DataTransfer(), bubbles: true }));
    drop($("[data-grid]"), "task:pc", y); await wait(50);
    const dropped = Planner.blocksOn(tomorrow).find((b) => b.taskId === "pc");
    ok("drag task onto the grid snaps to 15:00 for 1h", dropped && dropped.start === "15:00" && dropped.end === "16:00", dropped && `${dropped.start}-${dropped.end}`);

    // Calendar shows planned time; settings validation; quick add
    Calendar.state.selected = tomorrow; Calendar.state.cursor = tomorrow;
    await go("calendar");
    ok("calendar agenda lists planned time", /Planned time/.test($("[data-agenda]").textContent) && /Overdue report/.test($("[data-agenda]").textContent));
    await go("settings");
    const pf = $("[data-planner-form]");
    pf.elements.start.value = "18:00"; pf.elements.end.value = "09:00"; submit(pf); await wait(30);
    ok("planner hours must make sense", Store.get("settings").plannerDayStart === "08:00");
    pf.elements.start.value = "07:30"; pf.elements.end.value = "21:00"; submit(pf); await wait(30);
    ok("planner hours saved", Store.get("settings").plannerDayStart === "07:30" && Store.get("settings").plannerDayEnd === "21:00");
    ok("backup keeps valid planner hours", Store.validateBackup(JSON.stringify(Store.exportAll())).data.settings.plannerDayEnd === "21:00");
    ok("time blocks are in backups", "timeBlocks" in Store.exportAll().data);
    await go("dashboard");
    ok("dashboard: today's plan widget", /Today's plan/.test($('[data-widget="plan"]').textContent));
    ok("dashboard: projects widget", !!$('[data-widget="projects"] .card-title'));
    noHScroll("dashboard");

    // ================= INSIGHTS =================
    const weekStart = UI.startOfWeek(today);
    const daysSoFar = UI.diffDays(weekStart, today);
    const sessions = [];
    for (let i = 0; i <= daysSoFar; i++) {
      sessions.push({ id: `n${i}`, subjectId: "s1", date: UI.addDays(weekStart, i), durationSec: 3600, source: "timer" });
      sessions.push({ id: `l${i}`, subjectId: "s1", date: UI.addDays(weekStart, i - 7), durationSec: 1800, source: "timer" });
    }
    if (daysSoFar < 6) sessions.push({ id: "later", subjectId: "s1", date: UI.addDays(weekStart, daysSoFar + 1 - 7), durationSec: 36000, source: "timer" }); // must NOT count
    Store.set("subjects", [{ id: "s1", name: "Math", color: "#22d3ee" }]);
    Store.set("studySessions", sessions);
    const week = Insights.collect().find((i) => i.id === "study-week");
    ok("fair week comparison (same days only): +100%", week && /^100% more study time/.test(week.title), week?.title);

    const recent = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, title: `Recent ${i}`, createdAt: iso(UI.addDays(today, -i)), done: i < 3, completedAt: i < 3 ? iso(today, 14) : null }));
    Store.set("tasks", [...recent, { id: "late", title: "Late thing", dueDate: UI.addDays(today, -4), createdAt: iso(UI.addDays(today, -20)) }]);
    const rate = Insights.collect().find((i) => i.id === "task-rate");
    ok("task completion insight with real counts", rate && /3 are finished/.test(rate.detail) && /Of the 6 tasks/.test(rate.detail), rate?.detail);
    const overdue = Insights.collect().find((i) => i.id === "overdue");
    ok("overdue insight names the oldest", overdue && /“Late thing”, was due 4 days ago/.test(overdue.detail));

    const doneDays = (n) => Array.from({ length: n }, (_, i) => UI.addDays(today, -i));
    Store.set("habits", [
      { id: "h1", name: "Read", doneDays: doneDays(27), createdAt: iso(UI.addDays(today, -29)) },
      { id: "h2", name: "Gym", doneDays: [UI.addDays(today, -3), UI.addDays(today, -10)], createdAt: iso(UI.addDays(today, -29)) },
    ]);
    const habit = Insights.collect().find((i) => i.id === "habit-consistency");
    ok("habit insight compares real rates", habit && /“Read”/.test(habit.title) && /90% vs 7% for “Gym”/.test(habit.detail), habit?.detail);

    Store.set("goals", [{ id: "g1", title: "Submit thesis draft", status: "active", progress: 20, targetDate: UI.addDays(today, 3) }]);
    const goal = Insights.collect().find((i) => i.id === "goal-risk");
    ok("goal at risk insight", goal && /due in 3 days and 20% done/.test(goal.title));

    const day = UI.parseKey(today).getDate();
    const lastMonth = Expenses.shiftMonth(today.slice(0, 7), -1);
    Store.set("expenses", [
      { id: "e1", amount: 30, category: "food", date: today },
      { id: "e2", amount: 20, category: "food", date: `${lastMonth}-01` },
      { id: "e3", amount: 500, category: "food", date: `${lastMonth}-28` }, // after "the same day" unless the month is nearly over
    ]);
    const spend = Insights.collect().find((i) => i.id === "spending");
    if (day < 28) ok("spending compares the same days only (+50%)", spend && /^50% more spending/.test(spend.title), spend?.title);
    Store.setSetting("monthlyBudget", 40);
    const proj = Insights.collect().find((i) => i.id === "budget-projection");
    if (day >= 5) ok("budget projection is labelled as a projection", proj && /^Projection:/.test(proj.detail));
    else ok("no projection in the first days of a month", !proj);

    await go("analytics");
    ok("analytics shows observations", $$("[data-insights] .insight").length >= 4 && /Observations/.test($("[data-insights]").textContent));
    await go("dashboard");
    ok("dashboard insights widget shows max 3", $$('[data-widget="insights"] .insight').length === 3);
    ok("every insight shows numbers", Insights.collect().every((i) => /\d/.test(i.title + i.detail)));

    // ================= QUICK ADD =================
    $("#quick-add-button").click();
    ok("quick add includes project + time block", !!$('[data-action="project"]') && !!$('[data-action="block"]'));
    $('[data-action="project"]').click(); await wait(50);
    await modalSubmit({ name: "Club website" });
    ok("quick add project", Projects.all().some((x) => x.name === "Club website"));
  } catch (e) {
    out.push("CRASH  " + e.message + "\n" + e.stack);
  }

  out.push("JS ERRORS: " + (window.__errors.length ? window.__errors.join(" | ") : "none"));
  const pre = document.createElement("pre");
  pre.id = "test-output";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
})();
