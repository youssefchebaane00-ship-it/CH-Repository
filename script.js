// =========================================
// HELPERS: small tools used by several widgets
// =========================================

// Read something saved in localStorage. If nothing is saved yet, return `fallback`.
function load(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved);
  } catch {
    return fallback; // storage blocked or data broken: just start fresh
  }
}

// Save something to localStorage (it's turned into text with JSON.stringify)
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked (e.g. private window): the page still works, it just won't remember
  }
}

// Turn a date into a simple text key like "2026-11-14" (using your local time)
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0"); // months start at 0!
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Build a small "✕" delete button that runs `onClick` when pressed
function makeDeleteButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "delete-button";
  button.textContent = "✕";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

// Build the text part of a task/habit: <span class="item-text"><span class="item-label">…</span></span>
// (Two layers: the outer one fills the row, the inner one hugs the words so the
//  "crossed out" line is exactly as long as the text.)
function makeItemText(words) {
  const outer = document.createElement("span");
  outer.className = "item-text";
  const label = document.createElement("span");
  label.className = "item-label";
  label.textContent = words;
  outer.appendChild(label);
  return outer;
}

// Show the "nothing here yet" message only when a list is empty
function updateEmptyMessage(list, message) {
  message.style.display = list.children.length === 0 ? "block" : "none";
}

// =========================================
// ANIMATION HELPERS
// =========================================

// Is "Animation effects" switched off in Windows? Then we skip the movement.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Play a CSS animation class on an element, even if it played before.
// (Removing and re-adding a class doesn't restart an animation on its own;
//  reading offsetWidth in between forces the browser to notice the change.)
function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// Play the "leaving" animation, THEN run `whenDone` (which removes the item)
function removeWithAnimation(element, whenDone) {
  if (reduceMotion.matches) {
    whenDone();
    return;
  }
  element.classList.add("leaving");
  setTimeout(whenDone, 250); // 250 ms = the length of the animation in style.css
}

// 🎊 Confetti! Draws ~150 little colored paper pieces on a temporary
// <canvas> (a drawing surface) that covers the screen, then removes it.
function launchConfetti() {
  if (reduceMotion.matches) return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed; inset:0; pointer-events:none; z-index:1000;";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const colors = ["#0d9488", "#2dd4bf", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa"];
  const pieces = [];

  // Create the pieces: they all start in the middle and shoot outwards/upwards
  for (let i = 0; i < 150; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    pieces.push({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: Math.cos(angle) * speed,            // horizontal speed
      vy: Math.sin(angle) * speed - 6,        // vertical speed (negative = up)
      size: 6 + Math.random() * 6,
      color: colors[i % colors.length],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
    });
  }

  const startTime = performance.now();

  // Draw one "frame", then ask the browser to call us again for the next one
  function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of pieces) {
      p.vy += 0.25;   // gravity pulls down a bit more every frame
      p.vx *= 0.99;   // air slows them down slightly
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); // a small rectangle
      ctx.restore();
    }

    if (now - startTime < 3000) {
      requestAnimationFrame(frame); // keep going for 3 seconds...
    } else {
      canvas.remove();              // ...then clean up
    }
  }

  requestAnimationFrame(frame);
}


// =========================================
// THEME BUTTON: switch between light and dark
// =========================================
// The chosen theme is stored as an attribute on the <html> tag:
// <html data-theme="dark"> or <html data-theme="light">.
// style.css picks the colors based on that attribute.

const themeButton = document.getElementById("theme-toggle");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

// Which theme is showing right now?
function currentTheme() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen) return chosen;                  // you picked one with the button
  return systemDark.matches ? "dark" : "light"; // otherwise, follow Windows
}

// Update the button's icon: show the mode you'd switch TO
function updateThemeButton() {
  const isDark = currentTheme() === "dark";
  themeButton.textContent = isDark ? "☀️" : "🌙";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  themeButton.title = label;
  themeButton.setAttribute("aria-label", label);
}

themeButton.addEventListener("click", () => {
  const newTheme = currentTheme() === "dark" ? "light" : "dark";

  function applyTheme() {
    document.documentElement.dataset.theme = newTheme;
    save("theme", newTheme); // remember it for next time
    updateThemeButton();
  }

  // startViewTransition takes a "photo" of the page, applies the change,
  // then cross-fades from the photo to the new look. Older browsers don't
  // have it, so there we just switch instantly.
  if (document.startViewTransition && !reduceMotion.matches) {
    document.startViewTransition(applyTheme);
  } else {
    applyTheme();
  }
});

// If Windows changes mode while the page is open, keep the icon correct
systemDark.addEventListener("change", updateThemeButton);

updateThemeButton();


// =========================================
// WIDGET 1: Greeting + Clock
// =========================================

function updateClock() {
  const now = new Date(); // the current date and time

  // Show the time, e.g. "14:05:09"
  document.getElementById("clock").textContent = now.toLocaleTimeString();

  // Show the date, e.g. "Saturday, November 14, 2026"
  document.getElementById("date").textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Pick a greeting based on the hour (0–23)
  const hour = now.getHours();
  let greeting;
  if (hour < 12) {
    greeting = "Good morning! ☀️";
  } else if (hour < 18) {
    greeting = "Good afternoon! 🌤️";
  } else {
    greeting = "Good evening! 🌙";
  }
  document.getElementById("greeting").textContent = greeting;

  // Tell the CSS which part of the day it is, so the background sky matches
  let period;
  if (hour >= 5 && hour < 11) period = "morning";
  else if (hour >= 11 && hour < 17) period = "afternoon";
  else if (hour >= 17 && hour < 21) period = "evening";
  else period = "night";

  // Only touch the page when the period actually changes (not every second)
  if (document.documentElement.dataset.period !== period) {
    document.documentElement.dataset.period = period;
  }
}

updateClock();                   // run once right away...
setInterval(updateClock, 1000);  // ...then again every 1000 ms (1 second)


// =========================================
// WIDGET 2: Daily quote
// =========================================
// A built-in list, so no internet is needed. The same quote shows all day,
// and a new one appears tomorrow.

const quotes = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Small steps every day add up to big results.", author: "Unknown" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "Learning never exhausts the mind.", author: "Leonardo da Vinci" },
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
];

function showDailyQuote() {
  // Count how many days have passed since 1 Jan 1970, then use the
  // remainder (%) to pick a position in the list. Same day = same quote.
  const daysSinceEpoch = Math.floor(Date.now() / 86400000);
  const quote = quotes[daysSinceEpoch % quotes.length];

  document.getElementById("quote-text").textContent = `“${quote.text}”`;
  document.getElementById("quote-author").textContent = `— ${quote.author}`;
}

showDailyQuote();


// =========================================
// WIDGET 3: Weather
// =========================================
// Uses Open-Meteo (open-meteo.com): a free weather service that needs no account.
// Step 1: turn the city name into coordinates (latitude/longitude).
// Step 2: ask for the current weather at those coordinates.

const weatherForm = document.getElementById("weather-form");
const weatherInput = document.getElementById("weather-input");
const weatherResult = document.getElementById("weather-result");

// Open-Meteo describes the sky with a number code. This turns it into words + an emoji.
function describeWeather(code) {
  if (code === 0) return ["☀️", "Clear sky"];
  if (code <= 2) return ["🌤️", "Partly cloudy"];
  if (code === 3) return ["☁️", "Cloudy"];
  if (code <= 48) return ["🌫️", "Fog"];
  if (code <= 57) return ["🌦️", "Drizzle"];
  if (code <= 67) return ["🌧️", "Rain"];
  if (code <= 77) return ["❄️", "Snow"];
  if (code <= 82) return ["🌧️", "Rain showers"];
  if (code <= 86) return ["🌨️", "Snow showers"];
  return ["⛈️", "Thunderstorm"];
}

function showWeatherMessage(message) {
  weatherResult.innerHTML = "";
  const p = document.createElement("p");
  p.className = "empty-message";
  p.textContent = message;
  weatherResult.appendChild(p);
}

// `async` lets us use `await`, which means "wait for the internet to answer, then continue"
async function loadWeather(city) {
  showWeatherMessage("Loading…");

  try {
    // Step 1: find the city
    const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(city);
    const geoData = await (await fetch(geoUrl)).json();

    if (!geoData.results || geoData.results.length === 0) {
      showWeatherMessage(`Couldn't find "${city}". Check the spelling?`);
      return;
    }
    const place = geoData.results[0];

    // Step 2: get the weather there
    const weatherUrl =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m";
    const weatherData = await (await fetch(weatherUrl)).json();
    const now = weatherData.current;

    const [icon, label] = describeWeather(now.weather_code);

    // Build the result. We use textContent (not innerHTML) for text that came
    // from the internet, which is a good safety habit.
    weatherResult.innerHTML = `
      <div class="weather-main">
        <div class="weather-icon"></div>
        <div>
          <div class="weather-temp"></div>
          <div class="weather-place"></div>
        </div>
      </div>
      <p class="weather-details"></p>
    `;
    weatherResult.querySelector(".weather-icon").textContent = icon;
    weatherResult.querySelector(".weather-temp").textContent = `${Math.round(now.temperature_2m)}°C`;
    weatherResult.querySelector(".weather-place").textContent =
      `${label} · ${place.name}${place.country ? ", " + place.country : ""}`;
    weatherResult.querySelector(".weather-details").textContent =
      `Feels like ${Math.round(now.apparent_temperature)}°C · ` +
      `Humidity ${now.relative_humidity_2m}% · Wind ${Math.round(now.wind_speed_10m)} km/h`;
    replayAnimation(weatherResult, "fade-in"); // fade the new weather in

    save("weatherCity", city); // remember the city for next time
  } catch {
    showWeatherMessage("Couldn't load the weather. Are you connected to the internet?");
  }
}

weatherForm.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from reloading
  const city = weatherInput.value.trim();
  if (city !== "") loadWeather(city);
});

// If a city was saved last time, show its weather straight away
const savedCity = load("weatherCity", "");
if (savedCity) {
  weatherInput.value = savedCity;
  loadWeather(savedCity);
}


// =========================================
// WIDGET 4: To-do list
// =========================================

const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoList = document.getElementById("todo-list");
const todoEmpty = document.getElementById("todo-empty");

// Each task looks like: { text: "Buy milk", done: false }
let todos = load("todos", []);

// Build ONE task row. We only touch the row that changes (instead of
// redrawing the whole list), so animations play only where they should.
function createTodoItem(todo) {
  const li = document.createElement("li");
  li.className = "item" + (todo.done ? " done" : "");

  // Checkbox to mark the task done / not done
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.done;
  checkbox.addEventListener("change", () => {
    todo.done = checkbox.checked;
    save("todos", todos);
    li.classList.toggle("done", todo.done); // CSS draws (or erases) the line smoothly
    if (todo.done) {
      replayAnimation(checkbox, "pop");
      // Was that the last unfinished task? Celebrate!
      if (todos.every((t) => t.done)) launchConfetti();
    }
  });

  const deleteButton = makeDeleteButton("Delete task", () => {
    deleteButton.disabled = true; // ignore double-clicks while it animates away
    removeWithAnimation(li, () => {
      li.remove();
      todos = todos.filter((t) => t !== todo); // keep every task except this one
      save("todos", todos);
      updateEmptyMessage(todoList, todoEmpty);
    });
  });

  li.append(checkbox, makeItemText(todo.text), deleteButton);
  return li;
}

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = todoInput.value.trim(); // trim() removes extra spaces
  if (text === "") return;             // ignore empty tasks

  const todo = { text: text, done: false };
  todos.push(todo);
  save("todos", todos);

  const li = createTodoItem(todo);
  li.classList.add("entering"); // slide in
  todoList.appendChild(li);
  updateEmptyMessage(todoList, todoEmpty);
  todoInput.value = ""; // clear the box for the next task
});

// Draw the saved tasks when the page first loads
todos.forEach((todo) => todoList.appendChild(createTodoItem(todo)));
updateEmptyMessage(todoList, todoEmpty);


// =========================================
// WIDGET 5: Habit tracker
// =========================================
// Each habit remembers the days you completed it, e.g.
// { name: "Read", doneDays: ["2026-11-13", "2026-11-14"] }
// The "streak" is how many days in a row you've done it.

const habitForm = document.getElementById("habit-form");
const habitInput = document.getElementById("habit-input");
const habitList = document.getElementById("habit-list");
const habitEmpty = document.getElementById("habit-empty");

let habits = load("habits", []);

function countStreak(doneDays) {
  const day = new Date();

  // If you haven't done it yet today, the streak can still continue from yesterday
  if (!doneDays.includes(dateKey(day))) {
    day.setDate(day.getDate() - 1);
  }

  // Walk backwards one day at a time while the habit was done
  let streak = 0;
  while (doneDays.includes(dateKey(day))) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

// Fill in a streak badge: "🔥 3 days". The flame gets bigger for longer
// streaks: data-level="1" from 3 days, "2" from 7 days (sizes are in style.css).
function showStreak(badge, habit) {
  const days = countStreak(habit.doneDays);

  badge.innerHTML = "";
  const flame = document.createElement("span");
  flame.className = "flame";
  flame.textContent = "🔥";
  badge.append(flame, ` ${days} day${days === 1 ? "" : "s"}`);

  badge.dataset.level = days >= 7 ? 2 : days >= 3 ? 1 : 0;
  return days;
}

// Update the "Today 2 / 3" progress bar at the top of the habits card
const habitProgress = document.getElementById("habit-progress");
const habitProgressText = document.getElementById("habit-progress-text");
const habitProgressBar = document.getElementById("habit-progress-bar");

function updateHabitProgress() {
  const today = dateKey(new Date());
  const total = habits.length;
  const done = habits.filter((h) => h.doneDays.includes(today)).length;

  habitProgress.style.display = total === 0 ? "none" : "block"; // hide when there are no habits
  habitProgressBar.style.width = total === 0 ? "0%" : (done / total) * 100 + "%";

  const allDone = total > 0 && done === total;
  habitProgress.classList.toggle("complete", allDone);
  habitProgressText.textContent = allDone ? `🎉 ${done} / ${total} — all done!` : `${done} / ${total}`;
  return allDone;
}

// Build ONE habit row (same idea as the to-do list)
function createHabitItem(habit) {
  const doneToday = habit.doneDays.includes(dateKey(new Date()));

  const li = document.createElement("li");
  li.className = "item" + (doneToday ? " done" : "");

  const streak = document.createElement("span");
  streak.className = "streak";
  showStreak(streak, habit);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = doneToday;
  checkbox.title = "Done today?";
  checkbox.addEventListener("change", () => {
    const today = dateKey(new Date());
    if (checkbox.checked) {
      habit.doneDays.push(today);
      replayAnimation(checkbox, "pop");
    } else {
      habit.doneDays = habit.doneDays.filter((d) => d !== today);
    }
    save("habits", habits);
    li.classList.toggle("done", checkbox.checked);

    // Update just the badge; bounce it if the streak went up
    const daysBefore = countStreak(habit.doneDays.filter((d) => d !== today));
    const daysNow = showStreak(streak, habit);
    if (daysNow > daysBefore) replayAnimation(streak, "bump");

    // Fill the progress bar; confetti if this was the last habit for today
    const allDone = updateHabitProgress();
    if (checkbox.checked && allDone) launchConfetti();
  });

  const deleteButton = makeDeleteButton("Delete habit", () => {
    deleteButton.disabled = true;
    removeWithAnimation(li, () => {
      li.remove();
      habits = habits.filter((h) => h !== habit);
      save("habits", habits);
      updateEmptyMessage(habitList, habitEmpty);
      updateHabitProgress();
    });
  });

  li.append(checkbox, makeItemText(habit.name), streak, deleteButton);
  return li;
}

habitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = habitInput.value.trim();
  if (name === "") return;

  const habit = { name: name, doneDays: [] };
  habits.push(habit);
  save("habits", habits);

  const li = createHabitItem(habit);
  li.classList.add("entering");
  habitList.appendChild(li);
  updateEmptyMessage(habitList, habitEmpty);
  updateHabitProgress();
  habitInput.value = "";
});

habits.forEach((habit) => habitList.appendChild(createHabitItem(habit)));
updateEmptyMessage(habitList, habitEmpty);
updateHabitProgress();


// =========================================
// WIDGET 6: Quick notes
// =========================================
// Saves automatically a moment after you stop typing.

const notes = document.getElementById("notes");
const notesStatus = document.getElementById("notes-status");
let notesTimer;

notes.value = load("notes", "");

notes.addEventListener("input", () => {
  notesStatus.textContent = "Typing…";

  // Restart a short timer on every keystroke. Only when you pause for
  // half a second do we actually save (so we don't save on every letter).
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    save("notes", notes.value);
    notesStatus.textContent = "Saved ✓";
  }, 500);
});


// =========================================
// WIDGET 7: Favorite links
// =========================================

const linkForm = document.getElementById("link-form");
const linkNameInput = document.getElementById("link-name");
const linkUrlInput = document.getElementById("link-url");
const linkList = document.getElementById("link-list");
const linkEmpty = document.getElementById("link-empty");

// A few examples to start with (you can delete them)
let links = load("links", [
  { name: "Google", url: "https://www.google.com" },
  { name: "YouTube", url: "https://www.youtube.com" },
  { name: "Gmail", url: "https://mail.google.com" },
]);

// Build ONE link chip
function createLinkChip(link) {
  const chip = document.createElement("div");
  chip.className = "link-chip";

  const a = document.createElement("a");
  a.href = link.url;
  a.textContent = link.name;
  a.target = "_blank";   // open in a new tab
  a.rel = "noopener";    // safety habit for links that open new tabs

  const deleteButton = makeDeleteButton(`Remove ${link.name}`, () => {
    deleteButton.disabled = true;
    removeWithAnimation(chip, () => {
      chip.remove();
      links = links.filter((l) => l !== link);
      save("links", links);
      updateEmptyMessage(linkList, linkEmpty);
    });
  });

  chip.append(a, deleteButton);
  return chip;
}

linkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = linkNameInput.value.trim();
  let url = linkUrlInput.value.trim();
  if (name === "" || url === "") return;

  // Let people type "youtube.com" and add the "https://" for them
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  const link = { name: name, url: url };
  links.push(link);
  save("links", links);

  const chip = createLinkChip(link);
  chip.classList.add("entering");
  linkList.appendChild(chip);
  updateEmptyMessage(linkList, linkEmpty);
  linkNameInput.value = "";
  linkUrlInput.value = "";
});

links.forEach((link) => linkList.appendChild(createLinkChip(link)));
updateEmptyMessage(linkList, linkEmpty);
