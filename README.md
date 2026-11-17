# Personal Dashboard

A simple personal start page that runs entirely in your web browser. No installation, no account, no server.

## Features

- 👋 **Greeting and clock**: says good morning, afternoon or evening, with the live time and date
- 💬 **Daily quote**: a new motivational quote each day
- 🌦️ **Weather**: current weather for your city (remembered for next time)
- ✅ **To-do list**: add, tick off and delete tasks
- 🔥 **Habit tracker**: tick habits daily and build streaks
- 📝 **Quick notes**: a notepad that saves automatically
- 🔗 **Favorite links**: one-click shortcuts to the sites you use most
- 🌙 **Dark mode**: switches automatically with your system setting

## How to use it

1. Download or copy this folder.
2. Double-click `index.html`. It opens in your browser.

That's it. Tip: set it as your browser's home page so it greets you every time.

## How it's built

| File | Role |
|---|---|
| `index.html` | The structure: which widgets are on the page |
| `style.css` | The look: colors, layout, light and dark mode |
| `script.js` | The behavior: the clock, saving tasks, loading the weather, and so on |

- Plain **HTML, CSS and JavaScript**. No frameworks and no build step.
- Your tasks, habits, notes and links are saved in your browser's **localStorage**. They stay on your computer and are never uploaded anywhere. They're saved only in the browser you use, so a different browser or computer starts empty.
- Weather data comes from [Open-Meteo](https://open-meteo.com/), a free service that needs no account or API key.

## Customizing

- **Colors:** edit the values at the top of `style.css`. There's one set for light mode and one for dark mode.
- **Quotes:** add your own to the `quotes` list in `script.js`.
