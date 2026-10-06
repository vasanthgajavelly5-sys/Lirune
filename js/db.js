/**
 * Lirune Reader — IndexedDB Storage Engine
 * Persists EPUB metadata, reading progress, highlights, and notes.
 */

const NoveraDB = (() => {
  const DB_NAME = 'NoveraDB';
  const DB_VERSION = 3;
  let dbInstance = null;
  let dbPromise = null;
  let migrationPromise = null;

  function openDB() {
    if (dbInstance) return migrationPromise ? migrationPromise.then(() => dbInstance) : Promise.resolve(dbInstance);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Books store
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('dateAdded', 'dateAdded', { unique: false });
          bookStore.createIndex('lastReadDate', 'lastReadDate', { unique: false });
          bookStore.createIndex('title', 'title', { unique: false });
          bookStore.createIndex('fingerprint', 'fingerprint', { unique: false });
          bookStore.createIndex('storageId', 'storageId', { unique: false });
          bookStore.createIndex('favorite', 'favorite', { unique: false });
        } else {
          const bookStore = event.target.transaction.objectStore('books');
          if (!bookStore.indexNames.contains('fingerprint')) bookStore.createIndex('fingerprint', 'fingerprint', { unique: false });
          if (!bookStore.indexNames.contains('storageId')) bookStore.createIndex('storageId', 'storageId', { unique: false });
          if (!bookStore.indexNames.contains('favorite')) bookStore.createIndex('favorite', 'favorite', { unique: false });
        }

        // Annotations store (highlights, notes, bookmarks)
        if (!db.objectStoreNames.contains('annotations')) {
          const annStore = db.createObjectStore('annotations', { keyPath: 'id' });
          annStore.createIndex('bookId', 'bookId', { unique: false });
          annStore.createIndex('dateAdded', 'dateAdded', { unique: false });
          annStore.createIndex('type', 'type', { unique: false });
        }

        // Preferences store
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('collections')) {
          const collectionStore = db.createObjectStore('collections', { keyPath: 'id' });
          collectionStore.createIndex('name', 'name', { unique: false });
          collectionStore.createIndex('dateCreated', 'dateCreated', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        dbPromise = null;
        migrationPromise = migrateLegacyBooks().catch((error) => {
          console.error('NoveraDB legacy migration failed:', error);
        });
        migrationPromise.then(() => resolve(dbInstance));
      };

      request.onerror = (event) => {
        console.error('Failed to open NoveraDB:', event.target.error);
        dbPromise = null;
        reject(event.target.error);
      };
    });

    return dbPromise;
  }

  function metadataOnly(book) {
    if (!book) return book;
    const { fileData, ...metadata } = book;
    return metadata;
  }

  async function migrateLegacyBooks() {
    const db = dbInstance;
    const legacyBooks = await new Promise((resolve, reject) => {
      const request = db.transaction('books', 'readonly').objectStore('books').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    for (const book of legacyBooks) {
      if (!book.fileData || book.storageId || !window.noveraDesktop?.saveBookToStorage) continue;
      let storageId = null;
      let storageConfirmed = false;
      try {
        const digest = await crypto.subtle.digest('SHA-256', book.fileData);
        const fingerprint = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
        storageId = `${fingerprint}.epub`;
        const result = await window.noveraDesktop.saveBookToStorage(book.originalName || `${book.title || book.id}.epub`, book.fileData, storageId);
        if (!result?.success || result.storageId !== storageId) throw new Error('Managed storage did not confirm the EPUB write');
        storageConfirmed = true;
        const migrated = metadataOnly({ ...book, fingerprint, storageId, fileSize: book.fileSize || book.fileData.byteLength, schemaVersion: DB_VERSION });
        await new Promise((resolve, reject) => {
          const transaction = db.transaction('books', 'readwrite');
          transaction.objectStore('books').put(migrated);
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        });
      } catch (error) {
        console.error(`Could not migrate book ${book.id}:`, error);
        if (storageConfirmed) {
          try { await window.noveraDesktop.deleteBookFromStorage?.(storageId); } catch (_) {}
        }
      }
    }
  }

  // Generic transaction helper
  async function tx(storeName, mode, callback) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;

      try {
        result = callback(store);
      } catch (err) {
        reject(err);
      }

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  return {
    // Books API
    async getAllBooks() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readonly');
        const store = transaction.objectStore('books');
        const books = [];
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve(books);
            return;
          }

          books.push(metadataOnly(cursor.value));
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
    },

    async getBook(id) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readonly');
        const store = transaction.objectStore('books');
        const req = store.get(id);
        req.onsuccess = () => resolve(window.noveraDesktop ? metadataOnly(req.result) : req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async saveBook(bookData) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readwrite');
        const store = transaction.objectStore('books');
        const metadata = { favorite: false, collectionIds: [], ...(window.noveraDesktop ? metadataOnly(bookData) : bookData) };
        store.put(metadata);
        transaction.oncomplete = () => resolve(metadata);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    async updateBookMetadata(id, fields) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readwrite');
        const store = transaction.objectStore('books');
        const request = store.get(id);
        let result = null;
        request.onsuccess = () => {
          if (!request.result) return;
          result = Object.assign(request.result, fields || {});
          store.put(result);
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    async updateFavorite(id, favorite) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readwrite');
        const store = transaction.objectStore('books');
        const request = store.get(id);
        let result = null;
        request.onsuccess = () => {
          if (!request.result) return;
          request.result.favorite = Boolean(favorite);
          result = Boolean(favorite);
          store.put(request.result);
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    async updateAvailability(id, availability) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readwrite');
        const store = transaction.objectStore('books');
        const request = store.get(id);
        let result = null;
        request.onsuccess = () => {
          if (!request.result) return;
          request.result.availability = availability;
          result = availability;
          store.put(request.result);
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    async getCollections() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const request = db.transaction('collections', 'readonly').objectStore('collections').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },

    async saveCollection(collection) {
      return tx('collections', 'readwrite', store => store.put(collection));
    },

    async deleteCollection(id) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['collections', 'books'], 'readwrite');
        transaction.objectStore('collections').delete(id);
        const request = transaction.objectStore('books').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const book = cursor.value;
          if (Array.isArray(book.collectionIds) && book.collectionIds.includes(id)) {
            book.collectionIds = book.collectionIds.filter(collectionId => collectionId !== id);
            cursor.update(book);
          }
          cursor.continue();
        };
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      });
    },

    async setBookCollection(bookId, collectionId, included) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readwrite');
        const store = transaction.objectStore('books');
        const request = store.get(bookId);
        let result = null;
        request.onsuccess = () => {
          if (!request.result) return;
          const ids = Array.isArray(request.result.collectionIds) ? request.result.collectionIds : [];
          request.result.collectionIds = included
            ? Array.from(new Set([...ids, collectionId]))
            : ids.filter(id => id !== collectionId);
          result = request.result.collectionIds;
          store.put(request.result);
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    async updateProgress(id, { currentCfi, progressPercent, currentChapter, updateLastRead = true }) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('books', 'readwrite');
        const store = transaction.objectStore('books');
        const req = store.get(id);
        let result = null;
        req.onsuccess = () => {
          const book = req.result;
          if (!book) return;
          if (currentCfi !== undefined) book.currentCfi = currentCfi;
          if (progressPercent !== undefined) book.progressPercent = progressPercent;
          if (currentChapter !== undefined) book.currentChapter = currentChapter;
          if (updateLastRead) {
            book.lastReadDate = Date.now();
          }
          result = book;
          store.put(book);
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    async deleteBook(id) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['books', 'annotations'], 'readwrite');
        const bookStore = transaction.objectStore('books');
        const annStore = transaction.objectStore('annotations');

        bookStore.delete(id);

        // Delete all associated annotations
        const annIndex = annStore.index('bookId');
        const annReq = annIndex.getAllKeys(id);
        annReq.onsuccess = () => {
          annReq.result.forEach(k => annStore.delete(k));
        };

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      });
    },

    // Annotations API
    async getAnnotations(bookId) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('annotations', 'readonly');
        const store = transaction.objectStore('annotations');
        const index = store.index('bookId');
        const req = index.getAll(bookId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async getAllAnnotations() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const request = db.transaction('annotations', 'readonly').objectStore('annotations').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },

    async getAllPreferences() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const request = db.transaction('preferences', 'readonly').objectStore('preferences').getAll();
        request.onsuccess = () => resolve(Object.fromEntries((request.result || []).map(item => [item.key, item.value])));
        request.onerror = () => reject(request.error);
      });
    },

    async saveAnnotation(annotation) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('annotations', 'readwrite');
        const store = transaction.objectStore('annotations');
        store.put(annotation);
        transaction.oncomplete = () => resolve(annotation);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    async deleteAnnotation(id) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('annotations', 'readwrite');
        const store = transaction.objectStore('annotations');
        store.delete(id);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      });
    },

    // Preferences API
    async getPref(key, defaultValue = null) {
      try {
        const db = await openDB();
        return new Promise((resolve) => {
          const transaction = db.transaction('preferences', 'readonly');
          const store = transaction.objectStore('preferences');
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
          req.onerror = () => resolve(defaultValue);
        });
      } catch (e) {
        return defaultValue;
      }
    },

    async setPref(key, value) {
      try {
        const db = await openDB();
        return new Promise((resolve) => {
          const transaction = db.transaction('preferences', 'readwrite');
          const store = transaction.objectStore('preferences');
          store.put({ key, value });
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
        });
      } catch (e) {
        return false;
      }
    }
  };
})();
