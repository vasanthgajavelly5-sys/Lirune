const test = require('node:test');
const assert = require('node:assert/strict');

function selectCurrentlyReadingBooks(allBooks, limit = 2) {
  const readBooks = allBooks.filter(b => b.lastReadDate && b.lastReadDate > 0);
  if (readBooks.length === 0) return [];

  readBooks.sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0));

  const seenIds = new Set();
  const booksToDisplay = [];
  for (const b of readBooks) {
    if (!seenIds.has(b.id)) {
      seenIds.add(b.id);
      booksToDisplay.push(b);
      if (booksToDisplay.length === limit) break;
    }
  }
  return booksToDisplay;
}

test('0 currently-reading books returns empty array', () => {
  const books = [
    { id: '1', title: 'Book 1', lastReadDate: 0, progressPercent: 0 },
    { id: '2', title: 'Book 2', lastReadDate: null, progressPercent: 0 }
  ];
  const result = selectCurrentlyReadingBooks(books, 2);
  assert.equal(result.length, 0);
});

test('1 currently-reading book returns single item', () => {
  const books = [
    { id: '1', title: 'Book 1', lastReadDate: 1000, progressPercent: 25 },
    { id: '2', title: 'Book 2', lastReadDate: 0, progressPercent: 0 }
  ];
  const result = selectCurrentlyReadingBooks(books, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '1');
  assert.equal(result[0].progressPercent, 25);
});

test('2 currently-reading books returns both items in MRU order', () => {
  const books = [
    { id: '1', title: 'Book 1', lastReadDate: 1000, progressPercent: 20 },
    { id: '2', title: 'Book 2', lastReadDate: 2000, progressPercent: 70 },
    { id: '3', title: 'Book 3', lastReadDate: 0, progressPercent: 0 }
  ];
  const result = selectCurrentlyReadingBooks(books, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, '2'); // newer
  assert.equal(result[0].progressPercent, 70);
  assert.equal(result[1].id, '1'); // older
  assert.equal(result[1].progressPercent, 20);
});

test('3 currently-reading books strictly capped at 2', () => {
  const books = [
    { id: '1', title: 'Book 1', lastReadDate: 1000, progressPercent: 10 },
    { id: '2', title: 'Book 2', lastReadDate: 2000, progressPercent: 50 },
    { id: '3', title: 'Book 3', lastReadDate: 3000, progressPercent: 85 }
  ];
  const result = selectCurrentlyReadingBooks(books, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, '3');
  assert.equal(result[0].progressPercent, 85);
  assert.equal(result[1].id, '2');
  assert.equal(result[1].progressPercent, 50);
});

test('duplicate protection prevents same book appearing twice', () => {
  const books = [
    { id: '1', title: 'Book 1', lastReadDate: 3000, progressPercent: 40 },
    { id: '1', title: 'Book 1 (reopened)', lastReadDate: 2000, progressPercent: 35 },
    { id: '2', title: 'Book 2', lastReadDate: 1000, progressPercent: 80 }
  ];
  const result = selectCurrentlyReadingBooks(books, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, '1');
  assert.equal(result[1].id, '2');
});
