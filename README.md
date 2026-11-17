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
- **Notifications** (bell): overdue tasks, tasks and events today, tomorrow's events, habits left today
- **Weather:** current weather for any city (default: Tunis), via [Open-Meteo](https://open-meteo.com/) (free, no API key)
- **Favorite links**
- **Global search** (`Ctrl+K` or `/`) across tasks, events, habits, notes and links
- **Quick add** for tasks, events, notes, habits and links (keys T, E, N, H, L while the menu is open)
- **Dark theme by default**, with a light theme. Your choice is remembered.
- **Settings:** theme, your name, default weather city, **backup export (JSON)**
- Works on desktop, tablet and phone. Respects the system "reduce motion" setting.

Study Tracker, Goals, Expenses and Analytics are marked **"Soon"** in the sidebar and come in later phases.

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
