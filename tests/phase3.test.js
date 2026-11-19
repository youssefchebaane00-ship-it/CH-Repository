// Automated test for PersonalDashboard Phase 3: Study Tracker + Pomodoro
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
  const lastToast = () => $$(".toast-message").map((t) => t.textContent).pop() || "";
  const today = UI.dateKey(), yesterday = UI.addDays(today, -1);
  const noHScroll = (where) => { if (document.documentElement.scrollWidth > window.innerWidth + 1) ok(`no horizontal scroll on ${where}`, false, document.documentElement.scrollWidth + "px"); };

  try {
    await wait(300);
    out.push(`VIEWPORT ${innerWidth}x${innerHeight}, reduced motion: ${UI.reduceMotion.matches}`);

    // ---------- Navigation + empty states ----------
    ok("sidebar: Study Tracker no longer 'Soon'", !$('[data-nav="study"] .nav-badge'));
    ok("dashboard: 5 stat cards incl. study", $$("[data-stats] .stat-card").length === 5 && /Study today/.test($("[data-stats]").textContent));
    ok("dashboard: study widget", !!$("[data-study] .card-title"));
    await go("study");
    ok("study page renders", $("#page-title").textContent === "Study Tracker");
    ok("stopwatch asks for a subject first", !!$("[data-stopwatch] [data-new-subject]"));
    ok("pomodoro card renders 25:00", $("[data-pomo-time]").textContent === "25:00");
    ok("subjects empty state", !!$("[data-subjects] .empty-state"));

    // ---------- Subjects ----------
    $(".page-header [data-new-subject]").click(); await wait(50);
    await modalSubmit({ name: "Mathematics", weeklyGoalHours: "abc" });
    ok("invalid weekly goal rejected", !!$(".modal") && Study.subjects().length === 0);
    await modalSubmit({ weeklyGoalHours: "5" });
    ok("subject saved", Study.subjects().length === 1 && Study.subjects()[0].weeklyGoalHours === 5);
    $(".page-header [data-new-subject]").click(); await wait(50);
    await modalSubmit({ name: "mathematics" });
    ok("duplicate subject name rejected", !!$(".modal"));
    await modalSubmit({ name: "Physics", color: "#a78bfa", weeklyGoalHours: "2.5" });
    const math = Study.subjects()[0], phys = Study.subjects()[1];
    ok("second subject with color + decimal goal", phys && phys.color === "#a78bfa" && phys.weeklyGoalHours === 2.5);
    ok("subjects listed with goals", $$(".subject-row").length === 2 && /5h 00m/.test($(".subject-row").textContent));

    // ---------- Stopwatch ----------
    const sw = $("[data-stopwatch]");
    $("[data-subject]", sw).value = math.id; $("[data-subject]", sw).dispatchEvent(new Event("change"));
    const desc = $("[data-description]", sw); desc.value = "Integrals"; desc.dispatchEvent(new Event("input"));
    $('[data-action="start"]', sw).click(); await wait(50);
    ok("stopwatch started", !!Study.activeSession() && Study.activeSession().subjectId === math.id && Study.activeSession().description === "Integrals");
    await wait(1100);
    ok("timer pill visible in top bar", !$("#timer-pill").hidden && /Mathematics/.test($("#timer-pill").textContent));
    ok("tab title shows running time", /^\d+:\d\d:\d\d · Study Tracker/.test(document.title), document.title);
    ok("live 'Running' badge", !!$("[data-stopwatch] .badge.live"));

    // Pomodoro focus can't run at the same time
    $('[data-pomo-controls] [data-action="start"]').click(); await wait(50);
    ok("pomodoro blocked while stopwatch runs", Pomodoro.state().status === "idle" && /counted twice/.test(lastToast()));

    $('[data-action="pause"]', sw).click(); await wait(30);
    ok("pause stops the clock", Study.activeSession().runningSince === null && Study.activeSession().accumulatedMs > 0);
    const pausedAt = Study.activeElapsedMs(); await wait(1100);
    ok("paused time doesn't grow", Study.activeElapsedMs() === pausedAt);
    $('[data-action="resume"]', sw).click(); await wait(30);
    ok("resume", !!Study.activeSession().runningSince);

    // Fake 30 minutes of studying, then check it survives a page change
    const a = Study.activeSession();
    Store.set("activeSession", { ...a, accumulatedMs: 0, runningSince: Date.now() - 30 * 60000 });
    await go("tasks"); await go("study");
    ok("timer survives page changes", Math.round(Study.activeElapsedMs() / 60000) === 30 && /^0:30:/.test($("[data-study-clock]").textContent));

    $('[data-stopwatch] [data-action="stop"]').click(); await wait(80);
    ok("stop opens save dialog with 30 min", $(".modal [name=minutes]")?.value === "30");
    await modalSubmit({ minutes: "0" });
    ok("0 minutes rejected", !!$(".modal"));
    await modalSubmit({ minutes: "30", description: "Integrals ch. 5" });
    const s1 = Study.sessions()[0];
    ok("session saved", s1 && s1.durationSec === 1800 && s1.subjectId === math.id && s1.source === "timer" && s1.date === today && s1.description === "Integrals ch. 5");
    ok("stopwatch cleared + pill hidden", Study.activeSession() === null && (Study.tick(), $("#timer-pill").hidden));

    // ---------- Stats, charts, history ----------
    await wait(100);
    ok("today stat = 30m", /Today\s*30m/.test($(".stats-grid").textContent.replace(/\s+/g, " ")));
    ok("week goal % shown", /7% of 7h 30m goal/.test($(".stats-grid").textContent), $(".stats-grid").textContent.replace(/\s+/g, " ").slice(0, 160));
    ok("7-day chart has today's bar", $(".bar-col.today .bar-stack").style.height !== "0%");
    ok("per-subject bars", $$(".hbar-list li").length === 2 && /30m/.test($(".hbar-list").textContent));
    ok("history lists the session", $$(".history-item").length === 1);

    // Manual log
    $("[data-log]").click(); await wait(50);
    await modalSubmit({ subjectId: phys.id, date: UI.addDays(today, 1), minutes: "45" });
    ok("future date rejected", !!$(".modal"));
    await modalSubmit({ date: yesterday });
    ok("manual session saved", Study.sessions().some((s) => s.subjectId === phys.id && s.durationSec === 2700 && s.date === yesterday && s.source === "manual"));
    ok("history grouped by day", $$(".history-day").length === 2);

    // Edit + delete + undo from history
    const physRow = $$(".history-item").find((r) => /Physics/.test(r.textContent));
    physRow.querySelector("[data-edit]").click(); await wait(50);
    await modalSubmit({ minutes: "60" });
    ok("session edited", Study.sessions().find((s) => s.subjectId === phys.id).durationSec === 3600);
    const before = Study.sessions().length;
    $$(".history-item").find((r) => /Physics/.test(r.textContent)).querySelector("[data-delete]").click(); await wait(400);
    ok("session deleted", Study.sessions().length === before - 1);
    $(".toast-action").click(); await wait(150);
    ok("undo restores session", Study.sessions().length === before);

    // ---------- Pomodoro ----------
    const pomo = $("[data-pomodoro]");
    $("[data-pomo-subject]", pomo).value = phys.id; $("[data-pomo-subject]", pomo).dispatchEvent(new Event("change"));
    ok("pomodoro subject saved", Pomodoro.state().subjectId === phys.id);
    $('[data-pomo-controls] [data-action="start"]').click(); await wait(1100);
    ok("pomodoro running", Pomodoro.state().status === "running");
    Store.set("pomodoro", { ...Pomodoro.state(), endsAt: Date.now() + 90000 }); Pomodoro.updateDisplays();
    ok("countdown display (90s left = 01:30)", $("[data-pomo-time]").textContent === "01:30", $("[data-pomo-time]").textContent);
    ok("pill shows pomodoro", !$("#timer-pill").hidden && /Focus/.test($("#timer-pill").textContent));
    ok("ring progresses", parseFloat($("[data-pomo-ring]").style.strokeDashoffset) > 0);
    $('[data-pomo-controls] [data-action="pause"]').click(); await wait(30);
    ok("pomodoro pause", Pomodoro.state().status === "paused" && Pomodoro.state().remainingMs > 0);
    $('[data-pomo-controls] [data-action="start"]').click(); await wait(30);
    ok("pomodoro resume", Pomodoro.state().status === "running");

    // Fake the end of the focus period
    const sessionsBefore = Study.sessions().length;
    Store.set("pomodoro", { ...Pomodoro.state(), endsAt: Date.now() - 1000 });
    Pomodoro.tick(); await wait(200);
    const logged = Study.sessions().find((s) => s.source === "pomodoro");
    ok("finished focus is logged to the subject", Study.sessions().length === sessionsBefore + 1 && logged?.subjectId === phys.id && logged?.durationSec === 1500);
    ok("switches to short break + counts", Pomodoro.state().mode === "short" && Pomodoro.state().status === "idle" && Pomodoro.state().count === 1);
    ok("completion toast", /Focus session done/.test(lastToast()));
    ok("break shows 05:00", $("[data-pomo-time]").textContent === "05:00");

    // Break ends → back to focus, nothing logged
    Pomodoro.start(); Store.set("pomodoro", { ...Pomodoro.state(), endsAt: Date.now() - 1000 }); Pomodoro.tick(); await wait(200);
    ok("break end → focus, nothing logged", Pomodoro.state().mode === "focus" && Study.sessions().length === sessionsBefore + 1);

    // Long break after the 4th focus session
    Store.set("pomodoro", { ...Pomodoro.state(), cycle: 3, subjectId: "" });
    Pomodoro.start(); Store.set("pomodoro", { ...Pomodoro.state(), endsAt: Date.now() - 1000 }); Pomodoro.tick(); await wait(200);
    ok("4th focus → long break", Pomodoro.state().mode === "long");
    ok("no subject → nothing logged", Study.sessions().length === sessionsBefore + 1);

    // Skip / reset / switch mode
    $('[data-pomo-controls] [data-action="skip"]').click(); await wait(30);
    ok("skip goes to focus", Pomodoro.state().mode === "focus");
    $('[data-mode="short"]').click(); await wait(50);
    ok("switch mode while idle", Pomodoro.state().mode === "short");
    $('[data-pomo-controls] [data-action="start"]').click(); await wait(30);
    $('[data-pomo-controls] [data-action="reset"]').click(); await wait(30);
    ok("reset", Pomodoro.state().status === "idle" && $("[data-pomo-time]").textContent === "05:00");
    let soundOk = true; try { Sound.chime(); } catch { soundOk = false; }
    ok("chime plays without errors", soundOk);

    // ---------- Settings ----------
    await go("settings");
    const pf = $("[data-pomo-form]");
    pf.elements.pomodoroFocus.value = "0"; submit(pf); await wait(30);
    ok("invalid pomodoro duration rejected", Store.get("settings").pomodoroFocus === 25);
    pf.elements.pomodoroFocus.value = "50"; submit(pf); await wait(30);
    ok("pomodoro focus saved", Store.get("settings").pomodoroFocus === 50);
    Pomodoro.switchMode("focus");
    await go("study");
    ok("new focus length used", $("[data-pomo-time]").textContent === "50:00");

    // ---------- Dashboard ----------
    await go("dashboard");
    ok("study stat card value", $('[data-stat="studyToday"]').textContent === "55m", $('[data-stat="studyToday"]').textContent);
    ok("study widget totals", /55m/.test($("[data-study] .study-summary").textContent));
    ok("study widget has quick stopwatch", !!$('[data-study] [data-action="start"]'));
    noHScroll("dashboard");

    // ---------- Search + quick add ----------
    const si = $("#search-input");
    si.value = "physi"; si.dispatchEvent(new Event("input"));
    ok("search finds subject", $$("#search-results .search-group").some((g) => g.textContent === "Subjects"));
    $$("#search-results .menu-item").find((b) => b.dataset.page === "study").click(); await wait(250);
    ok("subject result opens study page", location.hash === "#/study" && !!$(".subject-row.highlighted"));
    $("#quick-add-button").click();
    ok("quick add has study action", !!$('[data-action="study"]'));
    $('[data-action="study"]').click(); await wait(50);
    await modalSubmit({ subjectId: math.id, description: "Quick start" });
    ok("quick add starts stopwatch", Study.activeSession()?.subjectId === math.id && Study.activeSession()?.description === "Quick start");
    $("#notifications-button").click(); await wait(30);
    ok("notification shows running session", /Study session running/.test($("#notifications-panel").textContent));
    Notifications.close();
    $('[data-stopwatch] [data-action="discard"]').click(); await wait(50);
    $(".modal [data-ok]").click(); await wait(100);
    ok("discard clears session", Study.activeSession() === null);

    // ---------- Delete subject (with its sessions) ----------
    const physCount = Study.sessions().filter((s) => s.subjectId === phys.id).length;
    $$(".subject-row").find((r) => /Physics/.test(r.textContent)).querySelector("[data-edit]").click(); await wait(50);
    $(".modal [data-delete]").click(); await wait(80);
    ok("delete asks with session count", /2 study sessions/.test($(".modal-message").textContent), $(".modal-message")?.textContent);
    $(".modal [data-ok]").click(); await wait(150);
    ok("subject + sessions deleted", !Study.subject(phys.id) && Study.sessions().every((s) => s.subjectId !== phys.id) && physCount === 2);
    noHScroll("study");

    // ---------- Persistence ----------
    ok("subjects persisted", JSON.parse(localStorage.getItem("pd.subjects")).length === 1);
    ok("sessions persisted", JSON.parse(localStorage.getItem("pd.studySessions")).length === Study.sessions().length);
    ok("pomodoro state persisted", JSON.parse(localStorage.getItem("pd.pomodoro")).count === Pomodoro.state().count);
    ok("backup includes study data", "subjects" in Store.exportAll().data && "studySessions" in Store.exportAll().data);
  } catch (e) {
    out.push("CRASH  " + e.message + "\n" + e.stack);
  }

  out.push("JS ERRORS: " + (window.__errors.length ? window.__errors.join(" | ") : "none"));
  const pre = document.createElement("pre");
  pre.id = "test-output";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
})();
