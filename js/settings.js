/**
 * Lirune Reader — Reader Display Settings (Typography, Spacing, Flow & Layout)
 */

const ReaderSettings = (() => {
  const DEFAULT_SETTINGS = {
    fontSize: 18,
    fontFamily: 'Cormorant Garamond',
    alignment: 'left',
    lineHeight: 1.6,
    paragraphSpacing: 1.0,
    wordSpacing: 0.0,
    letterSpacing: 0.0,
    margin: 10,
    flow: 'paginated',
    spread: 'auto',
    progressShowChapter: true,
    progressShowPage: true,
    progressShowPercent: true,
    perBookOverride: false
  };

  const BUILTIN_PROFILES = [
    {
      id: 'default',
      name: 'Default (Classic)',
      theme: 'neutral',
      settings: {
        fontSize: 18,
        fontFamily: 'Cormorant Garamond',
        alignment: 'left',
        lineHeight: 1.6,
        paragraphSpacing: 1.0,
        wordSpacing: 0.0,
        letterSpacing: 0.0,
        margin: 10,
        flow: 'paginated',
        spread: 'auto'
      }
    },
    {
      id: 'compact',
      name: 'Compact Reading',
      theme: 'paper',
      settings: {
        fontSize: 15,
        fontFamily: 'Inter',
        alignment: 'justify',
        lineHeight: 1.4,
        paragraphSpacing: 0.6,
        wordSpacing: -0.05,
        letterSpacing: 0.0,
        margin: 6,
        flow: 'paginated',
        spread: 'auto'
      }
    },
    {
      id: 'night',
      name: 'Night Focus',
      theme: 'night',
      settings: {
        fontSize: 19,
        fontFamily: 'Literata',
        alignment: 'left',
        lineHeight: 1.8,
        paragraphSpacing: 1.2,
        wordSpacing: 0.0,
        letterSpacing: 0.02,
        margin: 12,
        flow: 'paginated',
        spread: 'auto'
      }
    },
    {
      id: 'legibility',
      name: 'High Legibility',
      theme: 'contrast1',
      settings: {
        fontSize: 20,
        fontFamily: 'OpenDyslexic',
        alignment: 'left',
        lineHeight: 2.0,
        paragraphSpacing: 1.4,
        wordSpacing: 0.1,
        letterSpacing: 0.04,
        margin: 14,
        flow: 'paginated',
        spread: 'auto'
      }
    }
  ];

  let currentSettings = { ...DEFAULT_SETTINGS };
  let customProfiles = [];
  let activeProfileId = 'default';
  let currentBookId = null;
  let globalSavedSettings = null;
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
    merged.alignment = ['auto', 'left', 'center', 'right', 'justify'].includes(merged.alignment) ? merged.alignment : DEFAULT_SETTINGS.alignment;
    merged.lineHeight = Math.min(2.4, Math.max(1.2, Number(merged.lineHeight) || DEFAULT_SETTINGS.lineHeight));
    merged.paragraphSpacing = Math.min(3.0, Math.max(0, Number(merged.paragraphSpacing) !== undefined && !isNaN(Number(merged.paragraphSpacing)) ? Number(merged.paragraphSpacing) : DEFAULT_SETTINGS.paragraphSpacing));
    merged.wordSpacing = Math.min(0.5, Math.max(-0.1, Number(merged.wordSpacing) !== undefined && !isNaN(Number(merged.wordSpacing)) ? Number(merged.wordSpacing) : DEFAULT_SETTINGS.wordSpacing));
    merged.letterSpacing = Math.min(0.3, Math.max(-0.05, Number(merged.letterSpacing) !== undefined && !isNaN(Number(merged.letterSpacing)) ? Number(merged.letterSpacing) : DEFAULT_SETTINGS.letterSpacing));
    merged.margin = Math.min(24, Math.max(2, Number(merged.margin) || DEFAULT_SETTINGS.margin));
    merged.flow = ['paginated', 'scrolled'].includes(merged.flow) ? merged.flow : DEFAULT_SETTINGS.flow;
    merged.spread = ['auto', 'none'].includes(merged.spread) ? merged.spread : DEFAULT_SETTINGS.spread;
    merged.progressShowChapter = Boolean(merged.progressShowChapter !== false);
    merged.progressShowPage = Boolean(merged.progressShowPage !== false);
    merged.progressShowPercent = Boolean(merged.progressShowPercent !== false);
    merged.perBookOverride = Boolean(merged.perBookOverride === true);
    return merged;
  }

  async function init() {
    const saved = await NoveraDB.getPref('readerSettings', DEFAULT_SETTINGS);
    currentSettings = normalizeSettings(saved);
    customProfiles = await NoveraDB.getPref('customReadingProfiles', []);
    activeProfileId = await NoveraDB.getPref('activeReadingProfileId', 'default');
    updateUI();
    bindEvents();
  }

  function getSettings() {
    return { ...currentSettings };
  }

  function getProfiles() {
    return [...BUILTIN_PROFILES, ...customProfiles];
  }

  function getActiveProfileId() {
    return activeProfileId;
  }

  async function applyProfile(profileId) {
    const profiles = getProfiles();
    const p = profiles.find(item => item.id === profileId);
    if (!p) return false;
    activeProfileId = profileId;
    await NoveraDB.setPref('activeReadingProfileId', profileId);

    // Merge settings
    currentSettings = normalizeSettings({ ...currentSettings, ...p.settings });
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      if (currentSettings.perBookOverride && currentBookId) {
        const overrideKey = `perBookSettings_${currentBookId}`;
        const theme = typeof ThemeManager !== 'undefined' ? ThemeManager.getReaderTheme() : 'neutral';
        await NoveraDB.setPref(overrideKey, {
          enabled: true,
          settings: currentSettings,
          theme
        });
      } else {
        await NoveraDB.setPref('readerSettings', currentSettings);
      }
    }, 100);

    // Apply theme if specified
    if (p.theme && typeof ThemeManager !== 'undefined') {
      ThemeManager.setReaderTheme(p.theme);
    }

    updateUI();
    if (typeof Reader !== 'undefined') {
      Reader.applySettings(getSettings());
      if (p.settings.flow || p.settings.spread) Reader.reRender?.();
    }
    if (typeof SettingsUI !== 'undefined') {
      SettingsUI.syncQuickControls?.();
      SettingsUI.syncFullControls?.();
    }
    if (typeof Utils !== 'undefined' && Utils.toast) {
      Utils.toast(`Applied reading profile: ${p.name}`, 'success');
    }
    return true;
  }

  async function saveProfile(name) {
    if (!name || !name.trim()) return null;
    const cleanName = name.trim();
    const id = 'custom_' + Date.now();
    const theme = typeof ThemeManager !== 'undefined' ? ThemeManager.getReaderTheme() : 'neutral';
    const profile = {
      id,
      name: cleanName,
      theme,
      isCustom: true,
      settings: {
        fontSize: currentSettings.fontSize,
        fontFamily: currentSettings.fontFamily,
        alignment: currentSettings.alignment,
        lineHeight: currentSettings.lineHeight,
        paragraphSpacing: currentSettings.paragraphSpacing,
        wordSpacing: currentSettings.wordSpacing,
        letterSpacing: currentSettings.letterSpacing,
        margin: currentSettings.margin,
        flow: currentSettings.flow,
        spread: currentSettings.spread
      }
    };
    customProfiles.push(profile);
    await NoveraDB.setPref('customReadingProfiles', customProfiles);
    activeProfileId = id;
    await NoveraDB.setPref('activeReadingProfileId', id);
    updateUI();
    if (typeof SettingsUI !== 'undefined') {
      SettingsUI.refresh?.();
    }
    if (typeof Utils !== 'undefined' && Utils.toast) {
      Utils.toast(`Saved profile: ${cleanName}`, 'success');
    }
    return profile;
  }

  async function deleteProfile(id) {
    const idx = customProfiles.findIndex(p => p.id === id);
    if (idx === -1) return false;
    const deletedName = customProfiles[idx].name;
    customProfiles.splice(idx, 1);
    await NoveraDB.setPref('customReadingProfiles', customProfiles);
    if (activeProfileId === id) {
      await applyProfile('default');
    } else {
      updateUI();
      if (typeof SettingsUI !== 'undefined') SettingsUI.refresh?.();
    }
    if (typeof Utils !== 'undefined' && Utils.toast) {
      Utils.toast(`Deleted profile: ${deletedName}`, 'info');
    }
    return true;
  }

  async function loadBookSettings(bookId) {
    if (!bookId) return;
    currentBookId = bookId;
    const overrideKey = `perBookSettings_${bookId}`;
    const override = await NoveraDB.getPref(overrideKey, null);
    if (override && override.enabled && override.settings) {
      if (!globalSavedSettings) {
        const globalSaved = await NoveraDB.getPref('readerSettings', null);
        globalSavedSettings = globalSaved ? normalizeSettings(globalSaved) : { ...currentSettings, perBookOverride: false };
      }
      currentSettings = normalizeSettings({ ...override.settings, perBookOverride: true });
      if (override.theme && typeof ThemeManager !== 'undefined') {
        ThemeManager.setReaderTheme(override.theme);
      }
    } else {
      if (globalSavedSettings) {
        currentSettings = normalizeSettings({ ...globalSavedSettings, perBookOverride: false });
      } else {
        const globalSaved = await NoveraDB.getPref('readerSettings', null);
        if (globalSaved) {
          currentSettings = normalizeSettings({ ...globalSaved, perBookOverride: false });
        } else {
          currentSettings.perBookOverride = false;
        }
      }
    }
    updateUI();
    if (typeof SettingsUI !== 'undefined') {
      SettingsUI.syncQuickControls?.();
      SettingsUI.syncFullControls?.();
    }
  }

  async function unloadBookSettings() {
    clearTimeout(persistTimer);
    if (currentSettings.perBookOverride || globalSavedSettings) {
      if (!globalSavedSettings) {
        const globalSaved = await NoveraDB.getPref('readerSettings', null);
        globalSavedSettings = globalSaved ? normalizeSettings(globalSaved) : null;
      }
      if (globalSavedSettings) {
        currentSettings = normalizeSettings({ ...globalSavedSettings, perBookOverride: false });
      } else {
        currentSettings = normalizeSettings({ ...DEFAULT_SETTINGS, perBookOverride: false });
      }
      globalSavedSettings = null;
      updateUI();
    }
    currentBookId = null;
  }

  async function setPerBookOverride(enabled) {
    currentSettings.perBookOverride = Boolean(enabled);
    if (!currentBookId) {
      updateUI();
      return;
    }
    const overrideKey = `perBookSettings_${currentBookId}`;
    if (enabled) {
      if (!globalSavedSettings) {
        const globalSaved = await NoveraDB.getPref('readerSettings', null);
        globalSavedSettings = globalSaved ? normalizeSettings(globalSaved) : { ...currentSettings, perBookOverride: false };
      }
      const theme = typeof ThemeManager !== 'undefined' ? ThemeManager.getReaderTheme() : 'neutral';
      await NoveraDB.setPref(overrideKey, {
        enabled: true,
        settings: { ...currentSettings, perBookOverride: true },
        theme
      });
      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast('Saved custom settings for this book', 'success');
      }
    } else {
      await NoveraDB.setPref(overrideKey, null);
      if (!globalSavedSettings) {
        const globalSaved = await NoveraDB.getPref('readerSettings', null);
        globalSavedSettings = globalSaved ? normalizeSettings(globalSaved) : null;
      }
      if (globalSavedSettings) {
        currentSettings = normalizeSettings({ ...globalSavedSettings, perBookOverride: false });
        if (typeof Reader !== 'undefined') Reader.applySettings(getSettings());
      }
      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast('Restored default reading settings', 'info');
      }
    }
    updateUI();
    if (typeof SettingsUI !== 'undefined') {
      SettingsUI.syncQuickControls?.();
      SettingsUI.syncFullControls?.();
    }
  }

  function updateUI() {
    // Font size display
    const fontSizeDisplay = document.getElementById('font-size-display');
    if (fontSizeDisplay) fontSizeDisplay.textContent = `${currentSettings.fontSize}px`;

    // Typeface active state
    document.querySelectorAll('.font-opt').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.font === currentSettings.fontFamily);
    });

    // Alignment buttons (including auto)
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

    // Paragraph spacing slider & value
    const paraSpacingSlider = document.getElementById('para-spacing-slider');
    const paraSpacingVal = document.getElementById('para-spacing-val');
    const curParaSpacing = currentSettings.paragraphSpacing ?? 1.0;
    if (paraSpacingSlider) paraSpacingSlider.value = curParaSpacing;
    if (paraSpacingVal) paraSpacingVal.textContent = `${curParaSpacing.toFixed(1)}em`;

    // Word spacing slider & value
    const wordSpacingSlider = document.getElementById('word-spacing-slider');
    const wordSpacingVal = document.getElementById('word-spacing-val');
    const curWordSpacing = currentSettings.wordSpacing ?? 0.0;
    if (wordSpacingSlider) wordSpacingSlider.value = curWordSpacing;
    if (wordSpacingVal) wordSpacingVal.textContent = `${curWordSpacing >= 0 ? '+' : ''}${curWordSpacing.toFixed(2)}em`;

    // Letter spacing slider & value
    const letterSpacingSlider = document.getElementById('letter-spacing-slider');
    const letterSpacingVal = document.getElementById('letter-spacing-val');
    const curLetterSpacing = currentSettings.letterSpacing ?? 0.0;
    if (letterSpacingSlider) letterSpacingSlider.value = curLetterSpacing;
    if (letterSpacingVal) letterSpacingVal.textContent = `${curLetterSpacing >= 0 ? '+' : ''}${curLetterSpacing.toFixed(2)}em`;

    // Margin slider & value
    const marginSlider = document.getElementById('margin-slider');
    const marginVal = document.getElementById('margin-val');
    if (marginSlider) marginSlider.value = currentSettings.margin;
    if (marginVal) marginVal.textContent = `${currentSettings.margin}%`;

    // Zoom readout
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

    // Progress display switches
    const swChapter = document.getElementById('fs-progress-chapter');
    const swPage = document.getElementById('fs-progress-page');
    const swPercent = document.getElementById('fs-progress-percent');
    if (swChapter) swChapter.setAttribute('aria-checked', currentSettings.progressShowChapter !== false ? 'true' : 'false');
    if (swPage) swPage.setAttribute('aria-checked', currentSettings.progressShowPage !== false ? 'true' : 'false');
    if (swPercent) swPercent.setAttribute('aria-checked', currentSettings.progressShowPercent !== false ? 'true' : 'false');

    // Per-book override switch
    const swPerBook = document.getElementById('fs-per-book-override');
    if (swPerBook) swPerBook.setAttribute('aria-checked', currentSettings.perBookOverride ? 'true' : 'false');

    // Profiles dropdown in Full Settings
    const profileSelect = document.getElementById('reading-profile-select');
    if (profileSelect) {
      const all = getProfiles();
      profileSelect.innerHTML = all.map(p => `
        <option value="${p.id}"${p.id === activeProfileId ? ' selected' : ''}>${Utils.escapeHTML(p.name)}</option>
      `).join('');
      profileSelect._customDropdownSync?.();
    }

    // Immediately reflect progress display changes in reader header
    if (typeof Reader !== 'undefined') {
      Reader.updateProgressUI?.();
    }
  }

  function setSetting(key, val, shouldApply = true) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return;
    currentSettings = normalizeSettings({ ...currentSettings, [key]: val });
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      if (currentSettings.perBookOverride && currentBookId) {
        const overrideKey = `perBookSettings_${currentBookId}`;
        const theme = typeof ThemeManager !== 'undefined' ? ThemeManager.getReaderTheme() : 'neutral';
        await NoveraDB.setPref(overrideKey, {
          enabled: true,
          settings: currentSettings,
          theme
        });
      } else {
        await NoveraDB.setPref('readerSettings', currentSettings);
      }
    }, 250);
    updateUI();

    if (shouldApply && typeof Reader !== 'undefined') {
      Reader.applySettings(getSettings());
    }
    if (typeof SettingsUI !== 'undefined') {
      SettingsUI.syncQuickControls?.();
      SettingsUI.syncFullControls?.();
    }
  }

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

    // Paragraph spacing slider
    const paraSpacingSlider = document.getElementById('para-spacing-slider');
    if (paraSpacingSlider) {
      paraSpacingSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        setSetting('paragraphSpacing', val);
      });
    }

    // Word spacing slider
    const wordSpacingSlider = document.getElementById('word-spacing-slider');
    if (wordSpacingSlider) {
      wordSpacingSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        setSetting('wordSpacing', val);
      });
    }

    // Letter spacing slider
    const letterSpacingSlider = document.getElementById('letter-spacing-slider');
    if (letterSpacingSlider) {
      letterSpacingSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        setSetting('letterSpacing', val);
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

    // Progress display toggles
    ['fs-progress-chapter', 'fs-progress-page', 'fs-progress-percent'].forEach(id => {
      const sw = document.getElementById(id);
      if (sw) {
        sw.addEventListener('click', () => {
          const key = id === 'fs-progress-chapter' ? 'progressShowChapter' : (id === 'fs-progress-page' ? 'progressShowPage' : 'progressShowPercent');
          setSetting(key, !currentSettings[key]);
        });
      }
    });

    // Profile selector change
    const profileSelect = document.getElementById('reading-profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', (e) => {
        applyProfile(e.target.value);
      });
    }

    // Save profile button
    const saveProfileBtn = document.getElementById('save-profile-btn');
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', async () => {
        const name = prompt('Enter a name for this reading profile:', 'My Reading Profile');
        if (name) {
          await saveProfile(name);
        }
      });
    }

    // Delete profile button
    const deleteProfileBtn = document.getElementById('delete-profile-btn');
    if (deleteProfileBtn) {
      deleteProfileBtn.addEventListener('click', async () => {
        const cur = activeProfileId;
        const p = getProfiles().find(item => item.id === cur);
        if (p && !p.isCustom) {
          Utils.toast('Built-in profiles cannot be deleted', 'info');
          return;
        }
        if (p && confirm(`Delete profile "${p.name}"?`)) {
          await deleteProfile(cur);
        }
      });
    }

    // Per-book override switch
    const swPerBook = document.getElementById('fs-per-book-override');
    if (swPerBook) {
      swPerBook.addEventListener('click', () => {
        setPerBookOverride(!currentSettings.perBookOverride);
      });
    }

    const resetButton = document.getElementById('reset-reader-settings-btn');
    if (resetButton) {
      resetButton.addEventListener('click', reset);
    }
  }

  function reset() {
    currentSettings = { ...DEFAULT_SETTINGS };
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => NoveraDB.setPref('readerSettings', { ...currentSettings }), 0);
    updateUI();
    Reader.reRender?.();
    if (typeof SettingsUI !== 'undefined') {
      SettingsUI.syncQuickControls?.();
      SettingsUI.syncFullControls?.();
    }
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
    getFontCssStack,
    getProfiles,
    getActiveProfileId,
    applyProfile,
    saveProfile,
    deleteProfile,
    loadBookSettings,
    unloadBookSettings,
    setPerBookOverride,
    getCurrentBookId: () => currentBookId
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReaderSettings;
}

