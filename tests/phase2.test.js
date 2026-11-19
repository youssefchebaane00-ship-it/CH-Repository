// Automated test for PersonalDashboard Phase 2 (runs inside a copy of the app)
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
  const today = UI.dateKey(), yesterday = UI.addDays(today, -1);
  const noHScroll = (where) => { if (document.documentElement.scrollWidth > window.innerWidth + 1) ok(`no horizontal scroll on ${where}`, false, document.documentElement.scrollWidth + "px"); };

  try {
    await wait(300);
    out.push(`VIEWPORT ${innerWidth}x${innerHeight}, reduced motion: ${UI.reduceMotion.matches}`);

    // ---------- Migration + normalization ----------
    const t0 = Tasks.all();
    ok("v1 tasks migrated", t0.length === 2 && t0[0].title === "Old task A");
    ok("old tasks get defaults (medium/other/no date/tags)", t0.every((t) => t.priority === "medium" && t.category === "other" && t.dueDate === null && Array.isArray(t.tags)));
    ok("old habits become daily with history", Habits.all().length === 2 && Habits.all()[0].frequency === "daily" && Habits.all()[0].doneDays.length === 7);
    ok("quick note kept", Store.get("quickNote") === "my old note text");
    ok("events + notes start empty", Calendar.all().length === 0 && Notes.all().length === 0);

    // ---------- Dashboard ----------
    ok("dashboard: upcoming widget present", !!$("[data-upcoming] .card-title"));
    ok("dashboard: upcoming empty state", !!$("[data-upcoming] .empty-state"));
    ok("dashboard: today's tasks shows undated open task", $$("[data-tasks] .item").length === 1);
    ok("sidebar: calendar no longer 'Soon'", !$('[data-nav="calendar"] .nav-badge'));
    ok("habit streak 7 days shown", /7 days/.test($("[data-habits] .streak").textContent));
    const dashForm = $("[data-tasks] [data-add-form]");
    dashForm.querySelector("input").value = "Dash task";
    submit(dashForm); await wait(50);
    ok("dashboard quick task gets today's date", Tasks.all().find((t) => t.title === "Dash task")?.dueDate === today);
    noHScroll("dashboard");

    // ---------- Tasks page ----------
    await go("tasks");
    ok("tasks page: 5 filter tabs", $$("[data-filters] button").length === 5);
    $("[data-new]").click(); await wait(50);
    ok("task editor opens with fields", !!$(".modal [name=priority]") && !!$(".modal [name=dueDate]") && !!$(".modal [name=category]"));
    await modalSubmit({ title: "", description: "" });
    ok("task editor requires title", !!$(".modal") && /required/.test($(".field-error").textContent));
    await modalSubmit({ title: "Math homework", description: "Chapter 3 exercises", priority: "high", category: "university", dueDate: yesterday, tags: "Exam, math, exam" });
    const hw = Tasks.all().find((t) => t.title === "Math homework");
    ok("task saved with all fields", hw && hw.priority === "high" && hw.category === "university" && hw.dueDate === yesterday && hw.description === "Chapter 3 exercises");
    ok("tags cleaned (lowercase, no duplicates)", hw && JSON.stringify(hw.tags) === '["exam","math"]', hw && JSON.stringify(hw.tags));
    const hwRow = $(`[data-id="${hw.id}"]`);
    ok("row shows priority + overdue badges", hwRow && !!$(".priority-high", hwRow) && !!$(".badge.overdue", hwRow));
    ok("overdue row marked", hwRow?.classList.contains("is-overdue"));
    ok("overdue tab count = 1", $('[data-filter="overdue"] .count').textContent === "1");
    ok("summary text", /of \d+ tasks completed/.test($("[data-summary-title]").textContent) && /overdue/.test($("[data-summary-sub]").textContent));

    $('[data-filter="overdue"]').click(); await wait(20);
    ok("overdue filter shows only overdue", $$("[data-list] .item").length === 1);
    $('[data-filter="today"]').click(); await wait(20);
    ok("today filter shows dash task", $$("[data-list] .item").length === 1 && /Dash task/.test($("[data-list]").textContent));
    $('[data-filter="all"]').click(); await wait(20);
    $("[data-sort]").value = "priority"; $("[data-sort]").dispatchEvent(new Event("change")); await wait(20);
    ok("priority sort puts high first", /Math homework/.test($$("[data-list] .item")[0].textContent));
    $("[data-category]").value = "university"; $("[data-category]").dispatchEvent(new Event("change")); await wait(20);
    ok("category filter", $$("[data-list] .item").length === 1);
    $("[data-category]").value = "all"; $("[data-category]").dispatchEvent(new Event("change")); await wait(20);

    // Edit by clicking the task
    $(`[data-id="${hw.id}"] .item-main`).click(); await wait(50);
    ok("click opens edit dialog prefilled", $(".modal [name=title]")?.value === "Math homework" && !!$(".modal [data-delete]"));
    await modalSubmit({ title: "Math homework v2", dueDate: today });
    ok("edit saved", Tasks.all().find((t) => t.id === hw.id).title === "Math homework v2" && Tasks.all().find((t) => t.id === hw.id).dueDate === today);
    ok("no longer overdue after edit", $('[data-filter="overdue"] .count').textContent === "0");

    // Complete + completed tab
    const cb = $(`[data-id="${hw.id}"] input[type=checkbox]`);
    cb.checked = true; cb.dispatchEvent(new Event("change")); await wait(20);
    ok("completed tab count", $('[data-filter="completed"] .count').textContent === "2"); // Old task B + this
    // Delete from the editor + undo
    $(`[data-id="${hw.id}"] [data-edit]`).click(); await wait(50);
    $(".modal [data-delete]").click(); await wait(100);
    ok("delete from editor", !Tasks.all().some((t) => t.id === hw.id));
    $(".toast-action").click(); await wait(150);
    ok("undo brings it back", Tasks.all().some((t) => t.id === hw.id));
    noHScroll("tasks");

    // ---------- Calendar ----------
    await go("calendar");
    ok("month grid has 42 days", $$(".cal-cell").length === 42);
    ok("today highlighted", !!$(`.cal-cell.today[data-day="${today}"]`));
    ok("task due today shows in calendar", $$(`[data-day="${today}"] [data-task]`).length >= 1);
    $("[data-new]").click(); await wait(50);
    await modalSubmit({ title: "Physics exam", type: "exam", date: today, startTime: "23:30", endTime: "23:00" });
    ok("end before start is rejected (dialog reopens)", !!$(".modal") && Calendar.all().length === 0 && $(".modal [name=title]").value === "Physics exam");
    await modalSubmit({ startTime: "", endTime: "" });
    const ev = Calendar.all()[0];
    ok("event saved", ev && ev.title === "Physics exam" && ev.type === "exam" && ev.date === today);
    ok("event chip on its day", !!$(`[data-day="${today}"] [data-event="${ev?.id}"]`));
    ok("agenda lists event", !!$(`.agenda-list [data-event="${ev?.id}"]`));
    $(`.agenda-list [data-event="${ev.id}"]`).click(); await wait(50);
    await modalSubmit({ title: "Physics final exam", description: "Room B12" });
    ok("event edited", Calendar.all()[0].title === "Physics final exam");
    $('[data-views] [data-value="week"]').click(); await wait(30);
    ok("week view shows 7 days", $$(".cal-week-day").length === 7);
    const title1 = $("[data-title]").textContent;
    $("[data-next]").click(); await wait(30);
    ok("next week changes title", $("[data-title]").textContent !== title1);
    $("[data-today]").click(); await wait(30);
    $('[data-views] [data-value="month"]').click(); await wait(30);
    const otherDay = $$(".cal-cell")[10].dataset.day;
    $$(".cal-cell")[10].click(); await wait(30);
    ok("clicking a day selects it", $(`.cal-cell.selected`)?.dataset.day === otherDay);
    noHScroll("calendar");

    // ---------- Notifications ----------
    const badge = $("#notifications-button .bell-count");
    ok("bell shows urgent count", !!badge && Number(badge.textContent) >= 2, badge?.textContent);
    $("#notifications-button").click(); await wait(30);
    ok("panel lists event + habits", /Physics final exam/.test($("#notifications-panel").textContent) && /habit/.test($("#notifications-panel").textContent));
    const habitItem = $$("#notifications-panel [data-index]").find((b) => /habit/.test(b.textContent));
    habitItem.click(); await wait(200);
    ok("notification navigates", location.hash === "#/habits");

    // ---------- Habits page ----------
    ok("habit stats cards", $$("[data-stats] .stat-card").length === 4);
    ok("longest streak card = 7 days", /7 days/.test($("[data-stats]").textContent));
    ok("overall heatmap has 182 cells", $$("[data-heatmap] .heatmap .hm").length === 182);
    ok("detail panel with mini stats", $$("[data-detail] .mini-stat").length === 6);
    $("[data-new]").click(); await wait(50);
    await modalSubmit({ name: "Gym", frequency: "weekly", weeklyTarget: "9" });
    ok("weekly target validated (1-7)", !!$(".modal"));
    await modalSubmit({ weeklyTarget: "2" });
    const gym = Habits.all().find((h) => h.name === "Gym");
    ok("weekly habit saved", gym && gym.frequency === "weekly" && gym.weeklyTarget === 2);
    ok("weekly habit selected in detail", /Gym/.test($("[data-detail] .card-title").textContent));
    const gcb = $(`[data-id="${gym.id}"] input[type=checkbox]`);
    gcb.checked = true; gcb.dispatchEvent(new Event("change")); await wait(30);
    ok("weekly meta updates (1/2 this week)", /1\/2 this week/.test($(`[data-id="${gym.id}"] [data-meta]`).textContent));
    // Simulate target met earlier this week → counts as done for today
    const weekStart = UI.startOfWeek(today);
    const fakeDays = [today, weekStart === today ? UI.addDays(today, -7) : weekStart];
    Habits.update(gym.id, { doneDays: fakeDays });
    ok("weekly streak logic", Habits.countStreak(Habits.all().find((h) => h.id === gym.id)) >= (weekStart === today ? 0 : 1));
    const read = Habits.all()[0];
    ok("daily current/longest streak", Habits.countStreak(read) === 7 && Habits.longestStreak(read) === 7);
    ok("30-day completion rate is real", Habits.completionRate(read) !== null);
    noHScroll("habits");

    // ---------- Notes ----------
    await go("notes");
    ok("notes empty state", !!$("[data-list] .empty-state"));
    $("[data-new]").click(); await wait(50);
    ok("new note opens editor", !!$('.note-editor [data-field="title"]'));
    const titleInput = $('.note-editor [data-field="title"]');
    titleInput.value = "Lecture notes"; titleInput.dispatchEvent(new Event("input"));
    const body = $('.note-editor [data-field="content"]');
    body.value = "Thermodynamics first law"; body.dispatchEvent(new Event("input"));
    const tags = $('.note-editor [data-field="tags"]');
    tags.value = "physics, week1"; tags.dispatchEvent(new Event("input"));
    await wait(700);
    const note = Notes.all()[0];
    ok("note autosaved", note && note.title === "Lecture notes" && note.content === "Thermodynamics first law" && note.tags.join() === "physics,week1");
    ok("list shows note", /Lecture notes/.test($("[data-list]").textContent));
    $("[data-pin]").click(); await wait(50);
    ok("pin works", Notes.all()[0].pinned === true && !!$(".pin-mark"));
    Notes.create({ title: "Shopping list", content: "milk" });
    $("[data-query]").value = "thermo"; $("[data-query]").dispatchEvent(new Event("input")); await wait(20);
    ok("note search filters", $$(".note-row").length === 1);
    $("[data-query]").value = ""; $("[data-query]").dispatchEvent(new Event("input")); await wait(20);
    ok("pinned first", /Lecture notes/.test($$(".note-row")[0].textContent));
    noHScroll("notes");

    // ---------- Global search ----------
    const si = $("#search-input");
    si.value = "physics"; si.dispatchEvent(new Event("input"));
    const groups = $$("#search-results .search-group").map((g) => g.textContent);
    ok("search finds events and notes", groups.includes("Events") && groups.includes("Notes"), groups.join(","));
    $$("#search-results .menu-item").find((b) => b.dataset.page === "calendar").click(); await wait(200);
    ok("event result opens calendar on that day", location.hash === "#/calendar" && $(".cal-cell.selected")?.dataset.day === today);

    // ---------- Quick add ----------
    $("#quick-add-button").click();
    ok("quick add has 8 actions", $$("#quick-add-menu [data-action]").length === 8);
    $('[data-action="event"]').click(); await wait(50);
    await modalSubmit({ title: "Dentist", type: "personal", date: UI.addDays(today, 1), startTime: "10:00", endTime: "11:00" });
    ok("quick add event", Calendar.all().some((e) => e.title === "Dentist"));
    $("#quick-add-button").click();
    $('[data-action="note"]').click(); await wait(250);
    ok("quick add note opens notes editor", location.hash.startsWith("#/notes") && !!$(".note-editor [data-field=title]"));

    // ---------- Dashboard again ----------
    await go("dashboard");
    ok("upcoming shows events", $$("[data-upcoming] .upcoming-item").length >= 1);
    const qn = $("[data-note-input]");
    qn.value = "Idea: build a robot\nwith arduino";
    $("[data-save-note]").click(); await wait(50);
    ok("quick note → saved as note", Notes.all().some((n) => n.title === "Idea: build a robot") && Store.get("quickNote") === "");
    ok("recent notes list", $$(".recent-notes li").length >= 1);

    // ---------- Persistence ----------
    const stored = JSON.parse(localStorage.getItem("pd.events"));
    ok("events persisted", stored.length === Calendar.all().length);
    ok("notes persisted", JSON.parse(localStorage.getItem("pd.notes")).length === Notes.all().length);
    ok("backup includes events + notes", "events" in Store.exportAll().data && "notes" in Store.exportAll().data);
  } catch (e) {
    out.push("CRASH  " + e.message + "\n" + e.stack);
  }

  out.push("JS ERRORS: " + (window.__errors.length ? window.__errors.join(" | ") : "none"));
  const pre = document.createElement("pre");
  pre.id = "test-output";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
})();
