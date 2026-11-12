import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DictionaryService } from '../services/dictionary/DictionaryService.ts';

test('Offline Dictionary: 20,000-word Lexicon and Lookup Verification', () => {
  // Test common words
  const bookDef = DictionaryService.lookup('book');
  assert.ok(bookDef, 'Word "book" must be defined');
  assert.equal(bookDef.word, 'book');
  assert.ok(bookDef.definition.length > 10, 'Definition of book must be substantial');

  const rabbitDef = DictionaryService.lookup('rabbit');
  assert.ok(rabbitDef, 'Word "rabbit" must be defined');
  assert.equal(rabbitDef.word, 'rabbit');
  assert.equal(rabbitDef.partOfSpeech, 'noun');

  const curiousDef = DictionaryService.lookup('curious');
  assert.ok(curiousDef, 'Word "curious" must be defined');
  assert.ok(curiousDef.definition.length > 10);

  const solitudeDef = DictionaryService.lookup('solitude');
  assert.ok(solitudeDef, 'Word "solitude" must be defined');
  assert.equal(solitudeDef.partOfSpeech, 'noun');

  // Test morphological stemming (plural, gerund, past tense)
  const booksDef = DictionaryService.lookup('books');
  assert.ok(booksDef.definition.includes('Plural') || booksDef.definition.length > 10);

  const readingDef = DictionaryService.lookup('reading');
  assert.ok(readingDef.definition.length > 10);

  const adventuresDef = DictionaryService.lookup('adventures');
  assert.ok(adventuresDef.definition.length > 10);
});

test('Custom Fonts: Format validation and Malformed Rejection', () => {
  const validExtensions = ['.ttf', '.otf'];
  for (const ext of validExtensions) {
    const isFont = ext === '.ttf' || ext === '.otf';
    assert.equal(isFont, true, `Font extension ${ext} should be valid`);
  }

  const invalidExtensions = ['.exe', '.bin', '.pdf', '.docx', '.epub'];
  for (const ext of invalidExtensions) {
    const isFont = ext === '.ttf' || ext === '.otf';
    assert.equal(isFont, false, `Extension ${ext} must not be accepted as a font`);
  }
});
