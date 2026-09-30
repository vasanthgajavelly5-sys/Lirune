/**
 * Lirune Reader Mobile — Focused Full-Screen Reader Screen
 * Dispatches to format-specific engines and handles Android back navigation.
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  BackHandler,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReaderStore } from '@/state/readerStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useSettingsStore } from '@/state/settingsStore';
import { EpubReaderView } from '@/components/reader/EpubReaderView';
import { PdfReaderView } from '@/components/reader/PdfReaderView';
import { TxtReaderView } from '@/components/reader/TxtReaderView';
import { HtmlReaderView } from '@/components/reader/HtmlReaderView';
import { Fb2ReaderView } from '@/components/reader/Fb2ReaderView';
import { CbzReaderView } from '@/components/reader/CbzReaderView';
import { ReaderControls } from '@/components/reader/ReaderControls';
import { ChapterSheet } from '@/components/reader/ChapterSheet';
import { SearchSheet } from '@/components/reader/SearchSheet';
import { SettingsSheet } from '@/components/reader/SettingsSheet';
import { AnnotationsSheet } from '@/components/reader/AnnotationsSheet';
import { READER_THEMES } from '@/theme/Colors';
import { Bookmark, TOCItem, SearchResult } from '@/models/Book';
import type { SelectionPayload } from '@/services/reader/selectionBridge';

const HIGHLIGHT_COLORS = ['#FFEB3B', '#4ECDC4', '#FF8A80'];

export default function ReaderScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const { books } = useLibraryStore();
  const { readerSettings, updateReaderSettings, resetReaderSettings } = useSettingsStore();

  const {
    currentBook,
    progressPercent,
    currentCfi,
    currentChapter,
    toc,
    bookmarks,
    highlights,
    notes,
    isControlsVisible,
    isTOCVisible,
    isSearchVisible,
    isSettingsVisible,
    isAnnotationsVisible,
    searchResults,
    searchQuery,
    isSearching,
    openBook,
    closeBook,
    updateProgress,
    toggleBookmark,
    deleteBookmark,
    deleteHighlight,
    addNote,
    deleteNote,
    setTOC,
    setTOCVisible,
    setSearchVisible,
    setSettingsVisible,
    setAnnotationsVisible,
    toggleControls,
    setSearchResults,
    setSearchQuery,
    setIsSearching,
    addHighlight,
  } = useReaderStore();

  // Live text selection reported by the reader engine, used to offer the
  // highlight action. Empty text means the selection was dismissed.
  const [selection, setSelection] = useState<SelectionPayload>({ text: '', top: 0 });

  const handleSelectionChange = useCallback((next: SelectionPayload) => {
    setSelection((prev) =>
      prev.text === next.text ? prev : next
    );
  }, []);

  const handleCreateHighlight = useCallback(
    async (color: string) => {
      const text = selection.text.trim();
      if (!text) return;
      await addHighlight(text, color, currentCfi || '', undefined);
      setSelection({ text: '', top: 0 });
    },
    [selection.text, currentCfi, addHighlight]
  );

  // 1. Initialize book if not already open
  useEffect(() => {
    if (bookId && (!currentBook || currentBook.id !== bookId)) {
      const bookToOpen = books.find((b) => b.id === bookId);
      if (bookToOpen) {
        openBook(bookToOpen);
      }
    }
  }, [bookId, books, currentBook, openBook]);

  // 2. Android Hardware Back Button Handling
  const handleExitReader = useCallback(async () => {
    // If any overlay sheet is open, close it first
    if (isTOCVisible) {
      setTOCVisible(false);
      return true;
    }
    if (isSearchVisible) {
      setSearchVisible(false);
      return true;
    }
    if (isSettingsVisible) {
      setSettingsVisible(false);
      return true;
    }
    if (isAnnotationsVisible) {
      setAnnotationsVisible(false);
      return true;
    }

    // Otherwise close reader and navigate back
    await closeBook();
    router.back();
    return true;
  }, [
    isTOCVisible,
    isSearchVisible,
    isSettingsVisible,
    isAnnotationsVisible,
    closeBook,
    router,
    setTOCVisible,
    setSearchVisible,
    setSettingsVisible,
    setAnnotationsVisible,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleExitReader();
        return true;
      }
    );
    return () => subscription.remove();
  }, [handleExitReader]);

  const handleSearchResults = useCallback(
    (results: SearchResult[]) => {
      setSearchResults(results);
      setIsSearching(false);
    },
    [setSearchResults, setIsSearching]
  );

  if (!currentBook) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar hidden={false} barStyle="light-content" />
        <ActivityIndicator size="large" color="#C9B8FF" />
        <Text style={styles.loadingText}>Opening book...</Text>
      </View>
    );
  }

  const isBookmarked = bookmarks.some((b) => b.cfi === currentCfi);
  const palette = READER_THEMES[readerSettings.theme] || READER_THEMES.night;

  // Jump handlers
  const handleSelectChapter = (item: TOCItem, index: number) => {
    if (item.href) {
      updateProgress(progressPercent, item.href, item.label);
    } else {
      updateProgress(progressPercent, `spine:${index}`, item.label);
    }
  };

  const handleSelectBookmark = (bookmark: Bookmark) => {
    updateProgress(progressPercent, bookmark.cfi, bookmark.chapter);
  };

  const handleSelectSearchResult = (result: SearchResult) => {
    setSearchVisible(false);
    updateProgress(progressPercent, result.cfi, result.label);
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <StatusBar
        hidden={!isControlsVisible}
        barStyle={
          readerSettings.theme === 'night' || readerSettings.theme.startsWith('contrast')
            ? 'light-content'
            : 'dark-content'
        }
      />

      {/* Format-Specific Engine View */}
      {currentBook.format === 'epub' && (
        <EpubReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          onTOCLoaded={setTOC}
          targetCfi={currentCfi}
          onSearchResults={handleSearchResults}
          onSelectionChange={handleSelectionChange}
          searchQuery={searchQuery}
        />
      )}

      {currentBook.format === 'pdf' && (
        <PdfReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          targetCfi={currentCfi}
          onSearchResults={handleSearchResults}
          searchQuery={searchQuery}
        />
      )}

      {currentBook.format === 'txt' && (
        <TxtReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          targetCfi={currentCfi}
          onSearchResults={handleSearchResults}
          searchQuery={searchQuery}
        />
      )}

      {currentBook.format === 'html' && (
        <HtmlReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          onTOCLoaded={setTOC}
          targetCfi={currentCfi}
          onSearchResults={handleSearchResults}
          onSelectionChange={handleSelectionChange}
          searchQuery={searchQuery}
        />
      )}

      {currentBook.format === 'fb2' && (
        <Fb2ReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          onTOCLoaded={setTOC}
          targetCfi={currentCfi}
          onSearchResults={handleSearchResults}
          onSelectionChange={handleSelectionChange}
          searchQuery={searchQuery}
        />
      )}

      {currentBook.format === 'cbz' && (
        <CbzReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          targetCfi={currentCfi}
        />
      )}

      {/* Highlight action bar, shown while text is selected */}
      {selection.text.trim().length > 0 && (
        <View style={[styles.highlightBar, { backgroundColor: palette.surface ?? '#1A1A1D' }]}>
          {HIGHLIGHT_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              accessibilityLabel={`Highlight in ${color}`}
              style={[styles.highlightSwatch, { backgroundColor: color }]}
              onPress={() => handleCreateHighlight(color)}
            />
          ))}
          <TouchableOpacity
            accessibilityLabel="Dismiss selection"
            onPress={() => setSelection({ text: '', top: 0 })}
            style={styles.highlightCancel}
          >
            <Text style={{ color: palette.muted ?? '#B8B8B0', fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Overlay Navigation Controls */}
      {isControlsVisible && (
        <ReaderControls
          book={currentBook}
          themeName={readerSettings.theme}
          progressPercent={progressPercent}
          currentChapter={currentChapter}
          isBookmarked={isBookmarked}
          onBack={handleExitReader}
          onToggleBookmark={toggleBookmark}
          onOpenTOC={() => setTOCVisible(true)}
          onOpenSearch={() => setSearchVisible(true)}
          onOpenSettings={() => setSettingsVisible(true)}
          onOpenAnnotations={() => setAnnotationsVisible(true)}
        />
      )}

      {/* Chapter Sheet (TOC) */}
      <ChapterSheet
        visible={isTOCVisible}
        onClose={() => setTOCVisible(false)}
        toc={toc}
        currentCfi={currentCfi}
        onSelectChapter={handleSelectChapter}
        themeName={readerSettings.theme}
      />

      {/* In-Book Search Sheet */}
      <SearchSheet
        visible={isSearchVisible}
        onClose={() => {
          setSearchVisible(false);
          setSearchQuery('');
          setIsSearching(false);
        }}
        results={searchResults}
        isSearching={isSearching}
        onSearch={(q) => {
          setSearchQuery(q);
          setIsSearching(q.trim().length > 0);
        }}
        onSelectResult={handleSelectSearchResult}
        themeName={readerSettings.theme}
      />

      {/* Reader Display Settings Sheet */}
      <SettingsSheet
        visible={isSettingsVisible}
        onClose={() => setSettingsVisible(false)}
        settings={readerSettings}
        onUpdateSettings={updateReaderSettings}
        onResetSettings={resetReaderSettings}
      />

      {/* Bookmarks, Highlights & Notes Sheet */}
      <AnnotationsSheet
        visible={isAnnotationsVisible}
        onClose={() => setAnnotationsVisible(false)}
        bookmarks={bookmarks}
        highlights={highlights}
        notes={notes}
        format={currentBook.format}
        onSelectBookmark={handleSelectBookmark}
        onDeleteBookmark={deleteBookmark}
        onDeleteHighlight={deleteHighlight}
        onAddNote={(text) => addNote(text, currentCfi || '', currentChapter)}
        onDeleteNote={deleteNote}
        themeName={readerSettings.theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1A1A1D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#B8B8B0',
    fontSize: 14,
  },
  highlightBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    elevation: 6,
  },
  highlightSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  highlightCancel: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});