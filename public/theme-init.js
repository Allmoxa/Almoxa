try {
  if (localStorage.getItem("almoxa-theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}
