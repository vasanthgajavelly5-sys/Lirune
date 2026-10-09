/**
 * Lirune Reader Mobile — Library Screen (Redesigned)
 * Calm, private, focused reading home with Lirune side navigation,
 * simplified filters (All, Reading, Favorites), long-press context menu,
 * authentic empty state, and first-launch guide.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { BookCard } from '@/components/BookCard';
import { Book, FilterType } from '@/models/Book';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { BookContextSheet } from '@/components/BookContextSheet';
import { BookDetailsModal } from '@/components/BookDetailsModal';
import { AddToCollectionModal } from '@/components/AddToCollectionModal';
import { LiruneDialog } from '@/components/LiruneDialog';
import { LiruneToast } from '@/components/LiruneToast';
import { WelcomeGuideModal } from '@/components/WelcomeGuideModal';
import {
  EmptyLibraryState,
  EmptyFavoritesState,
  EmptyCollectionsFilterState,
} from '@/components/EmptyState';

export default function LibraryScreen() {
  const router = useRouter();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  const {
    books,
    collections,
    isLoading,
    error,
    viewMode,
    sortCriterion,
    sortDirection,
    filter,
    selectedCollectionId,
    loadLibrary,
    importBook,
    deleteBook,
    toggleFavorite,
    setViewMode,
    setFilter,
    setSelectedCollectionId,
    addBookToCollection,
    removeBookFromCollection,
    createCollection,
    clearError,
    hasLoaded: isLibraryLoaded,
  } = useLibraryStore();

  const { openBook } = useReaderStore();
  const {
    hasCompletedWelcome,
    setHasCompletedWelcome,
    isLoaded: isSettingsLoaded,
  } = useSettingsStore();

  const [isImporting, setIsImporting] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isContextSheetVisible, setIsContextSheetVisible] = useState(false);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [isCollectionModalVisible, setIsCollectionModalVisible] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [isWelcomeGuideVisible, setIsWelcomeGuideVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLibraryLoaded) {
      loadLibrary();
    }
  }, [isLibraryLoaded, loadLibrary]);

  // Show first-launch welcome guide ONLY if stores have finished loading from SQLite,
  // user has never completed it, and there are no books yet.
  useEffect(() => {
    if (
      isSettingsLoaded &&
      isLibraryLoaded &&
      !hasCompletedWelcome &&
      books.length === 0
    ) {
      setIsWelcomeGuideVisible(true);
    }
  }, [isSettingsLoaded, isLibraryLoaded, hasCompletedWelcome, books.length]);

  // Filter & Sort books (Simplified to All, Reading, Favorites)
  const filteredBooks = useMemo(() => {
    let result = [...books];

    // 1. Collection filter
    if (selectedCollectionId !== 'all') {
      result = result.filter((b) => b.collectionIds.includes(selectedCollectionId));
    }

    // 2. Status filter — ONLY All, Reading, Favorites
    switch (filter) {
      case 'favorites':
        result = result.filter((b) => b.isFavorite);
        break;
      case 'reading':
        result = result.filter((b) => b.progress > 0 && b.progress < 100);
        break;
      case 'all':
      default:
        break;
    }

    // 3. Sorting
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortCriterion) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'author':
          cmp = a.author.localeCompare(b.author);
          break;
        case 'progress':
          cmp = a.progress - b.progress;
          break;
        case 'added':
          cmp = a.dateAdded - b.dateAdded;
          break;
        case 'recent':
        default:
          cmp = (a.lastReadDate || a.dateAdded) - (b.lastReadDate || b.dateAdded);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [books, selectedCollectionId, filter, sortCriterion, sortDirection]);

  // Actions
  const handleOpenBook = async (book: Book) => {
    await openBook(book);
    router.push({
      pathname: '/reader',
      params: { bookId: book.id },
    });
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const newBook = await importBook();
      if (newBook) {
        setToastMessage(`"${newBook.title}" added to your library`);
        handleOpenBook(newBook);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleFavorite = async (book: Book) => {
    await toggleFavorite(book.id);
    setToastMessage(
      book.isFavorite ? 'Removed from favorites' : 'Added to favorites'
    );
  };

  const handleConfirmDelete = async () => {
    if (bookToDelete) {
      const title = bookToDelete.title;
      await deleteBook(bookToDelete.id);
      setBookToDelete(null);
      setToastMessage(`"${title}" removed from library`);
    }
  };

  const handleToggleCollection = async (collectionId: string, bookId: string) => {
    const coll = collections.find((c) => c.id === collectionId);
    if (!coll) return;
    if (coll.bookIds.includes(bookId)) {
      await removeBookFromCollection(bookId, collectionId);
    } else {
      await addBookToCollection(bookId, collectionId);
    }
    // Refresh selected book state
    const updated = books.find((b) => b.id === bookId);
    if (updated) setSelectedBook(updated);
  };

  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 680;
  const gridColumns = useMemo(() => {
    if (viewMode !== 'grid') return 1;
    if (windowWidth >= 1200) return 5;
    if (windowWidth >= 960) return 4;
    if (windowWidth >= 680) return 3;
    return 2;
  }, [viewMode, windowWidth]);

  const readingCount = useMemo(
    () => books.filter((b) => b.progress > 0 && b.progress < 100).length,
    [books]
  );
  const favoritesCount = useMemo(
    () => books.filter((b) => b.isFavorite).length,
    [books]
  );

  // Simplified filter tabs with dynamic counts: All, Reading, Favorites
  const filterChips: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: books.length },
    { id: 'reading', label: 'Reading', count: readingCount },
    { id: 'favorites', label: 'Favorites', count: favoritesCount },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Lirune Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerLeft}>
          <LiruneNavButton />
          <View style={styles.titleBlock}>
            <View style={styles.brandTitleRow}>
              <View style={[styles.logoIconSmall, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="bookmark" size={14} color={colors.accent} />
              </View>
              <Text style={[styles.appTitle, { color: colors.text }]}>Lirune Reader</Text>
            </View>
            <Text style={[styles.bookCountSubtitle, { color: colors.textSecondary }]}>
              {books.length} {books.length === 1 ? 'book' : 'books'} in library
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* View Mode Toggle (Grid -> List -> Compact) */}
          <TouchableOpacity
            style={[styles.headerIconButton, { backgroundColor: colors.surfaceElevated }]}
            onPress={() => setViewMode(viewMode === 'grid' ? 'list' : viewMode === 'list' ? 'compact' : 'grid')}
            accessibilityLabel={`Current view: ${viewMode}. Tap to change.`}
            activeOpacity={0.7}
          >
            <Ionicons
              name={viewMode === 'grid' ? 'grid-outline' : viewMode === 'list' ? 'list-outline' : 'menu-outline'}
              size={18}
              color={colors.text}
            />
          </TouchableOpacity>

          {/* Import Button */}
          <TouchableOpacity
            style={[styles.importButton, { backgroundColor: colors.accent }]}
            onPress={handleImport}
            disabled={isImporting}
            accessibilityLabel="Import book"
            activeOpacity={0.8}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color={colors.accentForeground} />
            ) : (
              <>
                <Ionicons name="add" size={18} color={colors.accentForeground} />
                <Text style={[styles.importButtonText, { color: colors.accentForeground }]}>
                  Import
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Simplified Filter Controls: All, Reading, Favorites */}
      <View style={styles.chipsContainer}>
        <View style={styles.chipsRow}>
          {filterChips.map((chip) => {
            const isSelected = filter === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.filterChip,
                  isSelected
                    ? [
                        styles.filterChipActive,
                        {
                          backgroundColor: colors.accent,
                          borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
                          shadowColor: colors.accent,
                        },
                      ]
                    : [
                        styles.filterChipInactive,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                          borderColor: colors.borderSubtle,
                        },
                      ],
                ]}
                onPress={() => setFilter(chip.id)}
                activeOpacity={0.75}
              >
                {chip.id === 'favorites' && (
                  <Ionicons
                    name={isSelected ? 'heart' : 'heart-outline'}
                    size={14}
                    color={isSelected ? colors.accentForeground : '#FF6584'}
                    style={{ marginRight: 6 }}
                  />
                )}
                {chip.id === 'reading' && (
                  <Ionicons
                    name={isSelected ? 'book' : 'book-outline'}
                    size={13}
                    color={isSelected ? colors.accentForeground : colors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? colors.accentForeground : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '600',
                    },
                  ]}
                >
                  {chip.label}
                </Text>
                <View
                  style={[
                    styles.chipCountBadge,
                    {
                      backgroundColor: isSelected
                        ? isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.28)'
                        : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipCountText,
                      {
                        color: isSelected ? colors.accentForeground : colors.textSecondary,
                        fontWeight: isSelected ? '700' : '600',
                      },
                    ]}
                  >
                    {chip.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Collection Filter row (if collections exist) */}
      {collections.length > 0 && (
        <View style={styles.collectionsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScrollContent}
          >
            <TouchableOpacity
              style={[
                styles.collectionPill,
                {
                  backgroundColor:
                    selectedCollectionId === 'all'
                      ? colors.accentSoft
                      : colors.surfaceElevated,
                  borderColor:
                    selectedCollectionId === 'all'
                      ? colors.accent
                      : colors.borderSubtle,
                },
              ]}
              onPress={() => setSelectedCollectionId('all')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.collectionPillText,
                  {
                    color:
                      selectedCollectionId === 'all'
                        ? colors.text
                        : colors.textSecondary,
                    fontWeight: selectedCollectionId === 'all' ? '700' : '500',
                  },
                ]}
              >
                All Collections
              </Text>
            </TouchableOpacity>

            {collections.map((coll) => {
              const isSelected = selectedCollectionId === coll.id;
              return (
                <TouchableOpacity
                  key={coll.id}
                  style={[
                    styles.collectionPill,
                    {
                      backgroundColor: isSelected
                        ? colors.accentSoft
                        : colors.surfaceElevated,
                      borderColor: isSelected ? colors.accent : colors.borderSubtle,
                    },
                  ]}
                  onPress={() => setSelectedCollectionId(coll.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.collDot,
                      { backgroundColor: coll.color || '#C9B8FF' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.collectionPillText,
                      {
                        color: isSelected ? colors.text : colors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {coll.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Book List / Grid / Empty States */}
      {isLoading && books.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : filteredBooks.length === 0 ? (
        books.length === 0 ? (
          <EmptyLibraryState
            onImport={handleImport}
            onOpenGuide={() => setIsWelcomeGuideVisible(true)}
          />
        ) : filter === 'favorites' ? (
          <EmptyFavoritesState />
        ) : selectedCollectionId !== 'all' ? (
          <EmptyCollectionsFilterState />
        ) : (
          <View style={styles.emptyCentered}>
            <Ionicons name="filter-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyFilteredTitle, { color: colors.text }]}>
              No books match this filter
            </Text>
            <TouchableOpacity
              style={[styles.clearFilterBtn, { backgroundColor: colors.surfaceElevated }]}
              onPress={() => {
                setFilter('all');
                setSelectedCollectionId('all');
              }}
            >
              <Text style={[styles.clearFilterText, { color: colors.accent }]}>
                Show All Books
              </Text>
            </TouchableOpacity>
          </View>
        )
      ) : (
        <FlatList
          data={filteredBooks}
          key={viewMode === 'grid' ? `grid_${gridColumns}_cols` : `single_col_${viewMode}`}
          numColumns={gridColumns}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={loadLibrary}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <BookCard
              book={item}
              viewMode={viewMode}
              columnsCount={gridColumns}
              availableWidth={isTablet ? windowWidth - 84 : windowWidth}
              onPress={() => handleOpenBook(item)}
              onLongPress={() => {
                setSelectedBook(item);
                setIsContextSheetVisible(true);
              }}
              onToggleFavorite={() => handleToggleFavorite(item)}
            />
          )}
        />
      )}

      {/* Book Context Sheet (Long Press) */}
      <BookContextSheet
        visible={isContextSheetVisible}
        book={selectedBook}
        onClose={() => setIsContextSheetVisible(false)}
        onOpen={(b) => handleOpenBook(b)}
        onToggleFavorite={(b) => handleToggleFavorite(b)}
        onAddToCollection={(b) => {
          setSelectedBook(b);
          setIsCollectionModalVisible(true);
        }}
        onViewDetails={(b) => {
          setSelectedBook(b);
          setIsDetailsModalVisible(true);
        }}
        onDelete={(b) => setBookToDelete(b)}
      />

      {/* Book Details Modal */}
      <BookDetailsModal
        visible={isDetailsModalVisible}
        book={selectedBook}
        onClose={() => setIsDetailsModalVisible(false)}
        onRead={(b) => handleOpenBook(b)}
        onToggleFavorite={(b) => handleToggleFavorite(b)}
        onDelete={(b) => setBookToDelete(b)}
      />

      {/* Collection Assignment Modal */}
      <AddToCollectionModal
        visible={isCollectionModalVisible}
        book={selectedBook}
        collections={collections}
        onClose={() => setIsCollectionModalVisible(false)}
        onToggleBookInCollection={handleToggleCollection}
        onCreateCollection={async (name) => {
          await createCollection(name);
        }}
      />

      {/* Delete Confirmation Themed Dialog */}
      <LiruneDialog
        visible={!!bookToDelete}
        title="Remove Book"
        message={`Are you sure you want to remove "${bookToDelete?.title}" from your library? The book file will be deleted from your device.`}
        icon="trash-outline"
        confirmText="Remove"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setBookToDelete(null)}
      />

      {/* Error Themed Dialog */}
      <LiruneDialog
        visible={!!error}
        title="Notice"
        message={error || ''}
        icon="alert-circle-outline"
        confirmText="OK"
        onConfirm={clearError}
      />

      {/* First-Launch Welcome Guide Modal */}
      <WelcomeGuideModal
        visible={isWelcomeGuideVisible}
        onDismiss={async () => {
          setIsWelcomeGuideVisible(false);
          await setHasCompletedWelcome(true);
        }}
      />

      {/* Subtle Themed Feedback Toast */}
      <LiruneToast
        visible={!!toastMessage}
        message={toastMessage || ''}
        onDismiss={() => setToastMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  titleBlock: {
    flex: 1,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoIconSmall: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  bookCountSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    gap: 4,
  },
  importButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipsContainer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 38,
  },
  filterChipActive: {
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
  },
  filterChipInactive: {
    elevation: 0,
    shadowOpacity: 0,
  },
  filterChipText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  chipCountBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 9,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountText: {
    fontSize: 11,
  },
  collectionsRow: {
    paddingBottom: 8,
  },
  chipsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  collectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  collDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  collectionPillText: {
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 36,
  },
  gridRow: {
    justifyContent: 'flex-start',
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyFilteredTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  clearFilterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: '700',
  },
});