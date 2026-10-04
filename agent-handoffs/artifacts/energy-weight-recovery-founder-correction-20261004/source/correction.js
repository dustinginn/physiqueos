const requested = new URLSearchParams(location.search).get('theme');
document.documentElement.dataset.theme = requested === 'light' ? 'light' : 'dark';
