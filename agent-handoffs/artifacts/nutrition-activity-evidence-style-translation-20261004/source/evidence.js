const theme = new URLSearchParams(window.location.search).get("theme") === "light" ? "light" : "dark";
document.documentElement.dataset.theme = theme;
