/**
 * Lirune Reader Mobile — Focused Full-Screen Reader Screen
 * Dispatches to format-specific engines and handles Android back navigation.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  BackHandler,
  ActivityIndicator,
  Text,
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
  } = useReaderStore();

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
          onSearchResults={setSearchResults}
        />
      )}

      {currentBook.format === 'pdf' && (
        <PdfReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          targetCfi={currentCfi}
          onSearchResults={setSearchResults}
        />
      )}

      {currentBook.format === 'txt' && (
        <TxtReaderView
          book={currentBook}
          settings={readerSettings}
          onToggleControls={toggleControls}
          onProgressChange={updateProgress}
          targetCfi={currentCfi}
          onSearchResults={setSearchResults}
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
          onSearchResults={setSearchResults}
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
          onSearchResults={setSearchResults}
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
      />

      {/* In-Book Search Sheet */}
      <SearchSheet
        visible={isSearchVisible}
        onClose={() => setSearchVisible(false)}
        results={searchResults}
        isSearching={isSearching}
        onSearch={(_q) => {
          // Handled within format views
        }}
        onSelectResult={handleSelectSearchResult}
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
        onSelectBookmark={handleSelectBookmark}
        onDeleteBookmark={deleteBookmark}
        onDeleteHighlight={deleteHighlight}
        onAddNote={(text) => addNote(text, currentCfi || '', currentChapter)}
        onDeleteNote={deleteNote}
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
});