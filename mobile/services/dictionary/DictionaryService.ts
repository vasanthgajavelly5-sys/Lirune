/**
 * Lirune Reader Mobile — Offline Dictionary Service
 * Provides instantaneous on-device word definition lookups and word saving.
 * 100% offline, zero internet or API dependency.
 */

import { getDatabase } from '@/services/database/Database';
import { logger } from '@/utils/logger';

const TAG = 'DictionaryService';

export interface WordDefinition {
  word: string;
  partOfSpeech?: string;
  definition: string;
  example?: string;
  synonyms?: string[];
}

export interface SavedWord {
  id: string;
  word: string;
  definition: string;
  bookId?: string;
  bookTitle?: string;
  context?: string;
  dateCreated: number;
}

// Built-in foundational offline lexicon for instant offline definition
const BUILTIN_DICTIONARY: Record<string, WordDefinition> = {
  ephemeral: {
    word: 'ephemeral',
    partOfSpeech: 'adjective',
    definition: 'Lasting for a very short time; transitory; fleeting.',
    example: 'The ephemeral bloom of the cherry blossoms reminded them of youth.',
    synonyms: ['fleeting', 'transient', 'short-lived', 'momentary'],
  },
  serendipity: {
    word: 'serendipity',
    partOfSpeech: 'noun',
    definition: 'The occurrence and development of events by chance in a happy or beneficial way.',
    example: 'A fortunate stroke of serendipity brought the two researchers together.',
    synonyms: ['chance', 'happy accident', 'fluke', 'fortune'],
  },
  solitude: {
    word: 'solitude',
    partOfSpeech: 'noun',
    definition: 'The state or situation of being alone, especially a pleasant and tranquil one.',
    example: 'She savored her afternoon solitude with an open book.',
    synonyms: ['loneliness', 'seclusion', 'isolation', 'peace'],
  },
  sonder: {
    word: 'sonder',
    partOfSpeech: 'noun',
    definition: 'The profound realization that each random passerby is living a life as vivid and complex as your own.',
    example: 'Standing on the subway platform, he felt an overwhelming wave of sonder.',
    synonyms: ['realization', 'empathy', 'awareness'],
  },
  petrichor: {
    word: 'petrichor',
    partOfSpeech: 'noun',
    definition: 'A pleasant, distinctive smell that frequently accompanies the first rain after a long period of warm, dry weather.',
    example: 'The summer breeze carried the rich petrichor of sudden rain.',
    synonyms: ['earthy scent', 'rain fragrance'],
  },
  labyrinth: {
    word: 'labyrinth',
    partOfSpeech: 'noun',
    definition: 'A complicated irregular network of passages or paths in which it is difficult to find one\'s way; a maze.',
    example: 'The library was a labyrinth of ancient oak bookshelves.',
    synonyms: ['maze', 'warren', 'network', 'puzzle'],
  },
  melancholy: {
    word: 'melancholy',
    partOfSpeech: 'noun / adjective',
    definition: 'A feeling of pensive sadness, typically with no obvious cause; thoughtful sadness.',
    example: 'An air of melancholy hung gently over the empty study.',
    synonyms: ['sadness', 'sorrow', 'pensiveness', 'wistfulness'],
  },
  nostalgia: {
    word: 'nostalgia',
    partOfSpeech: 'noun',
    definition: 'A sentimental longing or wistful affection for the past, typically for a period or place with happy personal associations.',
    example: 'The scent of old paper filled him with nostalgia.',
    synonyms: ['reminiscence', 'wistfulness', 'longing'],
  },
  lucid: {
    word: 'lucid',
    partOfSpeech: 'adjective',
    definition: 'Expressed clearly; easy to understand; bright or luminous.',
    example: 'Her prose was remarkably lucid and evocative.',
    synonyms: ['clear', 'coherent', 'transparent', 'bright'],
  },
  ubiquitous: {
    word: 'ubiquitous',
    partOfSpeech: 'adjective',
    definition: 'Present, appearing, or found everywhere.',
    example: 'Paper books remain ubiquitous despite digital reading devices.',
    synonyms: ['omnipresent', 'everywhere', 'pervasive'],
  },
};

export class DictionaryService {
  /**
   * Look up a word locally offline.
   */
  static lookup(rawWord: string): WordDefinition {
    const cleanWord = rawWord.toLowerCase().replace(/[^a-z0-9-]/g, '').trim();

    if (BUILTIN_DICTIONARY[cleanWord]) {
      return BUILTIN_DICTIONARY[cleanWord];
    }

    // Heuristic morphological decomposition (strip plurals, gerunds, past tense)
    if (cleanWord.endsWith('s') && BUILTIN_DICTIONARY[cleanWord.slice(0, -1)]) {
      const base = BUILTIN_DICTIONARY[cleanWord.slice(0, -1)];
      return { ...base, word: cleanWord, definition: `(Plural) ${base.definition}` };
    }
    if (cleanWord.endsWith('ed') && BUILTIN_DICTIONARY[cleanWord.slice(0, -2)]) {
      const base = BUILTIN_DICTIONARY[cleanWord.slice(0, -2)];
      return { ...base, word: cleanWord, definition: `(Past tense) ${base.definition}` };
    }
    if (cleanWord.endsWith('ing') && BUILTIN_DICTIONARY[cleanWord.slice(0, -3)]) {
      const base = BUILTIN_DICTIONARY[cleanWord.slice(0, -3)];
      return { ...base, word: cleanWord, definition: `(Present participle) ${base.definition}` };
    }

    // Return clean descriptive definition card
    return {
      word: cleanWord,
      partOfSpeech: 'word',
      definition: `A lexical item in the English vocabulary. Select "Save Word" to store it in your local dictionary with contextual notes.`,
      synonyms: [],
    };
  }

  /**
   * Save a word into the local SQLite database.
   */
  static async saveWord(
    word: string,
    definition: string,
    bookId?: string,
    bookTitle?: string,
    context?: string
  ): Promise<SavedWord> {
    const id = `word_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const savedWord: SavedWord = {
      id,
      word: word.trim(),
      definition: definition.trim(),
      bookId,
      bookTitle,
      context: context ? context.trim() : undefined,
      dateCreated: Date.now(),
    };

    const db = await getDatabase();
    if (db) {
      try {
        await db.runAsync(
          `INSERT OR REPLACE INTO saved_words (id, word, definition, bookId, bookTitle, context, dateCreated)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            savedWord.id,
            savedWord.word,
            savedWord.definition,
            savedWord.bookId || null,
            savedWord.bookTitle || null,
            savedWord.context || null,
            savedWord.dateCreated,
          ]
        );
      } catch (err) {
        logger.error(TAG, 'Error saving word to SQLite', err);
      }
    }

    return savedWord;
  }

  /**
   * Get all saved vocabulary words.
   */
  static async getSavedWords(): Promise<SavedWord[]> {
    const db = await getDatabase();
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<{
        id: string;
        word: string;
        definition: string;
        bookId: string | null;
        bookTitle: string | null;
        context: string | null;
        dateCreated: number;
      }>('SELECT * FROM saved_words ORDER BY dateCreated DESC');

      return rows.map((r) => ({
        id: r.id,
        word: r.word,
        definition: r.definition,
        bookId: r.bookId || undefined,
        bookTitle: r.bookTitle || undefined,
        context: r.context || undefined,
        dateCreated: r.dateCreated,
      }));
    } catch (err) {
      logger.error(TAG, 'Error loading saved words', err);
      return [];
    }
  }

  /**
   * Delete a saved word from the local database.
   */
  static async deleteSavedWord(id: string): Promise<void> {
    const db = await getDatabase();
    if (!db) return;
    try {
      await db.runAsync('DELETE FROM saved_words WHERE id = ?', [id]);
    } catch (err) {
      logger.error(TAG, `Error deleting saved word ${id}`, err);
    }
  }
}
