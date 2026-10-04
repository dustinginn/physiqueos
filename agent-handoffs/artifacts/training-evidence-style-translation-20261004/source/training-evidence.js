const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.querySelectorAll('[data-theme-label]').forEach(node => {
  node.textContent = theme === 'light' ? 'Mineral light' : 'Dark';
});
