import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RtfParser } from '../services/rtf/RtfParser.ts';

test('RTF parser removes ignorable Word destinations from rendered body', () => {
  const parsed = RtfParser.parse(
    String.raw`{\rtf1\ansi{\*\generator Microsoft Word 11.0.6568;}{\info{\title Sample}}\pard Test d\rquote indexation Word\par Hex d\'92indexation Word\par}`
  );

  assert.equal(parsed.metadata.title, 'Sample');
  assert.match(parsed.html, /Test d’indexation Word/);
  assert.match(parsed.html, /Hex d’indexation Word/);
  assert.doesNotMatch(parsed.html, /Microsoft Word|\\\*\\generator/);
});
