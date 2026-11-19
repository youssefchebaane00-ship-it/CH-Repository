# PersonalDashboard

A personal productivity app that runs entirely in your web browser. No installation, no account, no server.

## How to use it

Double-click `index.html`. It opens in your browser.

Tip: bookmark it or set it as your browser's home page.

## Features

- **App layout:** collapsible sidebar, top bar, and pages that switch without reloading (the browser's back/forward buttons work)
- **Dashboard:** greeting, live clock, daily quote, today's progress, 5 statistics from your real data, and widgets you can show or hide: today's tasks, habits, study, upcoming events, weather, this week's productivity, quick note, links
- **Tasks:** title, description, priority (High/Medium/Low), due date, category, tags. Filters (All, Today, Upcoming, Overdue, Completed), category filter, sorting, overdue warnings, edit dialog, delete with **Undo**
- **Projects:** multiple projects with a Kanban board (To do / Doing / Done, drag and drop or arrow buttons), milestones, deadlines, project notes, resource links and progress. Tasks can wait for another task ("blocked by"), and loops are prevented.
- **Planner:** time blocking on a day view with hours, a week overview, conflict detection, moving blocks around, estimated task durations, and **Suggest a plan**: rule-based (overdue → due date → priority) and only added when you accept it. Planning hours are set in Settings.
- **Calendar:** month and week views, day agenda, events typed as Event, Deadline, Exam or Personal, with optional times. Tasks with due dates appear on their day. Double-click a day to add an event.
- **Habits:** daily or weekly (“3× per week”) habits, current and longest streaks, completion rates, weekly and monthly check-in counts, 6-month heatmaps. History is never erased.
- **Notes:** multiple notes with title, category, tags, pinning, search, timestamps and autosave. The dashboard quick note can be saved as a note.
- **Study Tracker:** subjects with colors and weekly goals; a study stopwatch (start, pause, resume, stop & save, with the duration checked before saving); manual sessions; totals for today, this week, this month and per subject; a 7-day chart and session history
- **Pomodoro:** 25/5/15 by default (changeable in Settings), start/pause/resume/reset/skip, long break after every 4 focus sessions, chime when a period ends, daily counter. Finished focus periods are logged to the chosen subject automatically.
- Running timers keep going across pages, refreshes and closed tabs, and show in the top bar and the browser tab title
- **Goals:** daily, weekly, monthly and long-term goals with category, target date and a progress slider. 100% completes a goal (with confetti). Shows active and recently completed goals, and completed goals can be reopened.
- **Expenses:** amount (TND with 3 decimals by default, changeable in Settings), category, date and description. Month by month: total vs last month, optional monthly budget with warnings, daily average, spending by category, 6-month chart and transactions with edit, delete and Undo.
- **Analytics:** daily (14 days), weekly (12 weeks) and monthly (12 months) views of tasks completed, study time (overall and per subject), habit completion rates and streaks, goals completed and spending, each compared with the previous period. Everything is calculated from your own data.
- **Insights:** written observations (study trends, best study day, task completion, overdue work, unplanned deadlines, habit consistency, streaks at risk, goals at risk, spending pace, budget projection, time of day). Each appears only with enough data and shows the numbers behind it.
- **Notifications** (bell): overdue tasks, tasks and events today, tomorrow's events, habits left today
- **Weather:** current weather and a 5-day forecast for any city (default: Tunis), via [Open-Meteo](https://open-meteo.com/) (free, no API key)
- **Favorite links:** categories, editing, and each site's own icon (loaded directly from the site, never through a third-party service)
- **Search and command palette** (`Ctrl+K` or `/`): search tasks, events, habits, notes, subjects, goals, expenses and links, or run commands (go to a page, quick add, switch theme, export a backup…). Start with `>` for commands only.
- **Quick add** for tasks, events, notes, study sessions, expenses, goals, habits and links (keys T, E, N, S, X, G, H, L while the menu is open)
- **Dark theme by default**, with a light theme. Your choice is remembered.
- **Settings:** theme and accent color, which dashboard widgets to show, your name, weather city, Pomodoro durations and sound, currency and budget, backup export/import, delete all data
- Works on desktop, tablet and phone. Respects the system "reduce motion" setting.
- **Keyboard:** `Ctrl+K` or `/` to search, `Q` for quick add, `?` for all shortcuts

## Your data

Everything is saved in your browser's `localStorage`, only on this computer and in this browser. A different browser or computer starts empty.

- **Back up:** Settings → Your data → **Export JSON**. Do this now and then. A reminder appears in the bell if you haven't for 14 days.
- **Restore:** Settings → Your data → **Import JSON**. The file is checked before anything changes, and your current data is downloaded as a safety copy first.
- **Automatic snapshots:** once a day, a full copy is kept inside the browser (IndexedDB), for the last 7 days. Settings → Your data → **Restore** goes back to one. Your current state is saved first, so even a restore can be undone.

## Project structure

```
index.html            the app frame (sidebar, top bar, page area)
css/
  base.css            colors (dark + light themes), fonts, buttons, form fields
  layout.css          sidebar, top bar, responsive layout
  components.css      cards, lists, badges, toasts, dialogs, menus
  widgets.css         styles for specific widgets and pages
  pages.css           tasks, calendar, habits, notes and notification styles
  study.css           Study Tracker, Pomodoro and timer pill styles
  personal.css        goals, expenses and favorite links styles
  analytics.css       charts, weekly widget, forecast, settings extras
  stage-b.css         projects & Kanban, planner, insights
  animations.css      all animations + reduced-motion support
js/
  icons.js            Lucide icons (copied in, so they work offline)
  storage.js          saving/loading data, numbered upgrade steps (migrations), import/export
  ui.js               shared helpers: toasts, dialogs, animations, confetti
  modules.js          the module registry: each feature registers its page, data,
                      search results, reminders, quick actions and widgets here
  backups.js          automatic daily snapshots (IndexedDB) and backup reminders
  widgets/            one file per feature (tasks, calendar, habits, notes, links, weather, …)
  charts.js           bar charts made of plain HTML (no chart library)
  insights.js         rule-based observations from your data
  notifications.js    the bell: reminders built from your tasks, events, habits, goals and budget
  views.js            the built-in Dashboard and Settings pages
  router.js           switches pages using the address (#/tasks, #/habits, …)
  shell.js            sidebar, theme toggle, search, quick add, keyboard shortcuts
  app.js              starts everything (loaded last)
tests/                automated tests (see tests/README.md)
```

### Adding a new module

1. Create `js/widgets/yourmodule.js` with the feature's code.
2. At the bottom, call `Modules.register({ id, nav, page, collections, search, notifications, quickAdd, widgets })`. `js/modules.js` explains each part.
3. Add one `<script>` line for it in `index.html`.

The sidebar, router, search, command palette, bell, quick add, dashboard and backups pick it up automatically.

Built with plain HTML, CSS and JavaScript: no frameworks, no build step. The scripts are normal `<script>` files (not JavaScript modules) on purpose, because browsers block modules when you open a file by double-clicking it.

Icons: [Lucide](https://lucide.dev) (ISC License).
