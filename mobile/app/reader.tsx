/**
 * Lirune Reader Mobile — Focused Full-Screen Reader Screen
 * Dispatches to format-specific engines and handles Android back navigation,
 * canonical source resolution, error boundaries, and edge-to-edge safe areas.
 */

import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  BackHandler,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useReaderStore } from '@/state/readerStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useSettingsStore } from '@/state/settingsStore';
import { SourceResolver } from '@/services/storage/SourceResolver';
import { ReaderErrorBoundary } from '@/components/reader/ReaderErrorBoundary';
import { EpubReaderView } from '@/components/reader/EpubReaderView';
import { PdfReaderView } from '@/components/reader/PdfReaderView';
import { TxtReaderView } from '@/components/reader/TxtReaderView';
import { HtmlReaderView } from '@/components/reader/HtmlReaderView';
import { Fb2ReaderView } from '@/components/reader/Fb2ReaderView';
import { CbzReaderView } from '@/components/reader/CbzReaderView';
import { MobiReaderView } from '@/components/reader/MobiReaderView';
import { DocxReaderView } from '@/components/reader/DocxReaderView';
import { OdtReaderView } from '@/components/reader/OdtReaderView';
import { RtfReaderView } from '@/components/reader/RtfReaderView';
import { DocReaderView } from '@/components/reader/DocReaderView';
import { ChmReaderView } from '@/components/reader/ChmReaderView';
import { DjvuReaderView } from '@/components/reader/DjvuReaderView';
import { CbrReaderView } from '@/components/reader/CbrReaderView';
import { ReaderControls } from '@/components/reader/ReaderControls';
import { ChapterSheet } from '@/components/reader/ChapterSheet';
import { SearchSheet } from '@/components/reader/SearchSheet';
import { SettingsSheet } from '@/components/reader/SettingsSheet';
import { AnnotationsSheet } from '@/components/reader/AnnotationsSheet';
import { TtsControlsSheet } from '@/components/reader/TtsControlsSheet';
import { DictionaryModal } from '@/components/reader/DictionaryModal';
import { ThumbnailsSheet } from '@/components/reader/ThumbnailsSheet';
import { ttsService } from '@/services/tts/TtsService';
import { READER_THEMES } from '@/theme/Colors';
import { Bookmark, TOCItem, SearchResult, Book } from '@/models/Book';
import type { SelectionPayload } from '@/services/reader/selectionBridge';
import { SourceUnavailableError, UnsupportedFormatError } from '@/utils/errors';
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';

const TAG = 'ReaderScreen';
const HIGHLIGHT_COLORS = ['#FFEB3B', '#4ECDC4', '#FF8A80', '#A8E6CF', '#FFD3B6', '#DED2F9'];

type ReaderResolutionStatus = 'resolving' | 'loading' | 'ready' | 'failed' | 'unavailable' | 'unsupported';

export default function ReaderScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const insets = useSafeAreaInsets();
  const isExitingRef = useRef(false);

  const { books } = useLibraryStore();
  const { readerSettings, updateReaderSettings, resetReaderSettings, accessibility } = useSettingsStore();
  const effectiveSettings = useMemo(
    () => ({
      ...readerSettings,
      fontSize: Math.round(readerSettings.fontSize * (accessibility.readerFontScaling || 1.0)),
    }),
    [readerSettings, accessibility.readerFontScaling]
  );

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

  const [resolutionStatus, setResolutionStatus] = useState<ReaderResolutionStatus>('resolving');
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionPayload>({ text: '', top: 0 });
  const [readerContentText, setReaderContentText] = useState('');
  const [isTtsVisible, setIsTtsVisible] = useState(false);
  const [isDictionaryVisible, setIsDictionaryVisible] = useState(false);
  const [isThumbnailsVisible, setIsThumbnailsVisible] = useState(false);

  const handleSelectionChange = useCallback((next: SelectionPayload) => {
    setSelection((prev) => (prev.text === next.text ? prev : next));
  }, []);

  const handleOpenTTS = useCallback(() => {
    if (!currentBook) return;
    const textToSpeak = selection.text.trim() || readerContentText.trim();

    ttsService.loadText(textToSpeak || `${currentBook.title}. By ${currentBook.author || 'Unknown'}.`);
    setIsTtsVisible(true);
  }, [currentBook, readerContentText, selection.text]);

  const handleCreateHighlight = useCallback(
    async (color: string) => {
      const text = selection.text.trim();
      if (!text) return;
      await addHighlight(text, color, currentCfi || '', undefined);
      setSelection({ text: '', top: 0 });
    },
    [selection.text, currentCfi, addHighlight]
  );

  // 1. Initialize book from ID if not already loaded in store
  useEffect(() => {
    if (bookId && (!currentBook || currentBook.id !== bookId)) {
      const bookToOpen = books.find((b) => b.id === bookId);
      if (bookToOpen) {
        openBook(bookToOpen);
      }
    }
  }, [bookId, books, currentBook, openBook]);

  // 2. Canonical Source Resolution
  const resolveCurrentBook = useCallback(async (book: Book) => {
    setResolutionStatus('resolving');
    setErrorMessage(null);
    try {
      logger.info(TAG, `Resolving source for "${book.title}" (${book.id})`);
      const resolved = await SourceResolver.resolve(book);
      setResolvedPath(resolved.localPath);
      setResolutionStatus('ready');
      logger.info(TAG, `Source ready at: ${resolved.localPath}`);
    } catch (err: any) {
      logger.error(TAG, `Source resolution error for "${book.title}"`, err);
      if (err instanceof UnsupportedFormatError || err.name === 'UnsupportedFormatError') {
        setResolutionStatus('unsupported');
        setErrorMessage(err.message || 'This document format is not supported.');
      } else if (err instanceof SourceUnavailableError || err.name === 'SourceUnavailableError') {
        setResolutionStatus('unavailable');
        setErrorMessage(err.message || 'Original file is no longer accessible at this location.');
      } else {
        setResolutionStatus('failed');
        setErrorMessage(err.message || 'Could not load document.');
      }
    }
  }, []);

  const [retryCount, setRetryCount] = useState(0);

  const handleUpdateChapterCount = useCallback(
    async (count: number) => {
      if (!currentBook || currentBook.chapterCount === count || count <= 0) return;
      try {
        const updatedBook: Book = { ...currentBook, chapterCount: count };
        const repo = getBookRepository();
        await repo.updateBook(updatedBook);
        useLibraryStore.getState().updateBook(updatedBook);
        useReaderStore.setState({ currentBook: updatedBook });
      } catch (err) {
        logger.warn(TAG, 'Failed to persist document chapter/page count', err);
      }
    },
    [currentBook]
  );

  useEffect(() => {
    if (currentBook) {
      resolveCurrentBook(currentBook);
    }
  }, [currentBook, resolveCurrentBook]);

  // 3. Android Hardware & Gesture Back Button Handling
  const handleExitReader = useCallback(async () => {
    if (isExitingRef.current) return true;
    isExitingRef.current = true;

    try {
      if (isTOCVisible) {
        setTOCVisible(false);
        isExitingRef.current = false;
        return true;
      }
      if (isSearchVisible) {
        setSearchVisible(false);
        isExitingRef.current = false;
        return true;
      }
      if (isSettingsVisible) {
        setSettingsVisible(false);
        isExitingRef.current = false;
        return true;
      }
      if (isAnnotationsVisible) {
        setAnnotationsVisible(false);
        isExitingRef.current = false;
        return true;
      }
      if (isTtsVisible) {
        setIsTtsVisible(false);
        ttsService.stop();
        isExitingRef.current = false;
        return true;
      }
      if (isDictionaryVisible) {
        setIsDictionaryVisible(false);
        isExitingRef.current = false;
        return true;
      }
      if (isThumbnailsVisible) {
        setIsThumbnailsVisible(false);
        isExitingRef.current = false;
        return true;
      }

      ttsService.stop();
      await closeBook();
      router.replace({ pathname: '/(tabs)/library' });
      return true;
    } finally {
      setTimeout(() => {
        isExitingRef.current = false;
      }, 300);
    }
  }, [
    isTOCVisible,
    isSearchVisible,
    isSettingsVisible,
    isAnnotationsVisible,
    isTtsVisible,
    isDictionaryVisible,
    isThumbnailsVisible,
    closeBook,
    router,
    setTOCVisible,
    setSearchVisible,
    setSettingsVisible,
    setAnnotationsVisible,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExitReader();
      return true;
    });
    return () => subscription.remove();
  }, [handleExitReader]);

  // Re-link missing file handler
  const handleRelinkFile = useCallback(async () => {
    if (!currentBook) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newAsset = result.assets[0];
        const updatedBook = await SourceResolver.relinkSource(currentBook, newAsset.uri);
        openBook(updatedBook);
        resolveCurrentBook(updatedBook);
      }
    } catch (err) {
      logger.error(TAG, 'Error during re-link picker', err);
    }
  }, [currentBook, openBook, resolveCurrentBook]);

  const palette = READER_THEMES[readerSettings.theme] || READER_THEMES.sepia;
  const isThemeDark = readerSettings.theme === 'night' || readerSettings.theme.startsWith('contrast');

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

  const handleSearchResults = useCallback(
    (results: SearchResult[]) => {
      setSearchResults(results);
      setIsSearching(false);
    },
    [setSearchResults, setIsSearching]
  );

  // Status Screen: Resolving / Loading
  if (!currentBook || resolutionStatus === 'resolving') {
    return (
      <View style={[styles.statusContainer, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar hidden={false} barStyle={isThemeDark ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color={palette.link || (isThemeDark ? '#C9B8FF' : '#4C4666')} />
        <Text style={[styles.statusTitle, { color: palette.text }]}>
          {currentBook ? currentBook.title : 'Opening book...'}
        </Text>
        <Text style={[styles.statusSubtitle, { color: palette.muted }]}>
          Preparing document reader...
        </Text>
      </View>
    );
  }

  // Status Screen: Source Unavailable (Permissions lost / File moved)
  if (resolutionStatus === 'unavailable') {
    return (
      <View style={[styles.statusContainer, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar hidden={false} barStyle={isThemeDark ? 'light-content' : 'dark-content'} />
        <View style={styles.errorIconOrb}>
          <Ionicons name="folder-open-outline" size={42} color="#FFA726" />
        </View>
        <Text style={[styles.statusTitle, { color: palette.text }]}>{currentBook.title}</Text>
        <Text style={[styles.statusSubtitle, { color: palette.muted }]}>
          Source File Unavailable
        </Text>
        <Text style={styles.errorDescription}>
          The original file could not be accessed. Permissions may have expired or the file was moved from its original folder.
        </Text>

        <View style={styles.recoveryBtnRow}>
          <TouchableOpacity
            style={[styles.primaryRecoveryBtn, { backgroundColor: palette.link || (isThemeDark ? '#C9B8FF' : '#4C4666') }]}
            onPress={handleRelinkFile}
            activeOpacity={0.8}
          >
            <Ionicons name="link-outline" size={18} color={isThemeDark ? '#1A1A1D' : '#FFFFFF'} style={{ marginRight: 6 }} />
            <Text style={[styles.primaryRecoveryBtnText, { color: isThemeDark ? '#1A1A1D' : '#FFFFFF' }]}>Re-link File</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryRecoveryBtn, { borderColor: isThemeDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]}
            onPress={handleExitReader}
            activeOpacity={0.7}
          >
            <Ionicons name="library-outline" size={18} color={palette.text} style={{ marginRight: 6 }} />
            <Text style={[styles.secondaryRecoveryBtnText, { color: palette.text }]}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Status Screen: Format Unsupported
  if (resolutionStatus === 'unsupported') {
    return (
      <View style={[styles.statusContainer, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar hidden={false} barStyle={isThemeDark ? 'light-content' : 'dark-content'} />
        <View style={[styles.errorIconOrb, { backgroundColor: 'rgba(255, 171, 0, 0.12)' }]}>
          <Ionicons name="document-text-outline" size={42} color="#FFAB00" />
        </View>
        <Text style={[styles.statusTitle, { color: palette.text }]}>{currentBook.title}</Text>
        <Text style={[styles.statusSubtitle, { color: palette.muted }]}>
          Document Format Unsupported
        </Text>
        <Text style={styles.errorDescription}>
          {errorMessage || 'This file format is not supported by Lirune Reader.'}
        </Text>

        <View style={styles.recoveryBtnRow}>
          <TouchableOpacity
            style={[styles.primaryRecoveryBtn, { backgroundColor: palette.link || (isThemeDark ? '#C9B8FF' : '#4C4666') }]}
            onPress={handleExitReader}
            activeOpacity={0.8}
          >
            <Ionicons name="library-outline" size={18} color={isThemeDark ? '#1A1A1D' : '#FFFFFF'} style={{ marginRight: 6 }} />
            <Text style={[styles.primaryRecoveryBtnText, { color: isThemeDark ? '#1A1A1D' : '#FFFFFF' }]}>Back to Library</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Status Screen: General Failure
  if (resolutionStatus === 'failed') {
    const canRetry = retryCount < 3;
    return (
      <View style={[styles.statusContainer, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar hidden={false} barStyle={isThemeDark ? 'light-content' : 'dark-content'} />
        <View style={[styles.errorIconOrb, { backgroundColor: 'rgba(255, 107, 107, 0.12)' }]}>
          <Ionicons name="alert-circle-outline" size={42} color="#FF6B6B" />
        </View>
        <Text style={[styles.statusTitle, { color: palette.text }]}>{currentBook.title}</Text>
        <Text style={[styles.statusSubtitle, { color: palette.muted }]}>
          Unable to Open Document
        </Text>
        {errorMessage ? (
          <Text style={styles.errorDescription} numberOfLines={3}>
            {errorMessage}
          </Text>
        ) : null}

        <View style={styles.recoveryBtnRow}>
          {canRetry ? (
            <TouchableOpacity
              style={[styles.primaryRecoveryBtn, { backgroundColor: palette.link || (isThemeDark ? '#C9B8FF' : '#4C4666') }]}
              onPress={() => {
                setRetryCount((prev) => prev + 1);
                resolveCurrentBook(currentBook);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={18} color={isThemeDark ? '#1A1A1D' : '#FFFFFF'} style={{ marginRight: 6 }} />
              <Text style={[styles.primaryRecoveryBtnText, { color: isThemeDark ? '#1A1A1D' : '#FFFFFF' }]}>
                Retry ({3 - retryCount} left)
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.errorDescription, { marginBottom: 12 }]}>
              Maximum retry attempts reached.
            </Text>
          )}

          <TouchableOpacity
            style={[styles.secondaryRecoveryBtn, { borderColor: isThemeDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]}
            onPress={handleExitReader}
            activeOpacity={0.7}
          >
            <Ionicons name="library-outline" size={18} color={palette.text} style={{ marginRight: 6 }} />
            <Text style={[styles.secondaryRecoveryBtnText, { color: palette.text }]}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Construct active book with resolved local path
  const activeBook: Book = {
    ...currentBook,
    filePath: resolvedPath || currentBook.filePath || currentBook.uri,
  };

  const isBookmarked = bookmarks.some((b) => b.cfi === currentCfi);

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <StatusBar
        hidden={!isControlsVisible}
        barStyle={isThemeDark ? 'light-content' : 'dark-content'}
      />

      <ReaderErrorBoundary
        themeBg={palette.bg}
        textColor={palette.text}
        accentColor={palette.link}
        onRetry={() => resolveCurrentBook(currentBook)}
        onExit={handleExitReader}
      >
        {/* Format-Specific Engine View */}
        {activeBook.format === 'epub' && (
          <EpubReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            onChapterCountLoaded={handleUpdateChapterCount}
            onTOCLoaded={setTOC}
            targetCfi={currentCfi}
            onSearchResults={handleSearchResults}
            onSelectionChange={handleSelectionChange}
            onContentTextChange={setReaderContentText}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'pdf' && (
          <PdfReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            onTotalPagesLoaded={handleUpdateChapterCount}
            targetCfi={currentCfi}
            onSearchResults={handleSearchResults}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'txt' && (
          <TxtReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi}
            onSearchResults={handleSearchResults}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'html' && (
          <HtmlReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            onTOCLoaded={setTOC}
            targetCfi={currentCfi}
            onSearchResults={handleSearchResults}
            onSelectionChange={handleSelectionChange}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'fb2' && (
          <Fb2ReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            onTOCLoaded={setTOC}
            targetCfi={currentCfi}
            onSearchResults={handleSearchResults}
            onSelectionChange={handleSelectionChange}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'cbz' && (
          <CbzReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi}
          />
        )}

        {(activeBook.format === 'mobi' || activeBook.format === 'azw' || activeBook.format === 'azw3') && (
          <MobiReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            onTOCLoaded={setTOC}
            targetCfi={currentCfi || undefined}
            onSearchResults={handleSearchResults}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'docx' && (
          <DocxReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            onChapterCountLoaded={handleUpdateChapterCount}
            targetCfi={currentCfi || undefined}
            onSearchResults={handleSearchResults}
            onSelectionChange={handleSelectionChange}
            onContentTextChange={setReaderContentText}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'odt' && (
          <OdtReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi || undefined}
            onSearchResults={handleSearchResults}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'rtf' && (
          <RtfReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi || undefined}
            onSearchResults={handleSearchResults}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'doc' && (
          <DocReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi || undefined}
            onSearchResults={handleSearchResults}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'chm' && (
          <ChmReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi || undefined}
            onSearchResults={handleSearchResults}
            searchQuery={searchQuery}
          />
        )}

        {activeBook.format === 'djvu' && (
          <DjvuReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi || undefined}
          />
        )}

        {activeBook.format === 'cbr' && (
          <CbrReaderView
            book={activeBook}
            settings={effectiveSettings}
            onToggleControls={toggleControls}
            onProgressChange={updateProgress}
            targetCfi={currentCfi || undefined}
          />
        )}
      </ReaderErrorBoundary>

      {/* Highlight action bar, shown while text is selected */}
      {selection.text.trim().length > 0 && (
        <View
          style={[
            styles.highlightBar,
            {
              backgroundColor: palette.surface ?? '#1A1A1D',
              bottom: Math.max(insets.bottom, 16) + 16,
            },
          ]}
        >
          {HIGHLIGHT_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              accessibilityLabel={`Highlight in ${color}`}
              style={[styles.highlightSwatch, { backgroundColor: color }]}
              onPress={() => handleCreateHighlight(color)}
            />
          ))}
          <TouchableOpacity
            accessibilityLabel="Look up word definition"
            onPress={() => setIsDictionaryVisible(true)}
            style={styles.defineActionBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="book-outline" size={15} color={palette.text} style={{ marginRight: 4 }} />
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>Define</Text>
          </TouchableOpacity>
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
          book={activeBook}
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
          onOpenTTS={
            ['epub', 'txt', 'html', 'fb2', 'mobi', 'azw', 'azw3', 'docx', 'odt', 'rtf', 'doc', 'chm'].includes(activeBook.format)
              ? handleOpenTTS
              : undefined
          }
          onOpenThumbnails={
            ['pdf', 'djvu', 'cbz', 'cbr'].includes(activeBook.format)
              ? () => setIsThumbnailsVisible(true)
              : undefined
          }
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
        format={activeBook.format}
        onSelectBookmark={handleSelectBookmark}
        onDeleteBookmark={deleteBookmark}
        onDeleteHighlight={deleteHighlight}
        onAddNote={(text) => addNote(text, currentCfi || '', currentChapter)}
        onDeleteNote={deleteNote}
        themeName={readerSettings.theme}
      />

      {/* Offline TTS Controls Sheet */}
      <TtsControlsSheet
        visible={isTtsVisible}
        themeName={readerSettings.theme}
        bookTitle={activeBook.title}
        onClose={() => setIsTtsVisible(false)}
      />

      {/* Offline Dictionary Lookup Modal */}
      <DictionaryModal
        visible={isDictionaryVisible}
        word={selection.text}
        contextText={selection.text}
        bookId={activeBook.id}
        bookTitle={activeBook.title}
        themeName={readerSettings.theme}
        onClose={() => setIsDictionaryVisible(false)}
      />

      {/* Page Thumbnails Sheet (PDF, DJVU, CBZ, CBR) */}
      <ThumbnailsSheet
        visible={isThumbnailsVisible}
        totalPages={activeBook.chapterCount || 1}
        currentPage={Math.max(1, Math.round((progressPercent / 100) * (activeBook.chapterCount || 1)))}
        themeName={readerSettings.theme}
        bookTitle={activeBook.title}
        onSelectPage={(pageNum) => {
          const percent = Math.round(((pageNum - 1) / Math.max(1, activeBook.chapterCount || 1)) * 100);
          updateProgress(percent, `page:${pageNum}`);
        }}
        onClose={() => setIsThumbnailsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  statusTitle: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusSubtitle: {
    marginTop: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  errorIconOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 167, 38, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorDescription: {
    marginTop: 12,
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  recoveryBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
    width: '100%',
    maxWidth: 320,
  },
  primaryRecoveryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryRecoveryBtnText: {
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryRecoveryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryRecoveryBtnText: {
    fontWeight: '600',
    fontSize: 15,
  },
  highlightBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  highlightSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  defineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  highlightCancel: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});