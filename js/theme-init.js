/**
 * Lirune Reader — Early Theme Initializer
 * Synchronously applies the saved theme before first paint to prevent flash.
 */
(function () {
  try {
    var t = localStorage.getItem('lirune-app-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {}
})();
