/**
 * Lirune Reader — Read Aloud (Text-to-Speech) System
 *
 * 100% offline, copyright-free speech synthesis using the native Web Speech API.
 * Provides voice selection, rate, pitch, volume, sentence highlighting,
 * auto-advancing across chapters/pages, and a floating playback controller.
 */

const ReadAloud = (() => {
  const DEFAULTS = {
    voiceURI: '',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    highlight: true,
    autoAdvance: true
  };

  const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5, 2.0];

  let prefs = { ...DEFAULTS };
  let voices = [];
  let isPlaying = false;
  let isPaused = false;
  let sentences = [];
  let sentenceIndex = 0;
  let currentUtterance = null;
  let advanceTimer = null;

  async function init() {
    try {
      const saved = await NoveraDB.getPref('ttsPrefs', DEFAULTS);
      prefs = { ...DEFAULTS, ...(saved || {}) };
    } catch {
      prefs = { ...DEFAULTS };
    }

    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
      };
    }

    bindUI();
    bindKeyboard();
  }

  function loadVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const raw = window.speechSynthesis.getVoices() || [];
    // Sort so English / system locale voices appear near the top
    voices = raw.slice().sort((a, b) => {
      const langA = (a.lang || '').toLowerCase();
      const langB = (b.lang || '').toLowerCase();
      const isEnA = langA.startsWith('en');
      const isEnB = langB.startsWith('en');
      if (isEnA && !isEnB) return -1;
      if (!isEnA && isEnB) return 1;
      return a.name.localeCompare(b.name);
    });

    syncVoiceSelects();
  }

  function getVoices() {
    if (voices.length === 0) loadVoices();
    return voices;
  }

  function getPrefs() {
    return { ...prefs };
  }

  async function updatePrefs(patch) {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(prefs, patch);
    try {
      await NoveraDB.setPref('ttsPrefs', prefs);
    } catch {}
    syncVoiceSelects();
    updateBarState();
  }

  function syncVoiceSelects() {
    const selects = [
      document.getElementById('tts-voice-select'),
      document.getElementById('fs-tts-voice')
    ].filter(Boolean);

    if (voices.length === 0) {
      selects.forEach(sel => {
        sel.innerHTML = '<option value="">Default system voice</option>';
      });
      return;
    }

    selects.forEach(sel => {
      const currentVal = prefs.voiceURI || '';
      sel.innerHTML = voices.map(v => {
        const selected = v.voiceURI === currentVal ? 'selected' : '';
        const cleanName = v.name.replace(/Microsoft\s+|Google\s+/g, '');
        const langBadge = v.lang ? ` (${v.lang})` : '';
        return `<option value="${Utils.escapeAttr(v.voiceURI)}" ${selected}>${Utils.escapeHTML(cleanName + langBadge)}</option>`;
      }).join('');
      sel._customDropdownSync?.();
    });
  }

  function extractSentences() {
    let rawText = '';

    // 1. Check for EPUB iframe text
    const iframe = document.querySelector('#epub-container iframe');
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (doc && doc.body) {
      // Collect visible paragraphs / text blocks
      const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
      if (blocks && blocks.length > 0) {
        const parts = [];
        blocks.forEach(b => {
          const t = b.innerText?.trim();
          if (t) parts.push(t);
        });
        rawText = parts.join('\n\n');
      } else {
        rawText = doc.body.innerText || '';
      }
    }

    // 2. Check for PDF / Document viewer text container
    if (!rawText.trim()) {
      const docContainer = document.getElementById('doc-reader-container') ||
                           document.getElementById('text-container') ||
                           document.getElementById('reader-content-wrap');
      if (docContainer) {
        rawText = docContainer.innerText || '';
      }
    }

    if (!rawText.trim()) return [];

    // Clean whitespace and split on sentence terminators (. ! ? …)
    const cleaned = rawText.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    const fragments = cleaned.match(/[^.!?…\n]+[.!?…]+["'”)]?|[^.!?…\n]+$/g);
    if (!fragments) return [cleaned];
    return fragments.map(s => s.trim()).filter(s => s.length > 1);
  }

  function start() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      Utils.toast('Text-to-speech is not supported on this system', 'warning');
      return;
    }

    window.speechSynthesis.cancel();
    sentences = extractSentences();
    sentenceIndex = 0;

    if (sentences.length === 0) {
      Utils.toast('No readable text found on current page', 'info');
      return;
    }

    isPlaying = true;
    isPaused = false;
    showBar();
    speakSentence(sentenceIndex);
  }

  function speakSentence(index) {
    if (!isPlaying) return;
    if (index < 0) index = 0;
    sentenceIndex = index;

    if (sentenceIndex >= sentences.length) {
      // Reached the end of the current section
      if (prefs.autoAdvance) {
        Utils.toast('Advancing to next page...', 'info', 1500);
        advancePageAndContinue();
      } else {
        stop();
        Utils.toast('Finished reading current section', 'success');
      }
      return;
    }

    window.speechSynthesis.cancel();
    clearHighlight();

    const text = sentences[sentenceIndex];
    if (!text || !text.trim()) {
      sentenceIndex++;
      speakSentence(sentenceIndex);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    currentUtterance = utter;

    // Apply voice
    if (prefs.voiceURI && voices.length > 0) {
      const found = voices.find(v => v.voiceURI === prefs.voiceURI);
      if (found) utter.voice = found;
    }
    utter.rate = Math.max(0.5, Math.min(2.5, Number(prefs.rate) || 1.0));
    utter.pitch = Math.max(0.5, Math.min(1.5, Number(prefs.pitch) || 1.0));
    utter.volume = Math.max(0.0, Math.min(1.0, Number(prefs.volume) || 1.0));

    utter.onstart = () => {
      highlightActiveSentence(text);
      updateBarState();
    };

    utter.onend = () => {
      if (isPlaying && !isPaused) {
        sentenceIndex++;
        speakSentence(sentenceIndex);
      }
    };

    utter.onerror = event => {
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('TTS speech error:', event.error);
        if (isPlaying && !isPaused) {
          sentenceIndex++;
          speakSentence(sentenceIndex);
        }
      }
    };

    window.speechSynthesis.speak(utter);
    updateBarState();
  }

  function advancePageAndContinue() {
    clearTimeout(advanceTimer);
    clearHighlight();

    // Trigger page forward
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
      nextBtn.click();
    } else if (typeof Reader !== 'undefined' && typeof Reader.nextPage === 'function') {
      Reader.nextPage();
    }

    advanceTimer = setTimeout(() => {
      sentences = extractSentences();
      sentenceIndex = 0;
      if (sentences.length > 0 && isPlaying) {
        speakSentence(sentenceIndex);
      } else {
        stop();
      }
    }, 800);
  }

  function pause() {
    if (!isPlaying || isPaused) return;
    isPaused = true;
    window.speechSynthesis.pause();
    updateBarState();
  }

  function resume() {
    if (!isPlaying) {
      start();
      return;
    }
    if (isPaused) {
      isPaused = false;
      window.speechSynthesis.resume();
      updateBarState();
    }
  }

  function togglePlayPause() {
    if (!isPlaying) {
      start();
    } else if (isPaused) {
      resume();
    } else {
      pause();
    }
  }

  function stop() {
    isPlaying = false;
    isPaused = false;
    clearTimeout(advanceTimer);
    clearHighlight();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    currentUtterance = null;
    hideBar();
  }

  function prevSentence() {
    if (!isPlaying) return;
    sentenceIndex = Math.max(0, sentenceIndex - 1);
    speakSentence(sentenceIndex);
  }

  function nextSentence() {
    if (!isPlaying) return;
    sentenceIndex = Math.min(sentences.length - 1, sentenceIndex + 1);
    speakSentence(sentenceIndex);
  }

  function cycleSpeed() {
    const current = Number(prefs.rate) || 1.0;
    const idx = SPEED_PRESETS.findIndex(s => Math.abs(s - current) < 0.05);
    const next = idx >= 0 && idx < SPEED_PRESETS.length - 1 ? SPEED_PRESETS[idx + 1] : SPEED_PRESETS[0];
    updatePrefs({ rate: next });
    if (isPlaying && !isPaused) {
      speakSentence(sentenceIndex);
    }
  }

  function highlightActiveSentence(text) {
    if (!prefs.highlight || !text) return;
    try {
      const iframe = document.querySelector('#epub-container iframe');
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document || document;
      // Search for text snippet in paragraph elements
      const snippet = text.slice(0, 30).trim();
      const el = Array.from(doc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, div')).find(e =>
        e.children.length === 0 && e.textContent.includes(snippet)
      );
      if (el) {
        el.classList.add('tts-active-sentence');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch {}
  }

  function clearHighlight() {
    try {
      const iframe = document.querySelector('#epub-container iframe');
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
      doc?.querySelectorAll('.tts-active-sentence').forEach(el => el.classList.remove('tts-active-sentence'));
      document.querySelectorAll('.tts-active-sentence').forEach(el => el.classList.remove('tts-active-sentence'));
    } catch {}
  }

  function showBar() {
    const bar = document.getElementById('read-aloud-bar');
    if (bar) {
      bar.classList.remove('hidden');
      updateBarState();
    }
  }

  function hideBar() {
    const bar = document.getElementById('read-aloud-bar');
    if (bar) bar.classList.add('hidden');
    updateBarState();
  }

  function updateBarState() {
    const playIcon = document.getElementById('tts-play-icon');
    const pauseIcon = document.getElementById('tts-pause-icon');
    const speedBtn = document.getElementById('tts-speed-btn');
    const toggleBtn = document.getElementById('read-aloud-btn');

    if (playIcon && pauseIcon) {
      if (isPlaying && !isPaused) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
      } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      }
    }

    if (speedBtn) {
      speedBtn.textContent = `${prefs.rate}x`;
    }

    if (toggleBtn) {
      toggleBtn.classList.toggle('active', isPlaying);
    }
  }

  function previewVoice(voiceURI, rate, pitch, volume) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const sample = new SpeechSynthesisUtterance('Welcome to Lirune Reader. Enjoy a peaceful and distraction-free reading experience.');
    if (voiceURI && voices.length > 0) {
      const v = voices.find(vox => vox.voiceURI === voiceURI);
      if (v) sample.voice = v;
    }
    sample.rate = Number(rate) || 1.0;
    sample.pitch = Number(pitch) || 1.0;
    sample.volume = Number(volume) || 1.0;
    window.speechSynthesis.speak(sample);
  }

  function bindUI() {
    // Toolbar toggle button
    document.getElementById('read-aloud-btn')?.addEventListener('click', () => {
      if (isPlaying) stop();
      else start();
    });

    // Floating bar controls
    document.getElementById('tts-play-btn')?.addEventListener('click', togglePlayPause);
    document.getElementById('tts-prev-btn')?.addEventListener('click', prevSentence);
    document.getElementById('tts-next-btn')?.addEventListener('click', nextSentence);
    document.getElementById('tts-speed-btn')?.addEventListener('click', cycleSpeed);
    document.getElementById('tts-close-btn')?.addEventListener('click', stop);

    document.getElementById('tts-voice-select')?.addEventListener('change', event => {
      updatePrefs({ voiceURI: event.target.value });
      if (isPlaying && !isPaused) {
        speakSentence(sentenceIndex);
      }
    });
  }

  function bindKeyboard() {
    window.addEventListener('keydown', event => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (document.getElementById('reader-view')?.classList.contains('hidden')) return;

      if (event.key === 'a' || event.key === 'A') {
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          if (isPlaying) stop();
          else start();
        }
      }
    });
  }

  return {
    init,
    start,
    stop,
    pause,
    resume,
    togglePlayPause,
    prevSentence,
    nextSentence,
    cycleSpeed,
    getVoices,
    getPrefs,
    updatePrefs,
    previewVoice,
    isPlaying: () => isPlaying,
    isPaused: () => isPaused
  };
})();

