// =========================================================
// APP: starts everything. This file is loaded last.
// =========================================================

// 1. Upgrade data saved by version 1 (runs once, keeps the old data as a backup)
Store.migrate();

// 2. Draw the sidebar, top bar, menus
Shell.init();

// 3. Draw the page named in the address (Dashboard by default)
Router.start();

// 4. Whenever any data is saved, recalculate the statistics on screen
Store.onChange(() => Stats.refresh());

// 5. One clock for the whole app: ticks every second.
//    At midnight it redraws the page so "today" starts fresh
//    (habit history is kept, only today's check-boxes reset).
let lastDay = UI.dateKey();
setInterval(() => {
  Welcome.tick();
  const today = UI.dateKey();
  if (today !== lastDay) {
    lastDay = today;
    Router.refresh();
  }
}, 1000);
Welcome.tick();
