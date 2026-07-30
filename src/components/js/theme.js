/**
 * Prevent FOUC (Flash of Unstyled Content)
 *
 * Add this inline script to the <head> of your HTML — before any stylesheets.
 * It must run synchronously so the class is applied before the first paint.
 *
 * <script>
 *   {
 *     const theme = localStorage.getItem('theme') || 'system';
 *     const isDark = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
 *     document.documentElement.classList.toggle('dark', isDark);
 *     document.documentElement.classList.toggle('light', !isDark && theme !== 'system');
 *   }
 * <\/script>
 */
export const setTheme = (theme) => {
  const isDark =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle(
    'light',
    !isDark && theme !== 'system'
  );
  localStorage.setItem('theme', theme);
  document.dispatchEvent(
    new CustomEvent('theme:change', { detail: { theme, isDark } })
  );
};
export const switchTheme = () =>
  setTheme(
    document.documentElement.classList.contains('dark') ? 'light' : 'dark'
  );
setTheme(localStorage.getItem('theme') || 'system');
matchMedia('(prefers-color-scheme: dark)').onchange = () => {
  if (localStorage.getItem('theme') === 'system') setTheme('system');
};
document.addEventListener('click', (event) => {
  const button = event.target.closest('.theme-toggle');
  if (!button) {
    return;
  }
  const update = () => (button.value ? setTheme(button.value) : switchTheme());
  document.startViewTransition(update);
});