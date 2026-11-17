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
  document.documentElement.dataset.theme = newTheme;
  save("theme", newTheme); // remember it for next time
  updateThemeButton();
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

// Redraw the whole list from the `todos` array
function renderTodos() {
  todoList.innerHTML = ""; // clear the old list

  todos.forEach((todo, index) => {
    const li = document.createElement("li");
    li.className = "item" + (todo.done ? " done" : "");

    // Checkbox to mark the task done / not done
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", () => {
      todos[index].done = checkbox.checked;
      save("todos", todos);
      renderTodos();
    });

    const text = document.createElement("span");
    text.textContent = todo.text;

    const deleteButton = makeDeleteButton("Delete task", () => {
      todos.splice(index, 1); // remove 1 item at this position
      save("todos", todos);
      renderTodos();
    });

    li.append(checkbox, text, deleteButton);
    todoList.appendChild(li);
  });

  // Show the "No tasks yet" message only when the list is empty
  todoEmpty.style.display = todos.length === 0 ? "block" : "none";
}

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = todoInput.value.trim(); // trim() removes extra spaces
  if (text === "") return;             // ignore empty tasks

  todos.push({ text: text, done: false });
  save("todos", todos);
  renderTodos();
  todoInput.value = ""; // clear the box for the next task
});

renderTodos();


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

function renderHabits() {
  habitList.innerHTML = "";
  const today = dateKey(new Date());

  habits.forEach((habit, index) => {
    const doneToday = habit.doneDays.includes(today);

    const li = document.createElement("li");
    li.className = "item" + (doneToday ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = doneToday;
    checkbox.title = "Done today?";
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        habit.doneDays.push(today);
      } else {
        habit.doneDays = habit.doneDays.filter((d) => d !== today);
      }
      save("habits", habits);
      renderHabits();
    });

    const name = document.createElement("span");
    name.textContent = habit.name;

    const streak = document.createElement("span");
    streak.className = "streak";
    const days = countStreak(habit.doneDays);
    streak.textContent = `🔥 ${days} day${days === 1 ? "" : "s"}`;
    streak.style.flex = "0"; // don't stretch like the name does

    const deleteButton = makeDeleteButton("Delete habit", () => {
      habits.splice(index, 1);
      save("habits", habits);
      renderHabits();
    });

    li.append(checkbox, name, streak, deleteButton);
    habitList.appendChild(li);
  });

  habitEmpty.style.display = habits.length === 0 ? "block" : "none";
}

habitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = habitInput.value.trim();
  if (name === "") return;

  habits.push({ name: name, doneDays: [] });
  save("habits", habits);
  renderHabits();
  habitInput.value = "";
});

renderHabits();


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

function renderLinks() {
  linkList.innerHTML = "";

  links.forEach((link, index) => {
    const chip = document.createElement("div");
    chip.className = "link-chip";

    const a = document.createElement("a");
    a.href = link.url;
    a.textContent = link.name;
    a.target = "_blank";   // open in a new tab
    a.rel = "noopener";    // safety habit for links that open new tabs

    const deleteButton = makeDeleteButton(`Remove ${link.name}`, () => {
      links.splice(index, 1);
      save("links", links);
      renderLinks();
    });

    chip.append(a, deleteButton);
    linkList.appendChild(chip);
  });

  linkEmpty.style.display = links.length === 0 ? "block" : "none";
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

  links.push({ name: name, url: url });
  save("links", links);
  renderLinks();
  linkNameInput.value = "";
  linkUrlInput.value = "";
});

renderLinks();
