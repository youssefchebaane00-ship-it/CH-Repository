// =========================================================
// CHARTS: small helpers that build charts out of plain HTML/CSS.
// No chart library: a bar is just a <div> whose height is a percentage.
// =========================================================

const Charts = {
  VIEWS: {
    daily: { label: "Daily", hint: "last 14 days" },
    weekly: { label: "Weekly", hint: "last 12 weeks" },
    monthly: { label: "Monthly", hint: "last 12 months" },
  },

  // Split time into "buckets" (days, weeks or months), oldest first.
  // Each bucket: { from, to, label, title } with inclusive date keys.
  // offset = how many whole periods to go back (used for "vs previous period").
  buckets(view, offset = 0) {
    const today = UI.dateKey();
    const list = [];
    if (view === "daily") {
      for (let i = 13; i >= 0; i--) {
        const key = UI.addDays(today, -(i + offset * 14));
        list.push({ from: key, to: key, label: UI.formatDay(key, { day: "numeric" }), title: UI.formatDay(key, { weekday: "long", day: "numeric", month: "long" }) });
      }
    } else if (view === "weekly") {
      const thisWeek = UI.startOfWeek(today);
      for (let i = 11; i >= 0; i--) {
        const from = UI.addDays(thisWeek, -7 * (i + offset * 12));
        const to = UI.addDays(from, 6);
        list.push({ from, to, label: UI.formatDay(from, { day: "numeric", month: "short" }), title: `Week of ${UI.formatDay(from, { day: "numeric", month: "long" })}` });
      }
    } else {
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - (i + offset * 12), 1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        list.push({
          from: UI.dateKey(start), to: UI.dateKey(end),
          label: start.toLocaleDateString(undefined, { month: "short" }),
          title: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        });
      }
    }
    // Never count days in the future
    return list.map((b) => ({ ...b, to: b.to > today ? today : b.to }));
  },

  // The whole range covered by a set of buckets
  range(buckets) {
    return { from: buckets[0].from, to: buckets[buckets.length - 1].to };
  },

  // Vertical bar chart. bars: [{ label, title, segments: [{ value, color }] }]
  // format(value) turns a number into the text shown above the bar.
  barChart(bars, { format = (v) => String(v), height = 200, emptyText = "No data in this period" } = {}) {
    const totals = bars.map((b) => b.segments.reduce((n, s) => n + s.value, 0));
    const max = Math.max(...totals, 0);
    if (max === 0) return `<div class="chart-empty">${UI.escape(emptyText)}</div>`;
    return `
      <div class="bar-chart dyn${bars.length > 8 ? " dense" : ""}" style="--cols:${bars.length};height:${height}px" role="img"
           aria-label="${UI.escape(bars.map((b, i) => `${b.title}: ${format(totals[i])}`).join(", "))}">
        ${bars.map((b, i) => `
          <div class="bar-col${b.highlight ? " today" : ""}" title="${UI.escape(b.title)}: ${UI.escape(format(totals[i]))}">
            <span class="bar-value">${totals[i] ? UI.escape(format(totals[i])) : ""}</span>
            <div class="bar-stack" style="height:${(totals[i] / max) * 82}%">
              ${b.segments.filter((s) => s.value > 0).map((s) => `<span style="flex:${s.value};background:${s.color}"></span>`).join("")}
            </div>
            <span class="bar-label">${UI.escape(b.label)}</span>
          </div>`).join("")}
      </div>`;
  },

  // Horizontal bars. rows: [{ label, value, color, valueText }]
  hbars(rows, { emptyText = "No data in this period" } = {}) {
    const visible = rows.filter((r) => r.value > 0);
    if (!visible.length) return `<div class="chart-empty">${UI.escape(emptyText)}</div>`;
    const max = Math.max(...visible.map((r) => r.value));
    return `<ul class="hbar-list">${visible.map((r) => `
      <li>
        <div class="hbar-top"><span><span class="subject-dot" style="--subject:${r.color}"></span>${UI.escape(r.label)}</span><strong>${r.valueText}</strong></div>
        <div class="progress-track thin"><div class="progress-bar" style="width:${(r.value / max) * 100}%;background:${r.color}"></div></div>
      </li>`).join("")}</ul>`;
  },

  legend(items) {
    return `<div class="chart-legend">${items.map((i) => `<span><span class="subject-dot" style="--subject:${i.color}"></span>${UI.escape(i.label)}</span>`).join("")}</div>`;
  },

  // "▲ 12% vs previous" / "▼ 5% …" / "" when there is nothing to compare
  change(current, previous, label = "vs previous period") {
    if (!previous) return current ? "New this period" : "";
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct > 0 ? "▲" : pct < 0 ? "▼" : "="} ${Math.abs(pct)}% ${label}`;
  },
};
