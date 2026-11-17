# PersonalDashboard

A personal productivity app that runs entirely in your web browser. No installation, no account, no server.

## How to use it

Double-click `index.html`. It opens in your browser.

Tip: bookmark it or set it as your browser's home page.

## Features (Phase 1)

- **App layout:** collapsible sidebar, top bar, and pages that switch without reloading (the browser's back/forward buttons work)
- **Dashboard:** greeting, live clock, daily quote, today's progress and 4 statistics calculated from your real data
- **Tasks:** add, tick off (the line draws itself), delete with **Undo**
- **Habits:** daily check-ins, streaks with a growing 🔥, today's progress bar, last-7-days view, confetti when everything's done
- **Quick note:** saves automatically while you type
- **Weather:** current weather for any city (default: Tunis), via [Open-Meteo](https://open-meteo.com/) (free, no API key)
- **Favorite links**
- **Global search** (`Ctrl+K` or `/`) across tasks, habits, notes and links
- **Quick add** menu for tasks, habits, links and notes
- **Dark theme by default**, with a light theme. Your choice is remembered.
- **Settings:** theme, your name, default weather city, **backup export (JSON)**
- Works on desktop, tablet and phone. Respects the system "reduce motion" setting.

Calendar, Study Tracker, Goals, Expenses and Analytics are marked **"Soon"** in the sidebar and come in later phases.

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
  animations.css      all animations + reduced-motion support
js/
  icons.js            Lucide icons (copied in, so they work offline)
  storage.js          saving/loading data + upgrading data from older versions
  ui.js               shared helpers: toasts, dialogs, animations, confetti
  widgets/            one file per widget (tasks, habits, notes, links, weather, …)
  views.js            one function per page + the sidebar menu list
  router.js           switches pages using the address (#/tasks, #/habits, …)
  shell.js            sidebar, theme toggle, search, quick add, keyboard shortcuts
  app.js              starts everything (loaded last)
```

Built with plain HTML, CSS and JavaScript: no frameworks, no build step. The scripts are normal `<script>` files (not JavaScript modules) on purpose, because browsers block modules when you open a file by double-clicking it.

Icons: [Lucide](https://lucide.dev) (ISC License).
