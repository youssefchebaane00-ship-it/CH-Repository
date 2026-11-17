// =========================================================
// WELCOME BANNER: greeting, date, live clock, quote,
// today's progress and the time-of-day sky.
// =========================================================

const Welcome = {
  quotes: [
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
  ],
  quoteOffset: 0, // increases when you click "another quote"

  render(container) {
    container.innerHTML = `
      <div class="welcome-sky"></div>
      <div class="welcome-main">
        <p class="eyebrow">${icon("calendar")}<span data-date></span></p>
        <h2 data-greeting></h2>
        <p class="quote">
          ${icon("quote")}
          <span><span data-quote-text></span> <span class="quote-author" data-quote-author></span></span>
          <button class="btn-icon small" type="button" data-next-quote aria-label="Show another quote" title="Another quote">${icon("sparkles")}</button>
        </p>
      </div>
      <div class="welcome-side">
        <div class="clock" data-clock aria-label="Current time"></div>
        <div class="daily-progress">
          <div class="daily-progress-info">
            <span>Today's progress · <span data-stat="dailySub"></span></span>
            <strong data-stat="dailyPercent">0%</strong>
          </div>
          <div class="progress-track"><div class="progress-bar" data-stat-bar="daily"></div></div>
        </div>
      </div>`;

    container.querySelector("[data-next-quote]").addEventListener("click", () => {
      this.quoteOffset++;
      this.showQuote(container);
    });

    this.showQuote(container);
    this.tick();
  },

  // Same quote all day (based on the date); the button moves to the next one
  showQuote(container) {
    const daysSinceEpoch = Math.floor(Date.now() / 86400000);
    const quote = this.quotes[(daysSinceEpoch + this.quoteOffset) % this.quotes.length];
    container.querySelector("[data-quote-text]").textContent = `“${quote.text}”`;
    container.querySelector("[data-quote-author]").textContent = `— ${quote.author}`;
  },

  greetingFor(hour) {
    if (hour < 5) return "Good night";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  },

  periodFor(hour) {
    if (hour >= 5 && hour < 11) return "morning";
    if (hour >= 11 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  },

  // Called every second by app.js. Updates whatever clock/date elements exist right now.
  tick() {
    const now = new Date();
    const name = Store.get("settings").profileName.trim();
    const longDate = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    document.querySelectorAll("[data-clock]").forEach((el) => {
      el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    });
    document.querySelectorAll("[data-date]").forEach((el) => { el.textContent = longDate; });
    document.querySelectorAll("[data-greeting]").forEach((el) => {
      el.textContent = this.greetingFor(now.getHours()) + (name ? `, ${name}` : "") + " 👋";
    });

    document.getElementById("topbar-date").textContent = longDate;

    // The sky colors follow the time of day (only touch the page when it changes)
    const period = this.periodFor(now.getHours());
    if (document.documentElement.dataset.period !== period) {
      document.documentElement.dataset.period = period;
    }
  },
};
