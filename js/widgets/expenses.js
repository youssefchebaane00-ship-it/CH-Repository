// =========================================================
// EXPENSES: a simple personal spending tracker.
// Amounts are stored as plain numbers with up to 3 decimals, because
// the Tunisian dinar (TND) has 1000 millimes. The currency is only used
// for display and can be changed in Settings. No bank details, ever.
// =========================================================

const Expenses = {
  CATEGORIES: {
    food: { label: "Food", icon: "utensils", color: "#fb923c" },
    transport: { label: "Transportation", icon: "bus", color: "#60a5fa" },
    education: { label: "Education", icon: "graduation-cap", color: "#a78bfa" },
    entertainment: { label: "Entertainment", icon: "gamepad-2", color: "#f472b6" },
    shopping: { label: "Shopping", icon: "shopping-bag", color: "#34d399" },
    other: { label: "Other", icon: "receipt", color: "#94a3b8" },
  },
  CURRENCIES: ["TND", "EUR", "USD", "GBP", "MAD", "DZD", "LYD", "EGP", "SAR", "AED", "CAD", "CHF"],

  state: { month: null, category: "all" }, // month = "2026-11"

  // ---------- Helpers ----------
  all() {
    return Store.get("expenses");
  },

  // "12.5" → "12,500 TND" (shown the way your system formats money)
  format(amount) {
    const currency = Store.get("settings").currency || "TND";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
    } catch {
      return `${amount.toFixed(3)} ${currency}`; // unknown currency code
    }
  },

  // Rounded, without decimals, for small chart labels: "1 235 TND"
  formatShort(amount) {
    const currency = Store.get("settings").currency || "TND";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount);
    } catch {
      return `${Math.round(amount)} ${currency}`;
    }
  },

  // Accept "12.5", "12,5", "1 234,500" or "1,234.5". Returns a number or null.
  parseAmount(text) {
    let value = String(text).trim().replace(/\s/g, "");
    if (value.includes(",") && value.includes(".")) value = value.replace(/,/g, "");  // 1,234.5
    else value = value.replace(",", ".");                                             // 12,5
    if (!/^\d+(\.\d{1,3})?$/.test(value)) return null;
    const amount = Math.round(Number(value) * 1000) / 1000;
    return amount > 0 && amount <= 10000000 ? amount : null;
  },

  monthKey(dateKey) {
    return dateKey.slice(0, 7);
  },

  shiftMonth(month, delta) {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  },

  monthLabel(month, options = { month: "long", year: "numeric" }) {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, options);
  },

  inMonth(month) {
    return this.all().filter((e) => this.monthKey(e.date) === month);
  },

  sum(list) {
    return Math.round(list.reduce((n, e) => n + e.amount, 0) * 1000) / 1000;
  },

  // ---------- Saving ----------
  async openEditor(expense = null, defaults = {}, { quiet = false } = {}) {
    const e = expense || { amount: "", category: "food", date: UI.dateKey(), description: "", ...defaults };
    const values = await UI.form({
      title: expense ? "Edit expense" : "Add expense",
      submitLabel: expense ? "Save changes" : "Add expense",
      deleteLabel: expense ? "Delete" : null,
      fields: [
        { name: "amount", label: `Amount (${Store.get("settings").currency})`, half: true, value: e.amount === "" ? "" : String(e.amount), required: true,
          placeholder: "e.g. 12.500", validate: (v) => (this.parseAmount(v) === null ? "Enter a positive amount, e.g. 12.5 (max 3 decimals)." : "") },
        { name: "category", label: "Category", type: "select", half: true, value: e.category,
          options: Object.entries(this.CATEGORIES).map(([value, c]) => ({ value, label: c.label })) },
        { name: "date", label: "Date", type: "date", half: true, value: e.date, required: true,
          validate: (v) => (!UI.isDateKey(v) ? "Pick a valid date." : v > UI.dateKey() ? "The date can't be in the future." : "") },
        { name: "description", label: "Description (optional)", half: true, value: e.description, placeholder: "e.g. Lunch at uni" },
      ],
    });
    if (values === null) return null;
    if (values === "delete") {
      this.remove(expense.id);
      return "deleted";
    }

    const data = {
      amount: this.parseAmount(values.amount),
      category: values.category in this.CATEGORIES ? values.category : "other",
      date: values.date,
      description: values.description.slice(0, 120),
    };
    if (expense) {
      Store.set("expenses", this.all().map((x) => (x.id === expense.id ? { ...x, ...data } : x)));
      UI.toast("Expense updated");
      return { ...expense, ...data };
    }
    const created = { id: Store.newId(), ...data, createdAt: new Date().toISOString() };
    Store.set("expenses", [...this.all(), created]);
    if (!quiet) UI.toast(`${this.format(created.amount)} added`);
    this.checkBudget(this.monthKey(created.date));
    return created;
  },

  remove(id) {
    const list = this.all();
    const index = list.findIndex((e) => e.id === id);
    if (index === -1) return;
    const removed = list[index];
    Store.set("expenses", list.filter((e) => e.id !== id));
    UI.toast("Expense deleted", {
      actionLabel: "Undo",
      onAction: () => {
        const current = [...this.all()];
        current.splice(index, 0, removed);
        Store.set("expenses", current);
        Router.refresh();
      },
    });
  },

  // Warn when a new expense pushes this month over 80% / 100% of the budget
  checkBudget(month) {
    const budget = Number(Store.get("settings").monthlyBudget) || 0;
    if (!budget || month !== this.monthKey(UI.dateKey())) return;
    const spent = this.sum(this.inMonth(month));
    if (spent > budget) UI.toast(`Over budget: ${this.format(spent)} of ${this.format(budget)} this month`, { type: "error" });
    else if (spent >= budget * 0.8) UI.toast(`${Math.round((spent / budget) * 100)}% of this month's budget used`, { type: "info" });
  },

  async openBudgetEditor() {
    const settings = Store.get("settings");
    const values = await UI.form({
      title: "Monthly budget",
      submitLabel: "Save budget",
      fields: [{ name: "budget", label: `Budget per month (${settings.currency}), 0 = no budget`, value: String(settings.monthlyBudget || 0),
        validate: (v) => (v.trim() === "0" || this.parseAmount(v) !== null ? "" : "Enter 0 or a positive amount.") }],
    });
    if (values === null) return false;
    Store.setSetting("monthlyBudget", values.budget.trim() === "0" ? 0 : this.parseAmount(values.budget));
    UI.toast(Store.get("settings").monthlyBudget ? "Budget saved" : "Budget removed");
    return true;
  },

  // ---------- Expenses page ----------
  renderPage(container) {
    if (!this.state.month) this.state.month = this.monthKey(UI.dateKey());

    container.innerHTML = `
      <div class="page-header">
        <div><h2>Expenses</h2><p>Track where your money goes. Amounts in ${UI.escape(Store.get("settings").currency)} (change it in Settings).</p></div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-budget>${icon("piggy-bank")}Budget</button>
          <button class="btn btn-primary" type="button" data-new>${icon("plus")}Add expense</button>
        </div>
      </div>
      <div class="month-nav">
        <button class="btn-icon" type="button" data-prev aria-label="Previous month">${icon("chevron-left")}</button>
        <h3 data-month aria-live="polite"></h3>
        <button class="btn-icon" type="button" data-next aria-label="Next month">${icon("chevron-right")}</button>
        <button class="btn btn-secondary compact" type="button" data-this-month>This month</button>
      </div>
      <section class="stats-grid" data-stats></section>
      <div class="study-grid">
        <section class="card" data-by-category></section>
        <section class="card" data-monthly></section>
      </div>
      <section class="card expenses-list-card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-icon amber">${icon("receipt")}</span>Transactions</h3>
          <label class="select-wrap">
            ${icon("folder")}
            <select class="input compact" data-category aria-label="Filter by category">
              <option value="all">All categories</option>
              ${Object.entries(this.CATEGORIES).map(([v, c]) => `<option value="${v}">${c.label}</option>`).join("")}
            </select>
          </label>
        </div>
        <ul class="history-list" data-list></ul>
      </section>`;

    const categorySelect = container.querySelector("[data-category]");
    categorySelect.value = this.state.category;

    const drawStats = () => {
      const month = this.state.month;
      const current = this.monthKey(UI.dateKey());
      const list = this.inMonth(month);
      const total = this.sum(list);
      const previous = this.sum(this.inMonth(this.shiftMonth(month, -1)));
      const change = previous ? Math.round(((total - previous) / previous) * 100) : null;
      const budget = Number(Store.get("settings").monthlyBudget) || 0;

      // Daily average: days passed so far (this month) or the whole month (past months)
      const [y, m] = month.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const days = month === current ? new Date().getDate() : month < current ? daysInMonth : 0;

      const byCategory = Object.keys(this.CATEGORIES).map((c) => ({ c, sum: this.sum(list.filter((e) => e.category === c)) })).sort((a, b) => b.sum - a.sum);
      const top = byCategory[0];

      const card = (iconName, color, label, value, sub, extra = "") => `
        <div class="card stat-card">
          <div class="stat-top"><span>${label}</span><span class="card-icon ${color}">${icon(iconName)}</span></div>
          <div class="stat-value">${value}</div>
          ${extra}
          <div class="stat-sub">${UI.escape(sub)}</div>
        </div>`;

      const budgetPct = budget ? Math.round((total / budget) * 100) : 0;
      const budgetCard = budget
        ? card("piggy-bank", budgetPct > 100 ? "rose" : budgetPct >= 80 ? "amber" : "emerald", "Budget",
            total > budget ? `−${this.format(total - budget)}` : this.format(budget - total),
            total > budget ? `Over budget (${budgetPct}% of ${this.format(budget)})` : `Left of ${this.format(budget)} (${budgetPct}% used)`,
            `<div class="progress-track thin"><div class="progress-bar${budgetPct > 100 ? " over" : ""}" style="width:${Math.min(100, budgetPct)}%"></div></div>`)
        : card("piggy-bank", "", "Budget", "–", "No monthly budget set. Click “Budget” to add one.");

      container.querySelector("[data-month]").textContent = this.monthLabel(month);
      container.querySelector("[data-next]").disabled = month >= current;
      container.querySelector("[data-stats]").innerHTML =
        card("wallet", "", month === current ? "Spent this month" : "Spent", this.format(total),
          change === null ? `${list.length} transaction${list.length === 1 ? "" : "s"}` : `${change > 0 ? "▲" : change < 0 ? "▼" : "="} ${Math.abs(change)}% vs ${this.monthLabel(this.shiftMonth(month, -1), { month: "long" })}`) +
        budgetCard +
        card("calendar-days", "sky", "Daily average", days ? this.format(Math.round((total / days) * 1000) / 1000) : "–", days ? `Over ${days} day${days === 1 ? "" : "s"}` : "Month hasn't started") +
        card(top && top.sum ? this.CATEGORIES[top.c].icon : "receipt", "violet", "Top category", top && top.sum ? this.CATEGORIES[top.c].label : "–",
          top && top.sum ? `${this.format(top.sum)} · ${Math.round((top.sum / total) * 100)}% of spending` : "No expenses yet");
    };

    const drawByCategory = () => {
      const list = this.inMonth(this.state.month);
      const total = this.sum(list);
      const rows = Object.entries(this.CATEGORIES).map(([id, c]) => ({ id, c, sum: this.sum(list.filter((e) => e.category === id)) }))
        .filter((r) => r.sum > 0).sort((a, b) => b.sum - a.sum);
      container.querySelector("[data-by-category]").innerHTML = `
        <div class="card-header"><h3 class="card-title"><span class="card-icon violet">${icon("chart-column")}</span>Spending by category</h3></div>
        ${rows.length ? `<ul class="hbar-list">${rows.map((r) => `
          <li>
            <div class="hbar-top"><span><span class="cat-icon" style="--cat:${r.c.color}">${icon(r.c.icon)}</span>${r.c.label}</span>
              <strong>${this.format(r.sum)} <span class="muted">${Math.round((r.sum / total) * 100)}%</span></strong></div>
            <div class="progress-track thin"><div class="progress-bar" style="width:${(r.sum / rows[0].sum) * 100}%;background:${r.c.color}"></div></div>
          </li>`).join("")}</ul>`
        : UI.emptyState("chart-column", "No spending this month", "Add an expense to see where your money goes.")}`;
    };

    // Bar chart: the 6 months ending with the selected month
    const drawMonthly = () => {
      const months = Array.from({ length: 6 }, (_, i) => this.shiftMonth(this.state.month, i - 5));
      const totals = months.map((m) => ({ m, sum: this.sum(this.inMonth(m)) }));
      const budget = Number(Store.get("settings").monthlyBudget) || 0;
      const max = Math.max(budget, ...totals.map((t) => t.sum), 1);
      const any = totals.some((t) => t.sum > 0);
      container.querySelector("[data-monthly]").innerHTML = `
        <div class="card-header">
          <h3 class="card-title"><span class="card-icon sky">${icon("trending-up")}</span>Monthly spending</h3>
          ${budget ? `<span class="badge">Red = over ${this.format(budget)} budget</span>` : ""}
        </div>
        ${any ? `
          <div class="bar-chart six" role="img" aria-label="Spending over the last 6 months">
            ${totals.map((t) => `
              <div class="bar-col${t.m === this.state.month ? " today" : ""}" title="${this.monthLabel(t.m)}: ${this.format(t.sum)}">
                <span class="bar-value">${t.sum ? this.formatShort(t.sum) : ""}</span>
                <div class="bar-stack" style="height:${(t.sum / max) * 78}%"><span style="flex:1;background:${budget && t.sum > budget ? "var(--rose)" : "var(--accent)"}"></span></div>
                <span class="bar-label">${this.monthLabel(t.m, { month: "short" })}</span>
              </div>`).join("")}
          </div>`
        : UI.emptyState("trending-up", "No data yet", "Your monthly totals will appear here.")}`;
    };

    const drawList = () => {
      const list = this.inMonth(this.state.month)
        .filter((e) => this.state.category === "all" || e.category === this.state.category)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
      let lastDay = "";
      let html = "";
      for (const e of list) {
        if (e.date !== lastDay) {
          html += `<li class="history-day"><span>${UI.escape(UI.relativeDay(e.date))}</span><span>${this.format(this.sum(list.filter((x) => x.date === e.date)))}</span></li>`;
          lastDay = e.date;
        }
        const c = this.CATEGORIES[e.category] || this.CATEGORIES.other;
        html += `
          <li class="history-item" data-id="${UI.escape(e.id)}">
            <span class="cat-icon" style="--cat:${c.color}">${icon(c.icon)}</span>
            <div class="history-text">
              <strong>${UI.escape(e.description || c.label)}</strong>
              <span>${c.label}</span>
            </div>
            <strong class="history-duration">${this.format(e.amount)}</strong>
            <div class="item-actions">
              <button class="btn-icon small" type="button" data-edit aria-label="Edit expense" title="Edit">${icon("pencil")}</button>
              <button class="btn-icon small danger" type="button" data-delete aria-label="Delete expense" title="Delete">${icon("trash-2")}</button>
            </div>
          </li>`;
      }
      container.querySelector("[data-list]").innerHTML = html || `<li>${this.inMonth(this.state.month).length
        ? UI.emptyState("search", "No expenses in this category", "Choose another category.")
        : UI.emptyState("wallet", "No expenses this month", "Click “Add expense” to record your first one.")}</li>`;
    };

    const drawAll = () => { drawStats(); drawByCategory(); drawMonthly(); drawList(); };

    container.querySelector("[data-prev]").addEventListener("click", () => { this.state.month = this.shiftMonth(this.state.month, -1); drawAll(); });
    container.querySelector("[data-next]").addEventListener("click", () => { this.state.month = this.shiftMonth(this.state.month, 1); drawAll(); });
    container.querySelector("[data-this-month]").addEventListener("click", () => { this.state.month = this.monthKey(UI.dateKey()); drawAll(); });
    categorySelect.addEventListener("change", () => { this.state.category = categorySelect.value; drawList(); });

    container.querySelector("[data-new]").addEventListener("click", async () => {
      const created = await this.openEditor();
      if (created && typeof created === "object") {
        this.state.month = this.monthKey(created.date);
        drawAll();
        const row = container.querySelector(`[data-id="${CSS.escape(created.id)}"]`);
        if (row) UI.highlight(row);
      }
    });
    container.querySelector("[data-budget]").addEventListener("click", async () => {
      if (await this.openBudgetEditor()) drawAll();
    });

    container.querySelector("[data-list]").addEventListener("click", async (event) => {
      const row = event.target.closest(".history-item");
      if (!row) return;
      const expense = this.all().find((e) => e.id === row.dataset.id);
      if (!expense) return;
      if (event.target.closest("[data-delete]")) {
        UI.removeWithAnimation(row, () => { this.remove(expense.id); drawAll(); });
      } else if (event.target.closest("[data-edit]")) {
        if (await this.openEditor(expense)) drawAll();
      }
    });

    // Opening an expense from search: show its month
    if (Router.highlightId) {
      const target = this.all().find((e) => e.id === Router.highlightId);
      if (target) { this.state.month = this.monthKey(target.date); this.state.category = "all"; categorySelect.value = "all"; }
    }
    drawAll();
  },
};

// ---------------------------------------------------------
// Register the Expenses module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "expenses",
  order: 80,
  nav: { label: "Expenses", icon: "wallet" },
  page: (container) => Expenses.renderPage(container),

  collections: {
    // { id, amount, category, date, description, createdAt }
    expenses: {
      default: [],
      backup: true,
      normalize: (e) => ({
        category: "other", description: "", createdAt: null,
        ...e,
        amount: Math.max(0, Math.round((Number(e.amount) || 0) * 1000) / 1000), // up to 3 decimals (millimes)
        date: typeof e.date === "string" ? e.date : UI.dateKey(),
      }),
    },
  },

  search(q, has) {
    const list = Expenses.all()
      .filter((e) => has(e.description) || has(Expenses.CATEGORIES[e.category]?.label || ""))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    return {
      label: "Expenses",
      items: list.map((e) => ({
        text: e.description || Expenses.CATEGORIES[e.category].label, icon: Expenses.CATEGORIES[e.category]?.icon || "receipt",
        page: "expenses", id: e.id, hint: `${Expenses.format(e.amount)} · ${UI.formatDay(e.date)}`,
      })),
    };
  },

  // Monthly budget warning
  notifications() {
    const budget = Number(Store.get("settings").monthlyBudget) || 0;
    if (!budget) return [];
    const spent = Expenses.sum(Expenses.inMonth(Expenses.monthKey(UI.dateKey())));
    if (spent < budget * 0.8) return [];
    return [{
      tone: spent > budget ? "danger" : "amber", icon: "piggy-bank",
      text: spent > budget ? "Over your monthly budget" : `${Math.round((spent / budget) * 100)}% of monthly budget used`,
      sub: `${Expenses.format(spent)} of ${Expenses.format(budget)}`, page: "expenses",
      before: () => { Expenses.state.month = Expenses.monthKey(UI.dateKey()); },
    }];
  },

  quickAdd: [{
    id: "expense", label: "Add expense", icon: "wallet", key: "X", order: 50,
    async run() {
      const created = await Expenses.openEditor(null, {}, { quiet: true });
      if (created && typeof created === "object") { Expenses.state.month = Expenses.monthKey(created.date); Expenses.state.category = "all"; }
      return { created, page: "expenses", label: "Expense", onDashboard: false };
    },
  }],
});
