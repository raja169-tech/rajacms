/**
 * theme.js — Dark / Light mode management
 * Persists preference in localStorage.
 * Adds/removes [data-theme="dark"] on <html>.
 *
 * Usage:
 *   import { initTheme, toggleTheme, buildThemeToggle } from './theme.js';
 *   initTheme();                   // call once on page load
 *   toggleTheme();                 // flip mode
 *   container.append(buildThemeToggle()); // insert toggle button
 */

const THEME_KEY = 'cms_theme';
const DARK = 'dark';
const LIGHT = 'light';

function _getPreferred() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === DARK || saved === LIGHT) return saved;
  // Respect OS preference if no saved choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
}

let _current = _getPreferred();

function _apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Update all toggle buttons on the page
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.textContent = theme === DARK ? '☀️' : '🌙';
    btn.title = theme === DARK ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    btn.setAttribute('aria-label', btn.title);
  });
}

/** Initialise theme on page load. Call once per page. */
export function initTheme() {
  _current = _getPreferred();
  _apply(_current);
}

/** Toggle between dark and light and persist. */
export function toggleTheme() {
  _current = _current === DARK ? LIGHT : DARK;
  localStorage.setItem(THEME_KEY, _current);
  _apply(_current);
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: _current } }));
}

/** Get current theme string ('dark' | 'light') */
export function getTheme() { return _current; }

/**
 * Build a toggle button element.
 * Attach it anywhere in the DOM.
 */
export function buildThemeToggle(extraClass = '') {
  const btn = document.createElement('button');
  btn.className = `theme-toggle-btn btn btn-sm btn-ghost ${extraClass}`;
  btn.style.cssText = 'width:36px;height:36px;padding:0;font-size:1.1rem;border-radius:var(--radius-md);border:1px solid var(--color-border);';
  btn.textContent = _current === DARK ? '☀️' : '🌙';
  btn.title = _current === DARK ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  btn.setAttribute('aria-label', btn.title);
  btn.addEventListener('click', toggleTheme);
  return btn;
}

// Run immediately so there's no flash of wrong theme
initTheme();
