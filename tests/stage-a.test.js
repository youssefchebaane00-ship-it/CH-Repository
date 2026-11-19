// @real-time 30000   (uses IndexedDB, which doesn't work with the fake clock)
// Automated test for Stage A: module registry, safety nets, snapshots, backup reminders, command palette
(async () => {
  const out = [];
  // Progress is written into the page as we go, so an unfinished run still shows how far it got
  const progress = document.createElement("pre");
  progress.id = "test-progress";
  document.body.appendChild(progress);
  // The runner reads results from the page title (the app refreshes the title
  // every second from Router.pageTitle, so we set that too)
  const setTitle = (text) => { Router.pageTitle = text; document.title = text; };
  const ok = (name, cond, extra = "") => {
    out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  (" + extra + ")" : ""}`);
    progress.textContent = out.join("\n");
    setTitle(`TEST-PROGRESS ${out.length} checks, last: ${name}`);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const go = async (id) => { location.hash = "/" + id; await wait(150); };
  const key = (k, opts = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...opts }));
  const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 100 && !cond(); i++) await wait(100); return cond(); };
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };

  try {
    await wait(300);
    out.push(`VIEWPORT ${innerWidth}x${innerHeight}, reduced motion: ${UI.reduceMotion.matches}`);

    // ================= MODULE REGISTRY =================
    const ids = Modules.list.map((m) => m.id);
    ok("all modules registered", ["dashboard", "tasks", "calendar", "habits", "study", "notes", "goals", "expenses", "links", "weather", "analytics", "backups", "settings"].every((id) => ids.includes(id)), ids.join(","));
    ok("sidebar built from registry (13 pages, in order)", $$("[data-nav]").map((a) => a.dataset.nav).join(",") === "dashboard,tasks,projects,calendar,planner,habits,study,notes,goals,expenses,analytics,achievements,settings");
    ok("10 quick actions from modules", Modules.quickActions().map((a) => a.key).join("") === "TENSBXPGHL");
    ok("12 dashboard widgets from modules", Modules.widgets().length === 12 && $$(".widget-grid [data-widget]").length === 12);
    ok("collections defined by modules", ["tasks", "events", "habits", "subjects", "studySessions", "notes", "quickNote", "goals", "expenses", "links"].every((n) => Store.backupNames().includes(n)));
    ok("timers are not backed up", !Store.backupNames().includes("activeSession") && !Store.backupNames().includes("pomodoro"));
    ok("duplicate module rejected", throws(() => Modules.register({ id: "tasks" })));
    ok("module with menu entry but no page rejected", throws(() => Modules.register({ id: "nopage", nav: { label: "X", icon: "x" } })));
    ok("duplicate collection rejected", throws(() => Store.defineCollection("tasks", { default: [] })));
    ok("data version still 2 (no migration needed)", Store.VERSION === 2 && localStorage.getItem("pd.version") === "2");

    // A brand-new module plugs in without touching shared code
    let actionRan = false;
    Modules.register({
      id: "demo",
      order: 99,
      nav: { label: "Demo", icon: "rocket" },
      page: (c) => { c.innerHTML = `<section class="card" data-id="demo-item"><h2>Demo page</h2></section>`; },
      collections: { demoItems: { default: [], backup: true, normalize: (x) => ({ done: false, ...x }) } },
      search: (q, has) => ({ label: "Demo", items: has("unicorn") ? [{ text: "Unicorn item", icon: "rocket", page: "demo", id: "demo-item" }] : [] }),
      notifications: () => [{ tone: "violet", icon: "rocket", text: "Demo reminder", sub: "from the demo module", page: "demo" }],
      quickAdd: [{ id: "demo", label: "Demo action", icon: "rocket", key: "Z", order: 999, run: () => { actionRan = true; } }],
      widgets: [{ id: "demo", label: "Demo widget", span: 4, order: 999, render: (el) => { el.innerHTML = "<p>Demo widget body</p>"; } }],
    });
    Shell.renderNav();
    ok("new module: sidebar entry", !!$('[data-nav="demo"]'));
    ok("new module: data saved + normalized", (Store.set("demoItems", [{ id: "d1" }]), Store.get("demoItems")[0].done === false && "demoItems" in Store.exportAll().data));
    const si = $("#search-input");
    si.value = "unicorn"; si.dispatchEvent(new Event("input"));
    ok("new module: appears in search", $$("#search-results .search-group").some((g) => g.textContent === "Demo"));
    $$("#search-results .menu-item").find((b) => /Unicorn/.test(b.textContent)).click(); await wait(200);
    ok("new module: search result opens its page + highlights", location.hash === "#/demo" && !!$(".highlighted") && $("#page-title").textContent === "Demo");
    ok("new module: reminder in the bell", Notifications.collect().some((n) => n.text === "Demo reminder"));
    await go("dashboard");
    ok("new module: dashboard widget", /Demo widget body/.test($('[data-widget="demo"]')?.textContent || ""));
    si.value = ">demo"; si.dispatchEvent(new Event("input"));
    const demoCommand = $$("#search-results [data-command]").find((b) => /Demo action/.test(b.textContent));
    ok("new module: its quick action is a palette command", !!demoCommand);
    demoCommand.click(); await wait(50);
    ok("palette runs the action", actionRan === true);

    // ================= SAFETY NETS =================
    Modules.register({ id: "broken", order: 98, page: () => { throw new Error("boom"); } });
    await go("broken");
    ok("a crashing page shows a friendly message", /couldn't load/.test($("#view").textContent) && $(".nav-link") !== null);
    Modules.register({ id: "brokenwidget", order: 97, widgets: [{ id: "brokenw", label: "Broken widget", span: 4, order: 998, render: () => { throw new Error("boom"); } }] });
    await go("dashboard");
    ok("a crashing widget doesn't break the dashboard", /couldn't load/.test($('[data-widget="brokenw"]').textContent) && !!$('[data-widget="tasks"] .card-title'));
    Modules.register({ id: "badsearch", order: 96, search: () => { throw new Error("boom"); } });
    si.value = "old task"; si.dispatchEvent(new Event("input"));
    ok("a crashing search provider doesn't break search", $$("#search-results .search-group").some((g) => g.textContent === "Tasks"));
    key("Escape");

    // ================= SNAPSHOTS =================
    const firstOk = await until(() => Backups.available !== null);
    ok("IndexedDB available", firstOk && Backups.available === true);
    let snaps = [];
    await until(() => false, 600); // let the start-up snapshot finish
    snaps = await Backups.list();
    ok("daily snapshot made at start-up", snaps.filter((s) => s.reason === "daily" && s.date === UI.dateKey()).length === 1, JSON.stringify(snaps.map((s) => s.reason)));
    await Backups.snapshotDaily();
    ok("only one daily snapshot per day", (await Backups.list()).filter((s) => s.reason === "daily").length === 1);
    ok("snapshot summary", /tasks/.test(snaps[0].summary) && snaps[0].sizeBytes > 100);

    // Change data, then restore the snapshot
    const tasksBefore = Tasks.all().length;
    Tasks.add("Added after the snapshot");
    Tasks.add("Another one");
    ok("data changed", Tasks.all().length === tasksBefore + 2);
    await Backups.restore(snaps[0].id, { reload: false });
    ok("restore brings back the snapshot's data", Tasks.all().length === tasksBefore);
    const afterRestore = await Backups.list();
    ok("a 'before-restore' snapshot was saved (restore can be undone)", afterRestore.some((s) => s.reason === "before-restore"));
    const undo = afterRestore.find((s) => s.reason === "before-restore");
    await Backups.restore(undo.id, { reload: false });
    ok("undoing the restore works", Tasks.all().length === tasksBefore + 2);

    // Pruning keeps only the newest daily snapshots (limit lowered to 2 here to keep the test quick)
    Backups.KEEP_DAILY = 2;
    for (let i = 0; i < 3; i++) { await Backups.create("daily"); await wait(5); }
    ok("old snapshots pruned (keeps the newest)", (await Backups.list()).filter((s) => s.reason === "daily").length === 2);
    Backups.KEEP_DAILY = 7;

    // Settings shows snapshots with Restore buttons
    await go("settings");
    await until(() => $$("[data-snapshot]").length > 0);
    ok("Settings lists snapshots", $$("[data-snapshot]").length >= 2 && !!$("[data-restore-snapshot]"));
    ok("storage meter shown", /of about 5 MB/.test($(".storage-meter").textContent));
    $("[data-restore-snapshot]").click(); await wait(80);
    ok("restore asks for confirmation", /Go back to this snapshot/.test($(".modal h2")?.textContent || ""));
    $(".modal [data-cancel]").click(); await wait(50);

    // ================= BACKUP REMINDER =================
    ok("reminder when never backed up", Notifications.collect().some((n) => n.text === "Back up your data"));
    ok("Settings says no backup yet", /haven't downloaded/.test($("[data-last-export]").textContent));
    $("[data-export]").click(); await wait(80);
    ok("export remembers the date", !!Store.get("settings").lastExportAt && /today/.test($("[data-last-export]").textContent));
    ok("reminder gone after a backup", !Notifications.collect().some((n) => n.text === "Back up your data"));
    Store.setSetting("lastExportAt", new Date(Date.now() - 20 * 86400000).toISOString());
    ok("reminder returns after 14+ days", Notifications.collect().some((n) => n.text === "Back up your data" && /20 days ago/.test(n.sub)));
    ok("lastExportAt survives import validation", Store.validateBackup(JSON.stringify(Store.exportAll())).data.settings.lastExportAt !== null);

    // ================= COMMAND PALETTE =================
    await go("dashboard");
    si.value = ""; si.blur(); document.body.focus();
    key("k", { ctrlKey: true }); await wait(50);
    ok("Ctrl+K opens the palette with commands", !$("#search-results").hidden && $$("#search-results .search-group").some((g) => g.textContent === "Commands") && !!$("#search-results .search-tip"));
    ok("palette lists page commands", $$("#search-results [data-command]").some((b) => /Go to Goals/.test(b.textContent)));
    si.value = "> goals"; si.dispatchEvent(new Event("input"));
    ok("'>' shows commands only", $$("#search-results .search-group").length === 1 && $$("#search-results [data-page]").length === 0);
    si.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(200);
    ok("Enter runs the first command (Go to Goals)", location.hash === "#/goals");
    si.value = ">theme"; si.dispatchEvent(new Event("input"));
    const themeBefore = Store.get("settings").theme;
    $$("#search-results [data-command]")[0].click(); await wait(50);
    ok("theme command switches theme", Store.get("settings").theme !== themeBefore);
    si.value = "old task"; si.dispatchEvent(new Event("input"));
    ok("normal search: data results come before commands", $$("#search-results .search-group")[0].textContent === "Tasks");
    si.value = "backup"; si.dispatchEvent(new Event("input"));
    ok("matching commands appear for plain words", $$("#search-results [data-command]").some((b) => /Download a backup/.test(b.textContent)));
    si.value = ">snapshot"; si.dispatchEvent(new Event("input"));
    $$("#search-results [data-command]")[0].click(); await wait(250);
    ok("snapshot command opens Settings at the snapshots", location.hash === "#/settings" && !!$('[data-id="snapshots"].highlighted'));
    key("?"); await wait(50);
    ok("shortcuts list uses registered actions", /T E N S B X P G H L/.test($$(".shortcut-list kbd").map((k) => k.textContent).join(" ")));
    key("Escape"); await wait(50);
  } catch (e) {
    out.push("CRASH  " + e.message + "\n" + e.stack);
  }

  out.push("JS ERRORS: " + (window.__errors.length ? window.__errors.join(" | ") : "none"));
  const passed = out.filter((l) => l.startsWith("PASS")).length;
  const failures = out.filter((l) => l.startsWith("FAIL") || l.startsWith("CRASH"));
  if (window.__errors.length) failures.push("JS ERRORS: " + window.__errors.join(" | "));
  setTitle(`TEST-DONE ${passed} ${failures.length}${failures.map((f) => " || " + f.replace(/\s+/g, " ").slice(0, 300)).join("")}`);
  const pre = document.createElement("pre");
  pre.id = "test-output";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
})();
