/**
 * Zerodha Portfolio Intelligence — Shared UI utilities
 * zpi.js — Theme toggle, toast system, number formatting
 */

// ── Theme ─────────────────────────────────────────────────────────────────

/** Toggle between dark and light mode, persist to localStorage. */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  const moon = document.getElementById('theme-icon-moon');
  const sun  = document.getElementById('theme-icon-sun');
  const lbl  = document.getElementById('theme-label');
  if (moon) moon.style.display = isLight ? 'none'  : '';
  if (sun)  sun.style.display  = isLight ? ''      : 'none';
  if (lbl)  lbl.textContent    = isLight ? 'Dark'  : 'Light';
  localStorage.setItem('zpi-theme', isLight ? 'light' : 'dark');
  return isLight;
}

/** Restore saved theme immediately on page load (call in <head> before render). */
(function () {
  if (localStorage.getItem('zpi-theme') === 'light') {
    document.body.classList.add('light');
    document.addEventListener('DOMContentLoaded', function () {
      const moon = document.getElementById('theme-icon-moon');
      const sun  = document.getElementById('theme-icon-sun');
      const lbl  = document.getElementById('theme-label');
      if (moon) moon.style.display = 'none';
      if (sun)  sun.style.display  = '';
      if (lbl)  lbl.textContent    = 'Dark';
    });
  }
})();

// Expose globally for inline onclick usage
window.toggleTheme = toggleTheme;

export function getTheme() {
  return document.body.classList.contains('light') ? 'light' : 'dark';
}

// ── Toast system ───────────────────────────────────────────────────────────
let _toastContainer = null;

function _ensureContainer() {
  if (_toastContainer) return _toastContainer;
  _toastContainer = document.createElement('div');
  _toastContainer.className = 'zpi-toast-container';
  document.body.appendChild(_toastContainer);
  return _toastContainer;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {number} [duration=3500] ms
 */
export function toast(message, type = 'info', duration = 3500) {
  const c = _ensureContainer();
  const el = document.createElement('div');
  el.className = `zpi-toast ${type}`;
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms ease, transform 200ms ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(4px)';
    setTimeout(() => el.remove(), 220);
  }, duration);
  return el;
}

// ── Number formatting ──────────────────────────────────────────────────────
/**
 * Format INR value: ₹1.23 Cr, ₹45.6 L, ₹1,234
 */
export function fmtINR(val, decimals = 2) {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(decimals)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(decimals)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Format percentage with sign: +1.23% or -0.45% */
export function fmtPct(val, decimals = 2) {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)}%`;
}

/** CSS class for positive/negative value */
export function pnlClass(val) {
  return val >= 0 ? 'positive' : 'negative';
}

/** Wrap value in colored span */
export function pnlSpan(val, formatted) {
  return `<span class="${pnlClass(val)}">${formatted}</span>`;
}

// ── DOM helpers ────────────────────────────────────────────────────────────
/** Get element by id, throw if missing */
export function $id(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

/** Query selector, null-safe */
export function $q(selector, root = document) {
  return root.querySelector(selector);
}

/** Query selector all → Array */
export function $qa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Set innerHTML safely (no XSS risk since all content is our own server data) */
export function setHTML(el, html) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.innerHTML = html;
}

/** Show/hide element */
export function show(el, visible = true) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.style.display = visible ? '' : 'none';
}
