/**
 * Lirune Reader Mobile — Library Screen
 * Grid/List presentation, format filters, collection filtering, sorting, and book imports.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { BookCard } from '@/components/BookCard';
import { Book, FilterType } from '@/models/Book';

export default function LibraryScreen() {
  const router = useRouter();
  const { colors } = useThemeContext();

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
    clearError,
  } = useLibraryStore();

  const { openBook } = useReaderStore();
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Display error alert if any
  useEffect(() => {
    if (error) {
      Alert.alert('Library', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  // Filter & Sort books
  const filteredBooks = useMemo(() => {
    let result = [...books];

    // 1. Collection filter
    if (selectedCollectionId !== 'all') {
      result = result.filter((b) => b.collectionIds.includes(selectedCollectionId));
    }

    // 2. Status filter
    switch (filter) {
      case 'favorites':
        result = result.filter((b) => b.isFavorite);
        break;
      case 'reading':
        result = result.filter((b) => b.progress > 0 && b.progress < 100);
        break;
      case 'unread':
        result = result.filter((b) => b.progress === 0);
        break;
      case 'finished':
        result = result.filter((b) => b.progress === 100);
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
        // Automatically open the imported book
        handleOpenBook(newBook);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteBook = (book: Book) => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to remove "${book.title}" from your library? The file will be deleted from your device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteBook(book.id),
        },
      ]
    );
  };

  const filterChips: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All Books' },
    { id: 'reading', label: 'Reading' },
    { id: 'unread', label: 'Unread' },
    { id: 'finished', label: 'Finished' },
    { id: 'favorites', label: 'Favorites' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View>
          <Text style={[styles.appTitle, { color: colors.text }]}>Lirune Reader</Text>
          <Text style={[styles.bookCountSubtitle, { color: colors.textSecondary }]}>
            {books.length} {books.length === 1 ? 'book' : 'books'} in library
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* View Mode Toggle */}
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            accessibilityLabel="Toggle view mode"
          >
            <Ionicons
              name={viewMode === 'grid' ? 'list' : 'grid'}
              size={22}
              color={colors.text}
            />
          </TouchableOpacity>

          {/* Import Button */}
          <TouchableOpacity
            style={[styles.importButton, { backgroundColor: colors.accent }]}
            onPress={handleImport}
            disabled={isImporting}
            accessibilityLabel="Import book"
          >
            {isImporting ? (
              <ActivityIndicator size="small" color={colors.accentForeground} />
            ) : (
              <>
                <Ionicons name="add" size={20} color={colors.accentForeground} />
                <Text style={[styles.importButtonText, { color: colors.accentForeground }]}>
                  Import
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Chips ScrollView */}
      <View style={styles.chipsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContent}
        >
          {filterChips.map((chip) => {
            const isSelected = filter === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? colors.accent : colors.surface,
                    borderColor: isSelected ? colors.accent : colors.borderSubtle,
                  },
                ]}
                onPress={() => setFilter(chip.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? colors.accentForeground : colors.textSecondary,
                      fontWeight: isSelected ? '600' : '500',
                    },
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
                selectedCollectionId === 'all' && {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.accent,
                },
              ]}
              onPress={() => setSelectedCollectionId('all')}
            >
              <Text
                style={[
                  styles.collectionPillText,
                  {
                    color:
                      selectedCollectionId === 'all'
                        ? colors.text
                        : colors.textSecondary,
                  },
                ]}
              >
                All Collections
              </Text>
            </TouchableOpacity>

            {collections.map((coll) => (
              <TouchableOpacity
                key={coll.id}
                style={[
                  styles.collectionPill,
                  selectedCollectionId === coll.id && {
                    backgroundColor: colors.accentSoft,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => setSelectedCollectionId(coll.id)}
              >
                <View
                  style={[styles.collDot, { backgroundColor: coll.color || '#C9B8FF' }]}
                />
                <Text
                  style={[
                    styles.collectionPillText,
                    {
                      color:
                        selectedCollectionId === coll.id
                          ? colors.text
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {coll.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Book List / Grid */}
      {isLoading && books.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : filteredBooks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name={books.length === 0 ? 'book-outline' : 'filter-outline'}
            size={56}
            color={colors.textMuted}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {books.length === 0
              ? 'Your Library is Empty'
              : 'No matching books found'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {books.length === 0
              ? 'Import EPUB, PDF, TXT, HTML, FB2, or CBZ books from your device to begin reading.'
              : 'Try selecting a different filter or collection.'}
          </Text>

          {books.length === 0 && (
            <TouchableOpacity
              style={[styles.emptyImportBtn, { backgroundColor: colors.accent }]}
              onPress={handleImport}
            >
              <Ionicons name="add" size={20} color={colors.accentForeground} />
              <Text style={[styles.emptyImportText, { color: colors.accentForeground }]}>
                Import Book
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredBooks}
          key={viewMode === 'grid' ? 'grid_2_cols' : 'list_1_col'}
          numColumns={viewMode === 'grid' ? 2 : 1}
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
              onPress={() => handleOpenBook(item)}
              onToggleFavorite={() => toggleFavorite(item.id)}
              onDelete={() => handleDeleteBook(item)}
            />
          )}
        />
      )}
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
  appTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  bookCountSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  importButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipsContainer: {
    paddingVertical: 10,
  },
  collectionsRow: {
    paddingBottom: 8,
  },
  chipsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
  },
  collectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
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
    paddingBottom: 24,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  emptyImportText: {
    fontSize: 15,
    fontWeight: '600',
  },
});