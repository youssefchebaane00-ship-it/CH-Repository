// =========================================================
// WEATHER widget
// Uses Open-Meteo (open-meteo.com): free, no account or API key.
// Step 1: city name → coordinates.  Step 2: coordinates → weather.
// =========================================================

const Weather = {
  cache: null,                     // last result, so switching pages doesn't re-download
  CACHE_MINUTES: 10,
  lastRequest: 0,

  render(container) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon">${icon("cloud-sun")}</span>Weather</h3>
        <button class="btn-icon small" type="button" data-refresh aria-label="Refresh weather" title="Refresh">${icon("refresh-cw")}</button>
      </div>
      <form class="add-form" data-form>
        <input class="input" type="text" placeholder="Search a city…" aria-label="City" autocomplete="off" maxlength="80">
        <button class="btn btn-secondary" type="submit" aria-label="Show weather">${icon("search")}</button>
      </form>
      <div class="weather-body" data-body></div>`;

    const input = container.querySelector("input");
    const body = container.querySelector("[data-body]");
    const city = Store.get("settings").weatherCity || "Tunis";
    input.value = city;

    container.querySelector("[data-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value) this.load(value, body, { force: true });
    });
    container.querySelector("[data-refresh]").addEventListener("click", () => {
      this.load(input.value.trim() || city, body, { force: true });
    });

    this.load(city, body);
  },

  // Weather code → [Lucide icon, description]
  describe(code, isDay) {
    if (code === 0) return [isDay ? "sun" : "moon", "Clear sky"];
    if (code <= 2) return [isDay ? "cloud-sun" : "cloud", "Partly cloudy"];
    if (code === 3) return ["cloud", "Overcast"];
    if (code <= 48) return ["cloud-fog", "Fog"];
    if (code <= 57) return ["cloud-drizzle", "Drizzle"];
    if (code <= 67) return ["cloud-rain", "Rain"];
    if (code <= 77) return ["cloud-snow", "Snow"];
    if (code <= 82) return ["cloud-rain", "Rain showers"];
    if (code <= 86) return ["cloud-snow", "Snow showers"];
    return ["cloud-lightning", "Thunderstorm"];
  },

  message(body, iconName, text, spinning = false) {
    body.innerHTML = `<div class="weather-message">${icon(iconName, spinning ? "spinner" : "")}<span>${UI.escape(text)}</span></div>`;
  },

  async load(city, body, { force = false } = {}) {
    const fresh = this.cache && Date.now() - this.cache.time < this.CACHE_MINUTES * 60000;
    if (!force && fresh && this.cache.city.toLowerCase() === city.toLowerCase()) {
      this.show(body, this.cache.place, this.cache.current);
      return;
    }

    if (!navigator.onLine) {
      this.message(body, "cloud", "You're offline. Connect to the internet to see the weather.");
      return;
    }

    this.message(body, "loader-circle", `Loading weather for ${city}…`, true);

    // If you search again before this finishes, only the newest answer is shown
    const requestId = ++this.lastRequest;
    const isOutdated = () => requestId !== this.lastRequest;

    try {
      const geoResponse = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(city));
      if (!geoResponse.ok) throw new Error("geocoding failed");
      const geo = await geoResponse.json();
      if (isOutdated()) return;

      if (!geo.results || geo.results.length === 0) {
        this.message(body, "map-pin", `Couldn't find “${city}”. Check the spelling?`);
        return;
      }
      const place = geo.results[0];

      const weatherResponse = await fetch(
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${place.latitude}&longitude=${place.longitude}` +
        "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day");
      if (!weatherResponse.ok) throw new Error("forecast failed");
      const data = await weatherResponse.json();
      if (isOutdated()) return;
      if (!data.current) throw new Error("no current weather");

      this.cache = { city, place, current: data.current, time: Date.now() };
      Store.setSetting("weatherCity", city); // remember the last city that worked
      this.show(body, place, data.current);
    } catch {
      if (isOutdated()) return;
      this.message(body, "cloud", "Couldn't load the weather right now. Please try again in a moment.");
    }
  },

  show(body, place, now) {
    const [iconName, label] = this.describe(now.weather_code, now.is_day !== 0);
    const where = place.name + (place.country ? `, ${place.country}` : "");
    body.innerHTML = `
      <div class="weather-main">
        <div class="weather-icon">${icon(iconName)}</div>
        <div>
          <div class="weather-temp">${Math.round(now.temperature_2m)}°C</div>
          <div class="weather-place">${UI.escape(label)} · ${UI.escape(where)}</div>
        </div>
      </div>
      <div class="weather-details">
        <div class="weather-detail">Feels like<strong>${Math.round(now.apparent_temperature)}°C</strong></div>
        <div class="weather-detail">Humidity<strong>${Math.round(now.relative_humidity_2m)}%</strong></div>
        <div class="weather-detail">Wind<strong>${Math.round(now.wind_speed_10m)} km/h</strong></div>
      </div>`;
    UI.replayAnimation(body, "fade-in");
  },
};
