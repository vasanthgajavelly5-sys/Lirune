/**
 * Lirune Reader Mobile — Offline Text-To-Speech (TTS) Service
 * Uses Android local on-device TextToSpeech via expo-speech.
 * 100% offline, private, zero cloud or internet dependency.
 */

import * as Speech from 'expo-speech';
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';

const TAG = 'TtsService';
const VOICE_PREFERENCE_KEY = 'ttsVoiceIdentifier';

export interface TtsState {
  isPlaying: boolean;
  isPaused: boolean;
  rate: number; // 0.5 - 2.0
  pitch: number; // 0.5 - 1.5
  currentSentenceIndex: number;
  totalSentences: number;
  currentText: string;
  availableVoices: Speech.Voice[];
  selectedVoiceIdentifier?: string;
}

export type TtsListener = (state: TtsState) => void;

export class TtsService {
  private static instance: TtsService;

  private sentences: string[] = [];
  private currentIndex = 0;
  private isPlaying = false;
  private isPaused = false;
  private rate = 1.0;
  private pitch = 1.0;
  private availableVoices: Speech.Voice[] = [];
  private selectedVoiceIdentifier?: string;
  private voiceSaveChain: Promise<void> = Promise.resolve();
  private listeners: Set<TtsListener> = new Set();

  private constructor() {
    this.initVoices();
  }

  static getInstance(): TtsService {
    if (!TtsService.instance) {
      TtsService.instance = new TtsService();
    }
    return TtsService.instance;
  }

  async queryAvailableVoices(): Promise<Speech.Voice[]> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      if (voices && Array.isArray(voices)) {
        this.availableVoices = voices;
        this.notify();
      }
    } catch (err) {
      logger.warn(TAG, 'Unable to query available offline TTS voices', err);
    }
    return this.availableVoices;
  }

  private async initVoices() {
    await this.queryAvailableVoices();
  }

  async hydrateVoiceSelection(): Promise<void> {
    try {
      await this.queryAvailableVoices();
      const voiceIdentifier = await getBookRepository().getPreference<string | null>(
        VOICE_PREFERENCE_KEY,
        null
      );
      this.selectedVoiceIdentifier = voiceIdentifier || undefined;
      this.notify();
    } catch (err) {
      logger.warn(TAG, 'Unable to hydrate offline TTS voice selection', err);
    }
  }

  async saveVoiceSelection(): Promise<void> {
    const selectedVoiceIdentifier = this.selectedVoiceIdentifier || null;
    this.voiceSaveChain = this.voiceSaveChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await getBookRepository().setPreference(
            VOICE_PREFERENCE_KEY,
            selectedVoiceIdentifier
          );
        } catch (err) {
          logger.warn(TAG, 'Unable to persist offline TTS voice selection', err);
        }
      });
    await this.voiceSaveChain;
  }

  subscribe(listener: TtsListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  getState(): TtsState {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      rate: this.rate,
      pitch: this.pitch,
      currentSentenceIndex: this.currentIndex,
      totalSentences: this.sentences.length,
      currentText: this.sentences[this.currentIndex] || '',
      availableVoices: this.availableVoices,
      selectedVoiceIdentifier: this.selectedVoiceIdentifier,
    };
  }

  /**
   * Loads clean plain text or chapter content and splits it into sentences.
   */
  loadText(content: string, startIndex = 0) {
    this.stop();

    // Strip HTML tags if present
    const cleanText = content
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    // Split on sentence boundaries (period, question mark, exclamation, or newline)
    const rawSentences = cleanText.split(/(?<=[.?!])\s+/);
    this.sentences = rawSentences.filter((s) => s.trim().length > 0);
    this.currentIndex = Math.min(Math.max(0, startIndex), this.sentences.length - 1);
    this.notify();
  }

  async play() {
    if (this.sentences.length === 0) return;

    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.speakCurrent();
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.speakCurrent();
  }

  private speakCurrent() {
    if (!this.isPlaying || this.currentIndex >= this.sentences.length) {
      this.stop();
      return;
    }

    const textToSpeak = this.sentences[this.currentIndex];
    if (!textToSpeak || textToSpeak.trim().length === 0) {
      this.next();
      return;
    }

    this.notify();

    Speech.speak(textToSpeak, {
      rate: this.rate,
      pitch: this.pitch,
      voice: this.selectedVoiceIdentifier,
      onDone: () => {
        if (this.isPlaying && !this.isPaused) {
          if (this.currentIndex < this.sentences.length - 1) {
            this.currentIndex++;
            this.speakCurrent();
          } else {
            this.stop();
          }
        }
      },
      onStopped: () => {
        // Paused or stopped
      },
      onError: (err) => {
        logger.warn(TAG, 'TTS speak error', err);
        if (this.isPlaying && !this.isPaused) {
          this.next();
        }
      },
    });
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.isPaused = true;
    Speech.stop();
    this.notify();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    Speech.stop();
    this.notify();
  }

  next() {
    if (this.currentIndex < this.sentences.length - 1) {
      Speech.stop();
      this.currentIndex++;
      if (this.isPlaying) {
        this.speakCurrent();
      } else {
        this.notify();
      }
    } else {
      this.stop();
    }
  }

  previous() {
    if (this.currentIndex > 0) {
      Speech.stop();
      this.currentIndex--;
      if (this.isPlaying) {
        this.speakCurrent();
      } else {
        this.notify();
      }
    }
  }

  setRate(newRate: number) {
    this.rate = Math.max(0.5, Math.min(2.5, newRate));
    if (this.isPlaying) {
      Speech.stop();
      this.speakCurrent();
    } else {
      this.notify();
    }
  }

  setVoice(voiceId?: string) {
    this.selectedVoiceIdentifier = voiceId;
    void this.saveVoiceSelection();
    if (this.isPlaying) {
      Speech.stop();
      this.speakCurrent();
    } else {
      this.notify();
    }
  }

  jumpToSentence(index: number) {
    Speech.stop();
    this.currentIndex = Math.max(0, Math.min(index, this.sentences.length - 1));
    if (this.isPlaying) {
      this.speakCurrent();
    } else {
      this.notify();
    }
  }
}

export const ttsService = TtsService.getInstance();
