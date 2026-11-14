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
// WIDGET 2: To-do list
// =========================================

const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoList = document.getElementById("todo-list");
const todoEmpty = document.getElementById("todo-empty");

// Load saved tasks from localStorage (or start with an empty list).
// Each task looks like: { text: "Buy milk", done: false }
let todos = JSON.parse(localStorage.getItem("todos")) || [];

// Save the current tasks so they survive closing the browser
function saveTodos() {
  localStorage.setItem("todos", JSON.stringify(todos));
}

// Redraw the whole list from the `todos` array
function renderTodos() {
  todoList.innerHTML = ""; // clear the old list

  todos.forEach((todo, index) => {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.done ? " done" : "");

    // Checkbox to mark the task done / not done
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", () => {
      todos[index].done = checkbox.checked;
      saveTodos();
      renderTodos();
    });

    // The task text
    const text = document.createElement("span");
    text.textContent = todo.text;

    // Delete button
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = "✕";
    deleteButton.title = "Delete task";
    deleteButton.addEventListener("click", () => {
      todos.splice(index, 1); // remove 1 item at this position
      saveTodos();
      renderTodos();
    });

    li.append(checkbox, text, deleteButton);
    todoList.appendChild(li);
  });

  // Show the "No tasks yet" message only when the list is empty
  todoEmpty.style.display = todos.length === 0 ? "block" : "none";
}

// When the form is submitted (Add button or Enter key)
todoForm.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from reloading (forms do that by default)

  const text = todoInput.value.trim(); // trim() removes extra spaces
  if (text === "") return;             // ignore empty tasks

  todos.push({ text: text, done: false });
  saveTodos();
  renderTodos();
  todoInput.value = ""; // clear the box for the next task
});

// Draw the list when the page first loads
renderTodos();
