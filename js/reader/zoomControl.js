/**
 * Lirune Reader — Floating Zoom Control
 *
 * One implementation, two instances: the reader (50–200%) and the library
 * home (75–150%). Each instance owns exactly one percentage value, which is
 * also the value the keyboard shortcuts mutate, so there is never a second
 * source of truth.
 *
 * Behaviour: the control appears on every zoom change, stays visible while the
 * pointer is over it or while it is being used, then fades out after a short
 * idle delay and returns on the next change.
 */

const ZoomControl = (() => {
  const instances = new Map();

  class Instance {
    constructor(rootId, { min, max, step, onChange, label }) {
      this.min = min;
      this.max = max;
      this.step = step || 10;
      this.onChange = onChange;
      this.label = label || 'Zoom level';
      this.value = 100;
      this.hideTimer = null;
      this.root = document.getElementById(rootId);
      this.valueEl = this.root ? this.root.querySelector('[data-zoom-value]') : null;
      this.decreaseBtn = this.root ? this.root.querySelector('[data-zoom-decrease]') : null;
      this.increaseBtn = this.root ? this.root.querySelector('[data-zoom-increase]') : null;
      if (!this.root) return;
      this._bind();
      this._render();
    }

    _bind() {
      this.decreaseBtn?.addEventListener('click', event => {
        event.stopPropagation();
        this.set(this.value - this.step, { announce: true, origin: 'button' });
      });
      this.increaseBtn?.addEventListener('click', event => {
        event.stopPropagation();
        this.set(this.value + this.step, { announce: true, origin: 'button' });
      });
      // Interacting with the control resets the auto-hide timer.
      this.root.addEventListener('pointerenter', () => this._hold());
      this.root.addEventListener('pointerleave', () => this._scheduleHide());
      this.root.addEventListener('focusin', () => this._hold());
      this.root.addEventListener('focusout', () => this._scheduleHide());
      this.root.addEventListener('wheel', () => this._scheduleHide(), { passive: true });
    }

    _render() {
      if (this.valueEl) this.valueEl.textContent = `${this.value}%`;
      this.decreaseBtn?.toggleAttribute('disabled', this.value <= this.min);
      this.increaseBtn?.toggleAttribute('disabled', this.value >= this.max);
      this.root?.setAttribute('aria-valuenow', String(this.value));
      this.root?.setAttribute('aria-valuemin', String(this.min));
      this.root?.setAttribute('aria-valuemax', String(this.max));
      this.root?.setAttribute('aria-label', `${this.label}: ${this.value}%`);
    }

    get() {
      return this.value;
    }

    /** Set the zoom. Returns true when the value actually changed. */
    set(value, { announce = false, origin = 'api' } = {}) {
      const next = Math.min(this.max, Math.max(this.min, Math.round(Number(value) / this.step) * this.step));
      const changed = next !== this.value;
      this.value = next;
      this._render();
      this.onChange?.(next, { changed, origin });
      if (announce || changed) this.show();
      return changed;
    }

    adjust(delta, options) {
      return this.set(this.value + delta, { announce: true, ...options });
    }

    reset() {
      return this.set(100, { announce: false });
    }

    show() {
      if (!this.root) return;
      this.root.classList.add('visible');
      this.root.setAttribute('data-zoom-visible', 'true');
      this._scheduleHide();
    }

    _hold() {
      if (!this.root) return;
      this.root.classList.add('visible');
      this.root.setAttribute('data-zoom-visible', 'true');
      clearTimeout(this.hideTimer);
    }

    _scheduleHide() {
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        if (!this.root) return;
        this.root.classList.remove('visible');
        this.root.setAttribute('data-zoom-visible', 'false');
      }, 2000);
    }

    hide() {
      clearTimeout(this.hideTimer);
      this.root?.classList.remove('visible');
    }

    /**
     * Safety net that keeps the control inside the viewport. The control is
     * anchored with `right`/`bottom`, so only an overflow correction is
     * needed rather than an absolute reposition.
     */
    clampToViewport() {
      if (!this.root || !this.root.classList.contains('visible')) return;
      const rect = this.root.getBoundingClientRect();
      const margin = 8;
      const isHome = this.root.classList.contains('zoom-overlay-home');
      if (isHome) {
        if (rect.left < margin) this.root.style.left = `${margin}px`;
        else this.root.style.removeProperty('left');
      } else if (rect.right > window.innerWidth - margin) {
        this.root.style.right = `${Math.max(margin, window.innerWidth - rect.right)}px`;
      } else {
        this.root.style.removeProperty('right');
      }
      if (rect.bottom > window.innerHeight - margin) {
        this.root.style.bottom = `${Math.max(margin, window.innerHeight - rect.bottom)}px`;
      } else {
        this.root.style.removeProperty('bottom');
      }
    }
  }

  function create(id, options) {
    const existing = instances.get(id);
    if (existing) return existing;
    const instance = new Instance(id, options);
    instances.set(id, instance);
    return instance;
  }

  function get(id) {
    return instances.get(id) || null;
  }

  return { create, get, instances };
})();
