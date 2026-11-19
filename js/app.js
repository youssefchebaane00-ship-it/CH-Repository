// =========================================================
// APP: starts everything. This file is loaded last.
// =========================================================

// 1. Upgrade data saved by version 1 (runs once, keeps the old data as a backup)
Store.migrate();

// 2. Draw the sidebar, top bar, menus and the notification bell
Shell.init();
Notifications.init();

// 3. A Pomodoro that ended while the app was closed is finished (and logged) now
Pomodoro.tick();

// 4. Draw the page named in the address (Dashboard by default)
Router.start();

// 4b. Today's automatic snapshot (in the background; see js/backups.js)
Backups.snapshotDaily();

// 4c. Offline mode + "Install app" (only when opened from a web address; see js/pwa.js)
PWA.init();

// 5. Whenever any data is saved, recalculate statistics and reminders
Store.onChange(() => {
  Stats.refresh();
  Notifications.refresh();
  Achievements.checkProgress(); // new level or achievement? (waits a moment, then checks once)
});
Achievements.checkProgress();

// 6. One clock for the whole app: ticks every second.
//    It updates the clocks and timers, and finishes a Pomodoro when time is up.
//    Every minute it refreshes the reminders (an event may have just ended).
//    At midnight it redraws the page so "today" starts fresh
//    (habit history is kept, only today's check-boxes reset).
let lastDay = UI.dateKey();
let lastMinute = new Date().getMinutes();
setInterval(() => {
  Welcome.tick();
  Pomodoro.tick();
  Study.tick();
  const now = new Date();
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    Notifications.refresh();
  }
  const today = UI.dateKey(now);
  if (today !== lastDay) {
    lastDay = today;
    Router.refresh();
    Stats.refresh();
    Backups.snapshotDaily(); // a new day = a new snapshot
  }
}, 1000);
Welcome.tick();
Study.tick();
