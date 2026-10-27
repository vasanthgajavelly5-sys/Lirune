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
    // Allow safe in-memory blob URLs
    if (/^blob:[a-zA-Z0-9_\-\.\/:]+$/.test(trimmed) && !trimmed.includes(';') && !trimmed.includes('"') && !trimmed.includes('<')) {
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
  },

  // Custom Glass Dropdown enhancement for HTML select elements
  enhanceSelect: (select) => {
    if (!select || select.dataset.enhanced === 'true' || select.tagName !== 'SELECT') return select;
    select.dataset.enhanced = 'true';
    select.classList.add('custom-dropdown-select-hidden');

    const container = document.createElement('div');
    container.className = 'custom-dropdown';
    if (select.id) container.dataset.dropdownFor = select.id;
    if (select.classList.contains('quick-select')) container.classList.add('custom-dropdown-quick');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-dropdown-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'custom-dropdown-label';
    label.textContent = select.selectedOptions[0]?.textContent || select.value;

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'custom-dropdown-arrow');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2.2');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'm6 9 6 6 6-6');
    arrow.appendChild(arrowPath);

    trigger.appendChild(label);
    trigger.appendChild(arrow);

    const menu = document.createElement('div');
    menu.className = 'custom-dropdown-menu';
    menu.setAttribute('role', 'listbox');

    function rebuildMenu() {
      menu.innerHTML = '';
      Array.from(select.options).forEach((opt, idx) => {
        if (opt.value === '__new__' && idx > 0) {
          const div = document.createElement('div');
          div.className = 'custom-dropdown-divider';
          menu.appendChild(div);
        }
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'custom-dropdown-item' + (opt.value === select.value ? ' active' : '') + (opt.value === '__new__' ? ' custom-dropdown-item-special' : '');
        item.dataset.value = opt.value;

        // Apply font typeface preview if this is a font dropdown
        if (select.id === 'qs-font-select' || select.dataset.quickSelect === 'qs-font' || select.name === 'fontFamily') {
          if (typeof ReaderSettings !== 'undefined' && typeof ReaderSettings.getFontCssStack === 'function') {
            item.style.fontFamily = ReaderSettings.getFontCssStack(opt.value);
          }
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-dropdown-item-text';
        textSpan.textContent = opt.textContent;
        item.appendChild(textSpan);

        const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        checkSvg.setAttribute('class', 'custom-dropdown-item-check');
        checkSvg.setAttribute('viewBox', '0 0 24 24');
        checkSvg.setAttribute('fill', 'none');
        checkSvg.setAttribute('stroke', 'currentColor');
        checkSvg.setAttribute('stroke-width', '2.5');
        checkSvg.setAttribute('stroke-linecap', 'round');
        checkSvg.setAttribute('stroke-linejoin', 'round');
        const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        checkPath.setAttribute('d', 'M20 6 9 17l-5-5');
        checkSvg.appendChild(checkPath);
        item.appendChild(checkSvg);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const changed = select.value !== opt.value;
          select.value = opt.value;
          if (changed) {
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
          sync();
          close();
          trigger.focus();
        });
        menu.appendChild(item);
      });
    }

    function sync() {
      const activeOpt = select.selectedOptions[0];
      label.textContent = activeOpt ? activeOpt.textContent : select.value;
      menu.querySelectorAll('.custom-dropdown-item').forEach(it => {
        it.classList.toggle('active', it.dataset.value === select.value);
      });
    }

    function open() {
      document.querySelectorAll('.custom-dropdown.open').forEach(d => {
        if (d !== container) {
          d.classList.remove('open', 'open-up');
          d.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
      rebuildMenu();
      sync();
      if (typeof window !== 'undefined' && trigger.getBoundingClientRect) {
        const rect = trigger.getBoundingClientRect();
        if (window.innerHeight - rect.bottom < 260 && rect.top > 260) {
          container.classList.add('open-up');
        } else {
          container.classList.remove('open-up');
        }
      }
      container.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      const activeItem = menu.querySelector('.custom-dropdown-item.active');
      if (activeItem && typeof activeItem.scrollIntoView === 'function') {
        setTimeout(() => activeItem.scrollIntoView({ block: 'nearest' }), 20);
      }
    }

    function close() {
      container.classList.remove('open', 'open-up');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (container.classList.contains('open')) close();
      else open();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!container.classList.contains('open')) open();
        const active = menu.querySelector('.custom-dropdown-item.active') || menu.querySelector('.custom-dropdown-item');
        active?.focus();
      }
    });

    menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('.custom-dropdown-item'));
      const currentIndex = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (currentIndex + 1) % items.length;
        items[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (currentIndex - 1 + items.length) % items.length;
        items[prev]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        trigger.focus();
      }
    });

    select.addEventListener('change', sync);

    select.parentNode?.insertBefore(container, select);
    container.appendChild(select);
    container.appendChild(trigger);
    container.appendChild(menu);

    select._customDropdownSync = () => {
      rebuildMenu();
      sync();
    };

    if (!Utils._dropdownGlobalListenersBound && typeof document !== 'undefined') {
      Utils._dropdownGlobalListenersBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
          document.querySelectorAll('.custom-dropdown.open').forEach(d => {
            d.classList.remove('open', 'open-up');
            d.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
          });
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.querySelectorAll('.custom-dropdown.open').forEach(d => {
            d.classList.remove('open', 'open-up');
            d.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
          });
        }
      });
    }

    return container;
  },

  enhanceAllSelects: (scope = (typeof document !== 'undefined' ? document : null)) => {
    if (!scope || typeof scope.querySelectorAll !== 'function') return;
    scope.querySelectorAll('select.glass-select, select.quick-select').forEach(sel => {
      Utils.enhanceSelect(sel);
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
