// Automated test for Stage C: Knowledge Hub + Achievements
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
  const toasts = () => $$(".toast-message").map((t) => t.textContent).join(" | ");
  const iso = (dateKey, h = 12) => new Date(UI.parseKey(dateKey).setHours(h)).toISOString();
  const today = UI.dateKey();
  const typeInto = (el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
  const openNote = async (id) => { $(`.note-row[data-id="${id}"]`).click(); await wait(50); };
  const noHScroll = (where) => { if (document.documentElement.scrollWidth > window.innerWidth + 1) ok(`no horizontal scroll on ${where}`, false, document.documentElement.scrollWidth + "px"); };

  try {
    await wait(300);
    out.push(`VIEWPORT ${innerWidth}x${innerHeight}, reduced motion: ${UI.reduceMotion.matches}`);

    // ================= KNOWLEDGE HUB =================
    Store.set("subjects", [{ id: "s1", name: "Physics", color: "#a78bfa" }]);
    Store.set("projects", [{ id: "p1", name: "Thesis", color: "#34d399", status: "active" }]);
    const thermo = Notes.create({ title: "Thermodynamics", content: "Core ideas. See [[Entropy]] and [[Heat engines]]. The exact phrase lives here.", category: "university", tags: ["physics"] });
    const entropy = Notes.create({ title: "Entropy", content: "Part of [[thermodynamics]] (links ignore upper/lower case).", tags: ["physics"] });
    const lonely = Notes.create({ title: "Shopping list", content: "milk, eggs" });

    ok("links found", JSON.stringify(Notes.linkTitles(thermo)) === '["Entropy","Heat engines"]');
    const outgoing = Notes.outgoing(Notes.get(thermo.id));
    ok("outgoing: resolved + missing", outgoing.resolved.map((n) => n.id).join() === entropy.id && outgoing.unresolved.join() === "Heat engines");
    ok("backlinks", Notes.backlinks(Notes.get(thermo.id)).map((n) => n.id).join() === entropy.id && Notes.backlinks(Notes.get(entropy.id)).map((n) => n.id).join() === thermo.id);

    await go("notes");
    ok("page is the Knowledge Hub", /Knowledge Hub/.test($(".page-header h2").textContent) && $('[data-nav="notes"]').textContent.trim() === "Knowledge");
    await openNote(thermo.id);
    const panel = () => $(".note-editor [data-links]");
    ok("links panel: links to Entropy + missing note", !!panel().querySelector(`[data-open-note="${entropy.id}"]`) && !!panel().querySelector('[data-create-note="Heat engines"]'));
    ok("links panel: linked from Entropy", /Linked from/.test(panel().textContent) && panel().querySelectorAll(".links-group")[1].querySelector(`[data-open-note="${entropy.id}"]`) !== null);
    ok("list shows link count", /3/.test($(`.note-row[data-id="${thermo.id}"] .link-count`)?.textContent || ""), $(`.note-row[data-id="${thermo.id}"] .link-count`)?.textContent);

    // Create the missing note from its link
    panel().querySelector('[data-create-note="Heat engines"]').click(); await wait(100);
    const heat = Notes.findByTitle("Heat engines");
    ok("missing link → note created", !!heat && !Notes.outgoing(Notes.get(thermo.id)).unresolved.length);
    ok("panel now links to it", !!panel().querySelector(`[data-open-note="${heat.id}"]`));

    // Follow a link
    panel().querySelector(`[data-open-note="${entropy.id}"]`).click(); await wait(80);
    ok("clicking a link opens that note", $('.note-editor [data-field="title"]').value === "Entropy");

    // Rename updates links everywhere
    typeInto($('.note-editor [data-field="title"]'), "Entropy (physics)"); await wait(700);
    ok("rename rewrites [[links]] in other notes", /\[\[Entropy \(physics\)\]\]/.test(Notes.get(thermo.id).content) && !/\[\[Entropy\]\]/.test(Notes.get(thermo.id).content));
    ok("link still resolves after rename", Notes.outgoing(Notes.get(thermo.id)).resolved.some((n) => n.id === entropy.id));
    const dupA = Notes.create({ title: "Dup" }); Notes.create({ title: "Dup" }); const linker = Notes.create({ title: "Linker", content: "[[Dup]]" });
    Notes.update(dupA.id, { title: "Dup renamed" });
    ok("ambiguous rename leaves links alone", Notes.get(linker.id).content === "[[Dup]]");

    // Insert link button + subject/project
    Router.refresh(); await wait(80);
    await openNote(lonely.id);
    $(".note-editor [data-insert-link]").click(); await wait(50);
    await modalSubmit({ target: thermo.id });
    ok("insert-link button adds [[Thermodynamics]]", /\[\[Thermodynamics\]\]/.test(Notes.get(lonely.id).content));
    const subj = $('.note-editor [data-field="subjectId"]'); subj.value = "s1"; subj.dispatchEvent(new Event("change", { bubbles: true }));
    const proj = $('.note-editor [data-field="projectId"]'); proj.value = "p1"; proj.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(700);
    ok("note linked to subject + project", Notes.get(lonely.id).subjectId === "s1" && Notes.get(lonely.id).projectId === "p1" && /Belongs to/.test(panel().textContent));

    // Advanced search
    const m = (q, note) => Notes.matches(Notes.get(note.id), q);
    ok("search: #tag", m("#physics", thermo) && !m("#physics", lonely));
    ok("search: \"exact phrase\"", m('"exact phrase lives"', thermo) && !m('"phrase exact"', thermo));
    ok("search: several words (AND)", m("core ideas", thermo) && !m("core milk", thermo));
    ok("search: category:", m("category:university", thermo) && !m("category:university", entropy));
    ok("search: project: / subject:", m("project:thesis", lonely) && m("subject:phys", lonely) && !m("project:thesis", thermo));
    ok("search: is:linked / is:orphan", m("is:linked", thermo) && Notes.matches(Notes.get(dupA.id), "is:orphan") && !m("is:orphan", thermo));
    typeInto($("[data-query]"), "#physics"); await wait(50);
    ok("search box uses the same rules", $$(".note-row").length === 2);
    typeInto($("[data-query]"), ""); await wait(30);
    $("[data-help]").click(); await wait(20);
    ok("search tips can be shown", !$("[data-help-panel]").hidden && /is:favorite/.test($("[data-help-panel]").textContent));

    // Favorites + recent
    await openNote(entropy.id);
    $(".note-editor [data-pin]").click(); await wait(50);
    $('[data-filter="favorites"]').click(); await wait(30);
    ok("favorites filter", $$(".note-row").length === 1 && $(".note-row").dataset.id === entropy.id);
    $('[data-filter="recent"]').click(); await wait(30);
    ok("recent filter: last opened first", $$(".note-row")[0].dataset.id === entropy.id && $$(".note-row").length >= 3);
    $('[data-filter="all"]').click(); await wait(30);
    noHScroll("knowledge hub");

    // Graph
    $('[data-view="graph"]').click(); await wait(100);
    const graph = Notes.lastGraph;
    ok("graph view draws a canvas", !!$("[data-graph]") && /links? between notes/.test($(".graph-card").textContent));
    ok("graph has notes + project + subject nodes", graph.nodes.filter((n) => n.kind === "note").length === Notes.all().length && graph.nodes.some((n) => n.kind === "project") && graph.nodes.some((n) => n.kind === "subject"));
    ok("graph edges = real links", graph.edges.filter((e) => e[2] === "link").length === Notes.all().reduce((s, n) => s + Notes.outgoing(n).resolved.length, 0));
    const canvas = $("[data-graph]");
    const target = graph.nodes.find((n) => n.id === heat.id);
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent("click", { clientX: rect.left + target.x, clientY: rect.top + target.y, bubbles: true }));
    await wait(80);
    ok("clicking a dot opens the note", $('.note-editor [data-field="title"]')?.value === "Heat engines");

    // Deleting a linked note warns
    await openNote(thermo.id);
    $(".note-editor [data-delete]").click(); await wait(60);
    ok("delete warns about links", /link to it/.test($(".modal-message").textContent));
    $(".modal [data-cancel]").click(); await wait(30);

    // ================= ACHIEVEMENTS =================
    const days = (n) => Array.from({ length: n }, (_, i) => UI.addDays(today, -i)).reverse();
    Store.set("notes", []);
    Store.set("timeBlocks", []);
    Store.set("tasks", [
      { id: "x1", title: "A", done: true, completedAt: iso(UI.addDays(today, -2)), createdAt: iso(today) },
      { id: "x2", title: "B", done: true, completedAt: iso(UI.addDays(today, -1)), createdAt: iso(today) },
      { id: "x3", title: "C", priority: "high", done: true, completedAt: iso(today, 7), createdAt: iso(today) },
      { id: "x4", title: "Open", createdAt: iso(today) },
    ]);
    Store.set("habits", [{ id: "hb", name: "Read", doneDays: days(7), createdAt: iso(UI.addDays(today, -10)) }]);
    Store.set("studySessions", [{ id: "st", subjectId: "s1", date: today, durationSec: 3600, source: "pomodoro" }]);
    Store.set("goals", [{ id: "gl", title: "Goal", status: "completed", progress: 100, completedAt: iso(today) }]);
    Store.set("projects", [{ id: "pj", name: "Done project", color: "#22d3ee", status: "completed", milestones: [{ id: "ms", title: "M", done: true, doneAt: iso(today) }] }]);
    const st = Achievements.state();
    // tasks 10+10+15, habit 7×5 + 25 streak bonus, study 12, goal 50, milestone 25, project 100 = 282
    ok("XP is calculated from history (282)", st.xp === 282, `${st.xp} ${JSON.stringify(st.bySource)}`);
    ok("level 2 (100–300 XP)", st.level === 2 && st.into === 182 && st.needed === 200 && st.title === "Beginner");
    ok("XP by source adds up", Object.values(st.bySource).reduce((a, b) => a + b, 0) === st.xp);
    const list = Achievements.list();
    const find = (id) => list.find((a) => a.id === id);
    ok("achievements unlocked with real dates", find("first-task").done && find("first-task").date === UI.addDays(today, -2) && find("streak-7").done && find("streak-7").date === today);
    ok("early bird (task done at 07:00)", find("early-bird").done && find("early-bird").date === today);
    ok("locked achievements show progress", !find("tasks-10").done && find("tasks-10").value === 3 && find("tasks-10").target === 10);
    ok("pomodoro + goal + project achievements", find("pomodoro-1").done && find("goal-1").done && find("project-1").done);

    const daily = Achievements.dailyChallenges();
    ok("3 daily challenges, same all day", daily.length === 3 && JSON.stringify(daily.map((c) => c.id)) === JSON.stringify(Achievements.dailyChallenges().map((c) => c.id)));
    ok("challenge values are real", daily.every((c) => typeof c.value === "number" && c.target > 0));
    ok("2 weekly challenges", Achievements.weeklyChallenges().length === 2);
    Store.set("subjects", []);
    ok("challenges only for things you use", !Achievements.dailyChallenges().some((c) => c.id === "study45" || c.id === "pomodoro"));

    // Celebrations for NEW progress only
    await wait(600);
    const before = Store.get("gamification").level;
    Store.set("tasks", [...Tasks.all(), ...Array.from({ length: 3 }, (_, i) => ({ id: `y${i}`, title: `Y${i}`, done: true, completedAt: iso(today), createdAt: iso(today) }))]);
    await wait(600);
    ok("level up is celebrated once", before === 2 && Store.get("gamification").level === 3 && /Level up! You're now level 3/.test(toasts()));
    ok("sidebar shows the level", /Lv 3/.test($(".profile").textContent));
    Store.setSetting("celebrations", false);
    const toastCount = $$(".toast").length;
    Store.set("tasks", [...Tasks.all(), ...Array.from({ length: 4 }, (_, i) => ({ id: `z${i}`, title: `Z${i}`, done: true, completedAt: iso(today), createdAt: iso(today) }))]);
    await wait(600);
    ok("celebrations can be turned off (no toast, progress still saved)", $$(".toast").length <= toastCount && Store.get("gamification").achievements.includes("tasks-10"));
    Store.setSetting("celebrations", true);

    // Page + widget
    await go("achievements");
    ok("achievements page", /Level/.test($(".level-card").textContent) && $$(".achievement").length === Achievements.list().length && $$(".challenge").length === 5);
    ok("page explains the XP rules", /Task 10/.test($(".xp-rules").textContent));
    await go("dashboard");
    ok("dashboard level & challenges widget", /Level 3/.test($('[data-widget="challenges"]').textContent));
    noHScroll("dashboard");

    // Switching it off
    await go("settings");
    const toggle = $('[data-gamification] [data-setting="gamification"]');
    toggle.checked = false; toggle.dispatchEvent(new Event("change", { bubbles: true })); await wait(50);
    ok("off: sidebar level hidden", !/Lv /.test($(".profile").textContent));
    await go("achievements");
    ok("off: page explains how to turn it on", /switched off/.test($("#view").textContent));
    $("[data-enable-gamification]").click(); await wait(100);
    ok("turn back on from the page", Achievements.enabled() && !!$(".level-card"));

    // App section exists (install works only from a web address)
    await go("settings");
    ok("settings: App section explains install", /web address/.test($("[data-pwa-status]").textContent));
    ok("settings data not in backups: gamification seen-state", !("gamification" in Store.exportAll().data));
  } catch (e) {
    out.push("CRASH  " + e.message + "\n" + e.stack);
  }

  out.push("JS ERRORS: " + (window.__errors.length ? window.__errors.join(" | ") : "none"));
  const pre = document.createElement("pre");
  pre.id = "test-output";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
})();
