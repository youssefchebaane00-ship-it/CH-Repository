// Automated test for PersonalDashboard Phase 4: goals, expenses, links, quick actions
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
  const today = UI.dateKey(), yesterday = UI.addDays(today, -1);
  const noHScroll = (where) => { if (document.documentElement.scrollWidth > window.innerWidth + 1) ok(`no horizontal scroll on ${where}`, false, document.documentElement.scrollWidth + "px"); };

  try {
    await wait(300);
    out.push(`VIEWPORT ${innerWidth}x${innerHeight}, reduced motion: ${UI.reduceMotion.matches}`);
    ok("sidebar: no Soon badges", $$(".nav-badge").length === 0);

    // ================= GOALS =================
    await go("goals");
    ok("goals page renders", $("#page-title").textContent === "Goals" && $$("[data-stats] .stat-card").length === 4);
    ok("goals empty state", !!$("[data-active] .empty-state"));
    $("[data-new]").click(); await wait(50);
    await modalSubmit({ title: "Pass physics exam", progress: "150" });
    ok("progress over 100 rejected", !!$(".modal") && Goals.all().length === 0);
    await modalSubmit({ progress: "20", horizon: "monthly", category: "university", targetDate: UI.addDays(today, 5), description: "Aim for 15/20" });
    const g1 = Goals.all()[0];
    ok("goal saved", g1 && g1.progress === 20 && g1.category === "university" && g1.horizon === "monthly" && g1.status === "active");
    ok("goal card shown", $$("[data-active] .goal-card").length === 1 && /Pass physics exam/.test($("[data-active]").textContent));

    // Slider
    const slider = $(`[data-id="${g1.id}"] .goal-slider`);
    slider.value = "55"; slider.dispatchEvent(new Event("input", { bubbles: true }));
    ok("slider updates label live", $(`[data-id="${g1.id}"] [data-percent]`).textContent === "55%");
    slider.dispatchEvent(new Event("change", { bubbles: true })); await wait(30);
    ok("slider saves progress", Goals.all()[0].progress === 55);
    $(`[data-id="${g1.id}"] [data-step="10"]`).click(); await wait(30);
    ok("+10 button", Goals.all()[0].progress === 65 && $(`[data-id="${g1.id}"] [data-percent]`).textContent === "65%");
    $(`[data-id="${g1.id}"] [data-step="-10"]`).click(); await wait(30);
    ok("−10 button", Goals.all()[0].progress === 55);
    ok("average progress stat", /55%/.test($("[data-stats]").textContent));

    // Complete + reopen
    $(`[data-id="${g1.id}"] [data-complete]`).click(); await wait(80);
    ok("Done completes goal", Goals.all()[0].status === "completed" && Goals.all()[0].progress === 100 && !!Goals.all()[0].completedAt);
    ok("moves to recently completed", !!$(`[data-completed] [data-id="${g1.id}"]`) && !$(`[data-active] [data-id="${g1.id}"]`));
    ok("completed this month stat = 1", /Completed this month\s*1/.test($("[data-stats]").textContent.replace(/\s+/g, " ")));
    $(`[data-id="${g1.id}"] [data-reopen]`).click(); await wait(80);
    ok("reopen → active at 90%", Goals.all()[0].status === "active" && Goals.all()[0].progress === 90);

    // Slider to 100 completes
    const s2 = $(`[data-id="${g1.id}"] .goal-slider`);
    s2.value = "100"; s2.dispatchEvent(new Event("change", { bubbles: true })); await wait(80);
    ok("slider to 100% completes", Goals.all()[0].status === "completed");
    $(`[data-id="${g1.id}"] [data-reopen]`).click(); await wait(80);

    // More goals, filters, overdue
    $("[data-new]").click(); await wait(50);
    await modalSubmit({ title: "Drink 2L water", horizon: "daily", category: "health", targetDate: yesterday, progress: "0" });
    const g2 = Goals.all().find((g) => g.title === "Drink 2L water");
    ok("overdue goal marked", $(`[data-id="${g2.id}"]`).classList.contains("is-overdue") && /Overdue/.test($(`[data-id="${g2.id}"] .goal-date`).textContent));
    $('[data-filter="daily"]').click(); await wait(30);
    ok("horizon filter", $$("[data-active] .goal-card").length === 1 && $('[data-filter="daily"] .count').textContent === "1");
    $('[data-filter="all"]').click(); await wait(30);
    $("[data-category]").value = "university"; $("[data-category]").dispatchEvent(new Event("change")); await wait(30);
    ok("category filter", $$("[data-active] .goal-card").length === 1);
    $("[data-category]").value = "all"; $("[data-category]").dispatchEvent(new Event("change")); await wait(30);
    ok("overdue in stats", /overdue/.test($("[data-stats]").textContent));

    // Edit (lower progress) + delete
    $(`[data-id="${g2.id}"] [data-edit]`).click(); await wait(50);
    await modalSubmit({ title: "Drink 2 litres of water", progress: "40" });
    ok("goal edited", Goals.all().find((g) => g.id === g2.id).title === "Drink 2 litres of water" && Goals.all().find((g) => g.id === g2.id).progress === 40);
    $(`[data-id="${g2.id}"] [data-edit]`).click(); await wait(50);
    $(".modal [data-delete]").click(); await wait(60);
    ok("delete asks to confirm", /Delete this goal/.test($(".modal h2").textContent));
    $(".modal [data-ok]").click(); await wait(100);
    ok("goal deleted", !Goals.all().some((g) => g.id === g2.id));
    noHScroll("goals");

    // ================= EXPENSES =================
    await go("expenses");
    ok("expenses page renders", $("#page-title").textContent === "Expenses" && $$("[data-stats] .stat-card").length === 4);
    ok("currency TND by default", Store.get("settings").currency === "TND");
    ok("TND shows 3 decimals", /12[.,]500/.test(Expenses.format(12.5)), Expenses.format(12.5));
    ok("next month disabled on current month", $("[data-next]").disabled === true);
    ok("expenses empty state", !!$("[data-list] .empty-state"));

    $("[data-new]").click(); await wait(50);
    for (const bad of ["abc", "-3", "0", "1.2345"]) {
      await modalSubmit({ amount: bad });
      ok(`amount "${bad}" rejected`, !!$(".modal") && Expenses.all().length === 0);
    }
    await modalSubmit({ amount: "12,5", date: UI.addDays(today, 1) });
    ok("future date rejected", !!$(".modal"));
    await modalSubmit({ amount: "12,5", category: "food", date: today, description: "Lunch at uni" });
    const e1 = Expenses.all()[0];
    ok("expense saved (comma decimal)", e1 && e1.amount === 12.5 && e1.category === "food" && e1.description === "Lunch at uni");
    ok("transaction listed", $$("[data-list] .history-item").length === 1 && /Lunch at uni/.test($("[data-list]").textContent));
    ok("month total stat", /12[.,]500/.test($("[data-stats]").textContent));

    // More expenses incl. last month for comparison
    const lastMonthDay = Expenses.shiftMonth(Expenses.monthKey(today), -1) + "-15";
    Store.set("expenses", [...Expenses.all(),
      { id: "x2", amount: 30, category: "transport", date: today, description: "Bus pass", createdAt: new Date().toISOString() },
      { id: "x3", amount: 25, category: "food", date: lastMonthDay, description: "Groceries", createdAt: new Date().toISOString() }]);
    Router.refresh(); await wait(100);
    ok("category bars (this month only)", $$("[data-by-category] .hbar-list li").length === 2);
    ok("top category = Transportation", /Transportation/.test($$("[data-stats] .stat-card")[3].textContent));
    ok("change vs last month (▲ 70%)", /▲ 70%/.test($("[data-stats]").textContent), $$("[data-stats] .stat-sub")[0].textContent);
    ok("6-month chart", $$("[data-monthly] .bar-col").length === 6);
    $("[data-prev]").click(); await wait(50);
    ok("previous month shows its expenses", $$("[data-list] .history-item").length === 1 && /Groceries/.test($("[data-list]").textContent) && $("[data-next]").disabled === false);
    $("[data-this-month]").click(); await wait(50);

    // Category filter
    $("[data-category]").value = "transport"; $("[data-category]").dispatchEvent(new Event("change")); await wait(30);
    ok("category filter on list", $$("[data-list] .history-item").length === 1);
    $("[data-category]").value = "all"; $("[data-category]").dispatchEvent(new Event("change")); await wait(30);

    // Edit + delete + undo
    $(`[data-id="x2"] [data-edit]`).click(); await wait(50);
    await modalSubmit({ amount: "35.250" });
    ok("expense edited", Expenses.all().find((e) => e.id === "x2").amount === 35.25);
    $(`[data-id="x2"] [data-delete]`).click(); await wait(400);
    ok("expense deleted", !Expenses.all().some((e) => e.id === "x2"));
    $(".toast-action").click(); await wait(150);
    ok("undo restores expense", Expenses.all().some((e) => e.id === "x2"));

    // Budget
    $("[data-budget]").click(); await wait(50);
    await modalSubmit({ budget: "-5" });
    ok("invalid budget rejected", !!$(".modal"));
    await modalSubmit({ budget: "50" });
    ok("budget saved", Store.get("settings").monthlyBudget === 50);
    ok("budget card shows % used", /96% used/.test($("[data-stats]").textContent), $$("[data-stats] .stat-sub")[1]?.textContent);
    $("[data-new]").click(); await wait(50);
    await modalSubmit({ amount: "10", category: "shopping", date: today });
    ok("over-budget warning toast", /Over budget/.test(toasts()));
    ok("budget card shows over", /Over budget/.test($("[data-stats]").textContent));
    ok("over-budget month bar is red", /rose/.test($("[data-monthly] .bar-col.today .bar-stack span").getAttribute("style")));
    ok("bell shows budget warning", (Notifications.renderPanel(), /Over your monthly budget/.test($("#notifications-panel").textContent)));
    noHScroll("expenses");

    // ================= SETTINGS: currency =================
    await go("settings");
    const cf = $("[data-currency-form]");
    cf.elements.currency.value = "EUR"; submit(cf); await wait(30);
    ok("currency changed to EUR", Store.get("settings").currency === "EUR" && /€/.test(Expenses.format(10)));
    cf.elements.currency.value = "TND"; submit(cf); await wait(30);
    ok("settings shows budget", /50/.test($("[data-budget-text]").textContent));

    // ================= LINKS =================
    await go("dashboard");
    ok("links widget renders tiles", $$("[data-links] .link-tile").length === 2);
    ok("single category → no group headings", !$("[data-links] .link-group-title"));
    $("[data-links] [data-add]").click(); await wait(50);
    await modalSubmit({ name: "Evil", url: "javascript:alert(1)" });
    ok("javascript: link rejected", !!$(".modal"));
    await modalSubmit({ name: "Moodle", url: "moodle.org", category: "study" });
    const moodle = Links.all().find((l) => l.name === "Moodle");
    ok("link added with category + https", moodle && moodle.category === "study" && moodle.url === "https://moodle.org/");
    ok("grouped by category now", $$("[data-links] .link-group-title").map((t) => t.textContent).join(",") === "Study,Other");
    ok("tile opens in new tab safely", $(`[data-id="${moodle.id}"] a`).target === "_blank" && /noopener/.test($(`[data-id="${moodle.id}"] a`).rel));
    $(`[data-id="${moodle.id}"] [data-edit]`).click(); await wait(50);
    ok("edit dialog prefilled", $(".modal [name=name]").value === "Moodle" && $(".modal [name=category]").value === "study");
    await modalSubmit({ name: "Moodle Uni" });
    ok("link edited", Links.all().find((l) => l.id === moodle.id).name === "Moodle Uni");
    $(`[data-id="${moodle.id}"] [data-delete]`).click(); await wait(400);
    ok("link removed", !Links.all().some((l) => l.id === moodle.id));
    $(".toast-action").click(); await wait(150);
    ok("undo restores link", Links.all().some((l) => l.id === moodle.id));

    // ================= QUICK ADD + SEARCH =================
    $("#quick-add-button").click();
    ok("quick add has 10 actions", $$("#quick-add-menu [data-action]").length === 10);
    $('[data-action="expense"]').click(); await wait(50);
    await modalSubmit({ amount: "4.5", category: "food", date: today, description: "Coffee" });
    ok("quick add expense", Expenses.all().some((e) => e.description === "Coffee" && e.amount === 4.5));
    ok("offers a View button (not on dashboard)", $$(".toast-action").some((b) => b.textContent === "View"));
    $("#quick-add-button").click();
    $('[data-action="goal"]').click(); await wait(50);
    await modalSubmit({ title: "Read 12 books this year", horizon: "long", progress: "10" });
    ok("quick add goal", Goals.all().some((g) => g.title === "Read 12 books this year" && g.horizon === "long"));

    const si = $("#search-input");
    si.value = "coffee"; si.dispatchEvent(new Event("input"));
    ok("search finds expense", $$("#search-results .search-group").some((g) => g.textContent === "Expenses"));
    $$("#search-results .menu-item").find((b) => b.dataset.page === "expenses").click(); await wait(250);
    ok("expense result opens expenses + highlights", location.hash === "#/expenses" && !!$(".history-item.highlighted"));
    si.value = "books"; si.dispatchEvent(new Event("input"));
    $$("#search-results .menu-item").find((b) => b.dataset.page === "goals").click(); await wait(250);
    ok("goal result opens goals + highlights", location.hash === "#/goals" && !!$(".goal-card.highlighted"));

    // ================= PERSISTENCE =================
    ok("goals persisted", JSON.parse(localStorage.getItem("pd.goals")).length === Goals.all().length);
    ok("expenses persisted", JSON.parse(localStorage.getItem("pd.expenses")).length === Expenses.all().length);
    ok("backup includes goals + expenses", "goals" in Store.exportAll().data && "expenses" in Store.exportAll().data);
  } catch (e) {
    out.push("CRASH  " + e.message + "\n" + e.stack);
  }

  out.push("JS ERRORS: " + (window.__errors.length ? window.__errors.join(" | ") : "none"));
  const pre = document.createElement("pre");
  pre.id = "test-output";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
})();
