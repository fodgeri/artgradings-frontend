/**
 * Stamps `data-theme` on <html> before first paint so a user who chose dark
 * does not get a flash of the light theme on every navigation.
 *
 * It deliberately stamps NOTHING when no choice has been recorded. That is
 * what leaves the `prefers-color-scheme` block in globals.css authoritative,
 * and it is why a visitor with JavaScript disabled still gets the theme their
 * system asked for.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem("theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (e) {}
`.trim();

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
