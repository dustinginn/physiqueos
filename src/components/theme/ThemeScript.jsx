export default function ThemeScript() {
  const code = `
    (function () {
      try {
        var stored = window.localStorage.getItem("physiqueos-theme") || "system";
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var resolved = stored === "system" ? (systemDark ? "dark" : "light") : stored;
        document.documentElement.classList.toggle("dark", resolved === "dark");
        document.documentElement.dataset.theme = resolved;
        document.documentElement.dataset.themePreference = stored;
      } catch (error) {
        document.documentElement.dataset.themePreference = "system";
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
