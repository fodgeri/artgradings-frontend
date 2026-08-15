/**
 * Stamps `data-theme="dark"` on <html> before first paint so a user who chose
 * dark does not get a flash of light on every navigation.
 *
 * Only dark is ever stamped. Light is the document default, so a visitor with
 * no stored choice — or with JavaScript disabled — gets light, which is also
 * exactly what the server rendered.
 */
const THEME_SCRIPT = `
try {
  if (localStorage.getItem("theme") === "dark") document.documentElement.dataset.theme = "dark";
} catch (e) {}
`.trim();

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
