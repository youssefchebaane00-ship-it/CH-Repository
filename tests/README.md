# Automated tests

These tests open the app in a hidden Microsoft Edge window, click through real features
(adding, editing, deleting, timers, imports…) and check the results.

They run on a **copy** of the app with an **empty test profile**, so your real data is never touched.

## Run them

From the project folder, in a VS Code terminal:

```
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
```

Options:

- `-Only phase3` runs only files whose name contains "phase3"
- `-Phone` uses a narrow window with "reduce motion" turned on

The last line shows the total. Any failure is listed with its name, so you know exactly what broke.

## Files

| File | What it checks |
|---|---|
| `seed-v1.html` | Fills the test browser with data in the old version 1 format before each test, so every run also checks the upgrade |
| `phase2.test.js` | Tasks, calendar, habits, notes, notifications, search |
| `phase3.test.js` | Study Tracker and Pomodoro (with a faked clock) |
| `phase4.test.js` | Goals, expenses, favorite links, quick actions |
| `phase5.test.js` | Analytics, forecast, settings, import validation, shortcuts |
| `stage-a.test.js` | Module registry, snapshots, backup reminders, command palette (runs on the real clock because it uses IndexedDB) |
| `stage-b.test.js` | Projects & Kanban, dependencies, planner suggestions & conflicts, insights |
| `stage-c.test.js` | Knowledge Hub (links, backlinks, rename, search, graph) and achievements (XP, levels, challenges) |
| `stage-c-pwa.test.js` | Installable app: manifest, service worker, offline cache (runs from a local web server) |

## Good habit

Run the tests **before every commit**. If something fails, fix it first. That's how the app stays reliable as it grows.
