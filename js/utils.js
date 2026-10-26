/**
 * Lirune Reader — Utility Functions & Toast System
 */

const Utils = {
  // DOM selectors
  $: (selector, scope = document) => scope.querySelector(selector),
  $$: (selector, scope = document) => Array.from(scope.querySelectorAll(selector)),

  // Create element with class and attributes
  createEl: (tag, className = '', attrs = {}) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  },

  // UUID generator for IDs
  generateId: () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 7);
  },

  // Format bytes into KB / MB
  formatBytes: (bytes, decimals = 1) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  },

  // Format relative or friendly date
  formatDate: (timestamp) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  },

  // Debounce function
  debounce: (fn, delay = 200) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  // Escape HTML to prevent injection
  escapeHTML: (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Escape HTML attribute values to prevent breaking out of attribute quotes
  escapeAttr: (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  // Validate and sanitize cover image URLs to prevent attribute injection or dangerous schemes
  sanitizeCoverUrl: (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    // Allow safe data URLs for standard raster image formats only
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return trimmed;
    }
    return null;
  },

  // Toast Notification System
  toast: (message, type = 'info', duration = 3200) => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-msg">${Utils.escapeHTML(message)}</div>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};
