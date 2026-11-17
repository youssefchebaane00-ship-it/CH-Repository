# PersonalDashboard

A personal productivity app that runs entirely in your web browser. No installation, no account, no server.

## How to use it

Double-click `index.html`. It opens in your browser.

Tip: bookmark it or set it as your browser's home page.

## Features

- **App layout:** collapsible sidebar, top bar, and pages that switch without reloading (the browser's back/forward buttons work)
- **Dashboard:** greeting, live clock, daily quote, today's progress, 4 statistics from your real data, today's tasks, habits, upcoming events, weather, quick note, links
- **Tasks:** title, description, priority (High/Medium/Low), due date, category, tags. Filters (All, Today, Upcoming, Overdue, Completed), category filter, sorting, overdue warnings, edit dialog, delete with **Undo**
- **Calendar:** month and week views, day agenda, events typed as Event, Deadline, Exam or Personal, with optional times. Tasks with due dates appear on their day. Double-click a day to add an event.
- **Habits:** daily or weekly (“3× per week”) habits, current and longest streaks, completion rates, weekly and monthly check-in counts, 6-month heatmaps. History is never erased.
- **Notes:** multiple notes with title, category, tags, pinning, search, timestamps and autosave. The dashboard quick note can be saved as a note.
- **Study Tracker:** subjects with colors and weekly goals; a study stopwatch (start, pause, resume, stop & save, with the duration checked before saving); manual sessions; totals for today, this week, this month and per subject; a 7-day chart and session history
- **Pomodoro:** 25/5/15 by default (changeable in Settings), start/pause/resume/reset/skip, long break after every 4 focus sessions, chime when a period ends, daily counter. Finished focus periods are logged to the chosen subject automatically.
- Running timers keep going across pages, refreshes and closed tabs, and show in the top bar and the browser tab title
- **Notifications** (bell): overdue tasks, tasks and events today, tomorrow's events, habits left today
- **Weather:** current weather for any city (default: Tunis), via [Open-Meteo](https://open-meteo.com/) (free, no API key)
- **Favorite links**
- **Global search** (`Ctrl+K` or `/`) across tasks, events, habits, notes and links
- **Quick add** for tasks, events, notes, habits and links (keys T, E, N, H, L while the menu is open)
- **Dark theme by default**, with a light theme. Your choice is remembered.
- **Settings:** theme, your name, default weather city, **backup export (JSON)**
- Works on desktop, tablet and phone. Respects the system "reduce motion" setting.

Goals, Expenses and Analytics are marked **"Soon"** in the sidebar and come in later phases.

## Your data

Everything is saved in your browser's `localStorage`, only on this computer and in this browser. Use **Settings → Export JSON** now and then to keep a backup.

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
  animations.css      all animations + reduced-motion support
js/
  icons.js            Lucide icons (copied in, so they work offline)
  storage.js          saving/loading data + upgrading data from older versions
  ui.js               shared helpers: toasts, dialogs, animations, confetti
  widgets/            one file per feature (tasks, calendar, habits, notes, links, weather, …)
  notifications.js    the bell: reminders built from your tasks, events and habits
  views.js            one function per page + the sidebar menu list
  router.js           switches pages using the address (#/tasks, #/habits, …)
  shell.js            sidebar, theme toggle, search, quick add, keyboard shortcuts
  app.js              starts everything (loaded last)
```

Built with plain HTML, CSS and JavaScript: no frameworks, no build step. The scripts are normal `<script>` files (not JavaScript modules) on purpose, because browsers block modules when you open a file by double-clicking it.

Icons: [Lucide](https://lucide.dev) (ISC License).
