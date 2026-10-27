/**
 * Lirune Reader — Reader Display Settings (Typography, Spacing, Flow & Layout)
 */

const ReaderSettings = (() => {
  const DEFAULT_SETTINGS = {
    fontSize: 18,
    fontFamily: 'Cormorant Garamond',
    alignment: 'left',
    lineHeight: 1.6,
    margin: 10,
    flow: 'paginated',
    spread: 'auto'
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let persistTimer = null;

  const READER_FONTS = [
    {
      id: 'Serif',
      name: 'Classic Serif',
      subtitle: 'Georgia / Noto Serif',
      cssStack: 'Georgia, "Noto Serif", "Times New Roman", serif',
      category: 'serif'
    },
    {
      id: 'Sans-Serif',
      name: 'Modern Sans',
      subtitle: 'Clean & readable',
      cssStack: 'system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
      category: 'sans'
    },
    {
      id: 'Cormorant',
      name: 'Cormorant',
      subtitle: 'Lirune Signature Serif',
      cssStack: '"Cormorant Garamond", Garamond, "Palatino Linotype", Georgia, serif',
      category: 'serif'
    },
    {
      id: 'Merriweather',
      name: 'Merriweather',
      subtitle: 'Designed for screen reading',
      cssStack: 'Merriweather, Georgia, "Noto Serif", serif',
      category: 'serif'
    },
    {
      id: 'Literata',
      name: 'Literata',
      subtitle: 'Google Play Books e-reader serif',
      cssStack: 'Literata, "Noto Serif", Georgia, serif',
      category: 'serif'
    },
    {
      id: 'Inter',
      name: 'Inter',
      subtitle: 'Precision screen sans',
      cssStack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      category: 'sans'
    },
    {
      id: 'Lora',
      name: 'Lora',
      subtitle: 'Literary & calligraphic',
      cssStack: 'Lora, "Literata", Merriweather, Georgia, serif',
      category: 'serif'
    },
    {
      id: 'EBGaramond',
      name: 'EB Garamond',
      subtitle: 'Classic Renaissance book serif',
      cssStack: '"EB Garamond", Garamond, Georgia, serif',
      category: 'serif'
    },
    {
      id: 'Bitter',
      name: 'Bitter',
      subtitle: 'Contemporary slab serif for reading',
      cssStack: 'Bitter, Georgia, serif',
      category: 'slab'
    },
    {
      id: 'SourceSerif',
      name: 'Source Serif',
      subtitle: 'Adobe open-source book serif',
      cssStack: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
      category: 'serif'
    },
    {
      id: 'OpenDyslexic',
      name: 'OpenDyslexic',
      subtitle: 'Accessibility & reading ease',
      cssStack: 'OpenDyslexic, sans-serif',
      category: 'special'
    },
    {
      id: 'Playfair',
      name: 'Playfair Display',
      subtitle: 'High contrast editorial',
      cssStack: '"Playfair Display", Georgia, "Times New Roman", serif',
      category: 'serif'
    },
    {
      id: 'Vollkorn',
      name: 'Vollkorn',
      subtitle: 'Quiet & robust book typeface',
      cssStack: 'Vollkorn, Georgia, serif',
      category: 'serif'
    },
    {
      id: 'Alegreya',
      name: 'Alegreya',
      subtitle: 'Rhythmic literature face',
      cssStack: 'Alegreya, Georgia, serif',
      category: 'serif'
    },
    {
      id: 'Charter',
      name: 'Charter',
      subtitle: 'Warm book text',
      cssStack: 'Charter, "Book Antiqua", Georgia, serif',
      category: 'serif'
    },
    {
      id: 'Monospace',
      name: 'Monospace',
      subtitle: 'Code & typewriter',
      cssStack: '"JetBrains Mono", "Roboto Mono", Consolas, "Courier New", Courier, monospace',
      category: 'mono'
    },
    {
      id: 'Original',
      name: 'Publisher Default',
      subtitle: 'Original EPUB styling',
      cssStack: 'inherit',
      category: 'special'
    }
  ];

  function getFontCssStack(fontId) {
    if (!fontId || fontId === 'Original' || fontId === 'inherit') {
      return 'inherit';
    }
    const clean = fontId.trim().toLowerCase();
    // Match aliases
    if (clean === 'cormorant garamond') return '"Cormorant Garamond", Garamond, "Palatino Linotype", Georgia, serif';
    if (clean === 'jetbrains mono') return '"JetBrains Mono", "Roboto Mono", Consolas, "Courier New", Courier, monospace';
    if (clean === 'georgia') return 'Georgia, "Noto Serif", "Times New Roman", serif';
    if (clean === 'playfair') return '"Playfair Display", Georgia, "Times New Roman", serif';
    if (clean === 'eb garamond') return '"EB Garamond", Garamond, Georgia, serif';
    if (clean === 'source serif') return '"Source Serif 4", "Source Serif Pro", Georgia, serif';

    const match = READER_FONTS.find(
      f => f.id.toLowerCase() === clean || f.name.toLowerCase() === clean
    );
    return match ? match.cssStack : `${fontId}, Georgia, serif`;
  }

  function normalizeSettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    const allowedFonts = [
      'Cormorant Garamond', 'Cormorant', 'Serif', 'Sans-Serif', 'Merriweather',
      'Literata', 'Inter', 'Lora', 'EBGaramond', 'EB Garamond', 'Bitter',
      'SourceSerif', 'Source Serif', 'OpenDyslexic', 'Playfair Display', 'Playfair',
      'Vollkorn', 'Alegreya', 'Charter', 'Monospace', 'JetBrains Mono', 'Georgia', 'Original'
    ];
    merged.fontSize = Math.min(36, Math.max(12, Number(merged.fontSize) || DEFAULT_SETTINGS.fontSize));
    merged.fontFamily = allowedFonts.includes(merged.fontFamily) ? merged.fontFamily : DEFAULT_SETTINGS.fontFamily;
    merged.alignment = ['left', 'center', 'right', 'justify'].includes(merged.alignment) ? merged.alignment : DEFAULT_SETTINGS.alignment;
    merged.lineHeight = Math.min(2.4, Math.max(1.2, Number(merged.lineHeight) || DEFAULT_SETTINGS.lineHeight));
    merged.margin = Math.min(24, Math.max(2, Number(merged.margin) || DEFAULT_SETTINGS.margin));
    merged.flow = ['paginated', 'scrolled'].includes(merged.flow) ? merged.flow : DEFAULT_SETTINGS.flow;
    merged.spread = ['auto', 'none'].includes(merged.spread) ? merged.spread : DEFAULT_SETTINGS.spread;
    return merged;
  }

  async function init() {
    const saved = await NoveraDB.getPref('readerSettings', DEFAULT_SETTINGS);
    currentSettings = normalizeSettings(saved);
    updateUI();
    bindEvents();
  }

  function getSettings() {
    return { ...currentSettings };
  }

  function updateUI() {
    // Font size display
    const fontSizeDisplay = document.getElementById('font-size-display');
    if (fontSizeDisplay) fontSizeDisplay.textContent = `${currentSettings.fontSize}px`;

    // Typeface active state
    document.querySelectorAll('.font-opt').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.font === currentSettings.fontFamily);
    });

    document.querySelectorAll('[data-alignment]').forEach(option => {
      const isActive = option.dataset.alignment === currentSettings.alignment;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Spacing slider & value
    const spacingSlider = document.getElementById('spacing-slider');
    const spacingVal = document.getElementById('spacing-val');
    if (spacingSlider) spacingSlider.value = currentSettings.lineHeight;
    if (spacingVal) spacingVal.textContent = currentSettings.lineHeight.toFixed(1);

    // Margin slider & value
    const marginSlider = document.getElementById('margin-slider');
    const marginVal = document.getElementById('margin-val');
    if (marginSlider) marginSlider.value = currentSettings.margin;
    if (marginVal) marginVal.textContent = `${currentSettings.margin}%`;

    // Zoom readout (runtime only, owned by the reader's ZoomControl)
    const zoomDisplay = document.getElementById('zoom-display');
    if (zoomDisplay && typeof Reader !== 'undefined') zoomDisplay.textContent = `${Reader.getZoom()}%`;

    // Flow buttons
    const flowPaginated = document.getElementById('flow-paginated-btn');
    const flowScrolled = document.getElementById('flow-scrolled-btn');
    if (flowPaginated) flowPaginated.classList.toggle('active', currentSettings.flow === 'paginated');
    if (flowScrolled) flowScrolled.classList.toggle('active', currentSettings.flow === 'scrolled');

    // Spread buttons
    const spreadAuto = document.getElementById('spread-auto-btn');
    const spreadSingle = document.getElementById('spread-single-btn');
    if (spreadAuto) spreadAuto.classList.toggle('active', currentSettings.spread === 'auto');
    if (spreadSingle) spreadSingle.classList.toggle('active', currentSettings.spread === 'none');
  }

  function setSetting(key, val, shouldApply = true) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return;
    currentSettings = normalizeSettings({ ...currentSettings, [key]: val });
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => NoveraDB.setPref('readerSettings', currentSettings), 250);
    updateUI();

    if (shouldApply && typeof Reader !== 'undefined') {
      Reader.applySettings(getSettings());
    }
  }

  // Zoom is owned by the reader's ZoomControl so the keyboard shortcuts, the
  // floating control and the settings readout all read one value.
  function adjustZoom(delta) {
    if (typeof Reader !== 'undefined') Reader.adjustZoom(delta);
  }

  function setZoom(zoom) {
    if (typeof Reader !== 'undefined') Reader.setZoom(zoom);
  }

  function getZoom() {
    return typeof Reader !== 'undefined' ? Reader.getZoom() : 100;
  }

  function bindEvents() {
    // Font size stepper
    const decBtn = document.getElementById('font-decrease');
    const incBtn = document.getElementById('font-increase');
    if (decBtn) {
      decBtn.addEventListener('click', () => {
        if (currentSettings.fontSize > 12) {
          setSetting('fontSize', currentSettings.fontSize - 2);
        }
      });
    }
    if (incBtn) {
      incBtn.addEventListener('click', () => {
        if (currentSettings.fontSize < 36) {
          setSetting('fontSize', currentSettings.fontSize + 2);
        }
      });
    }

    // Typeface grid
    document.querySelectorAll('.font-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        setSetting('fontFamily', opt.dataset.font);
      });
    });

    document.querySelectorAll('[data-alignment]').forEach(option => {
      option.addEventListener('click', () => {
        setSetting('alignment', option.dataset.alignment);
      });
    });

    // Spacing slider
    const spacingSlider = document.getElementById('spacing-slider');
    if (spacingSlider) {
      spacingSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        setSetting('lineHeight', val);
      });
    }

    // Margin slider
    const marginSlider = document.getElementById('margin-slider');
    if (marginSlider) {
      marginSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        setSetting('margin', val);
      });
    }


    // Flow mode buttons
    const flowPaginated = document.getElementById('flow-paginated-btn');
    const flowScrolled = document.getElementById('flow-scrolled-btn');
    if (flowPaginated) {
      flowPaginated.addEventListener('click', () => {
        if (currentSettings.flow !== 'paginated') {
          setSetting('flow', 'paginated');
          Reader.reRender();
        }
      });
    }
    if (flowScrolled) {
      flowScrolled.addEventListener('click', () => {
        if (currentSettings.flow !== 'scrolled') {
          setSetting('flow', 'scrolled');
          Reader.reRender();
        }
      });
    }

    // Spread buttons
    const spreadAuto = document.getElementById('spread-auto-btn');
    const spreadSingle = document.getElementById('spread-single-btn');
    if (spreadAuto) {
      spreadAuto.addEventListener('click', () => {
        if (currentSettings.spread !== 'auto') {
          setSetting('spread', 'auto');
          Reader.reRender();
        }
      });
    }
    if (spreadSingle) {
      spreadSingle.addEventListener('click', () => {
        if (currentSettings.spread !== 'none') {
          setSetting('spread', 'none');
          Reader.reRender();
        }
      });
    }

    const resetButton = document.getElementById('reset-reader-settings-btn');
    if (resetButton) {
      resetButton.addEventListener('click', reset);
    }
  }

  /**
   * Restores every reading preference to its default, persists the result and
   * re-renders the open document so the reader never shows stale values.
   * Runtime zoom is deliberately untouched: it is not a stored setting.
   */
  function reset() {
    currentSettings = { ...DEFAULT_SETTINGS };
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => NoveraDB.setPref('readerSettings', { ...currentSettings }), 0);
    updateUI();
    Reader.reRender?.();
    return getSettings();
  }

  return {
    init,
    getSettings,
    setSetting,
    reset,
    defaults: () => ({ ...DEFAULT_SETTINGS }),
    adjustZoom,
    setZoom,
    getZoom,
    getFonts: () => [...READER_FONTS],
    getFontCssStack
  };
})();
