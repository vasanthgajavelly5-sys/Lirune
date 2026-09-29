/**
 * Lirune Reader Mobile — Library Search Screen
 * Search across local books with live format filters, long-press context sheet,
 * and unified Lirune side navigation.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { BookCard } from '@/components/BookCard';
import { Book } from '@/models/Book';
import { EmptySearchState } from '@/components/EmptyState';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { BookContextSheet } from '@/components/BookContextSheet';
import { BookDetailsModal } from '@/components/BookDetailsModal';
import { AddToCollectionModal } from '@/components/AddToCollectionModal';
import { LiruneDialog } from '@/components/LiruneDialog';
import { LiruneToast } from '@/components/LiruneToast';

export default function SearchScreen() {
  const router = useRouter();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const {
    books,
    collections,
    toggleFavorite,
    deleteBook,
    addBookToCollection,
    removeBookFromCollection,
    createCollection,
  } = useLibraryStore();
  const { openBook } = useReaderStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');

  // Sheet & Modal states
  const [contextBook, setContextBook] = useState<Book | null>(null);
  const [detailsBook, setDetailsBook] = useState<Book | null>(null);
  const [collectionBook, setCollectionBook] = useState<Book | null>(null);
  const [deleteBookTarget, setDeleteBookTarget] = useState<Book | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const formats: { id: string; label: string }[] = [
    { id: 'all', label: 'All Formats' },
    { id: 'epub', label: 'EPUB' },
    { id: 'pdf', label: 'PDF' },
    { id: 'txt', label: 'TXT' },
    { id: 'html', label: 'HTML' },
    { id: 'fb2', label: 'FB2' },
    { id: 'cbz', label: 'CBZ' },
  ];

  const searchResults = useMemo(() => {
    let result = books;

    // Filter by format
    if (selectedFormat !== 'all') {
      result = result.filter((b) => b.format === selectedFormat);
    }

    // Filter by query
    const q = searchQuery.trim().toLowerCase();
    if (!q) return selectedFormat === 'all' ? [] : result;

    return result.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q))
    );
  }, [books, searchQuery, selectedFormat]);

  const handleOpenBook = async (book: Book) => {
    await openBook(book);
    router.push({
      pathname: '/reader',
      params: { bookId: book.id },
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteBookTarget) return;
    const title = deleteBookTarget.title;
    await deleteBook(deleteBookTarget.id);
    setDeleteBookTarget(null);
    setToastMessage(`"${title}" removed from library`);
  };

  const handleToggleCollection = async (collectionId: string, bookId: string) => {
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;
    if (col.bookIds.includes(bookId)) {
      await removeBookFromCollection(bookId, collectionId);
    } else {
      await addBookToCollection(bookId, collectionId);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Top Header with Side Nav Button */}
      <View style={[styles.topHeader, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerLeft}>
          <LiruneNavButton />
          <Text style={[styles.screenTitle, { color: colors.text }]}>Search</Text>
        </View>
        <Text style={[styles.bookCountBadge, { color: colors.textSecondary }]}>
          {books.length} books
        </Text>
      </View>

      {/* Search Input Box */}
      <View style={styles.searchHeader}>
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Search titles, authors, descriptions..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Format Filter Chips */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {formats.map((fmt) => {
            const isSelected = selectedFormat === fmt.id;
            return (
              <TouchableOpacity
                key={fmt.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? colors.accent : colors.surface,
                    borderColor: isSelected ? colors.accent : colors.borderSubtle,
                  },
                ]}
                onPress={() => setSelectedFormat(fmt.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? colors.accentForeground : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {fmt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Results / Empty State */}
      {searchResults.length === 0 ? (
        <EmptySearchState query={searchQuery} />
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <BookCard
              book={item}
              viewMode="list"
              onPress={() => handleOpenBook(item)}
              onLongPress={() => setContextBook(item)}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          )}
        />
      )}

      {/* Book Long Press Context Sheet */}
      <BookContextSheet
        visible={!!contextBook}
        book={contextBook}
        onClose={() => setContextBook(null)}
        onOpen={(b: Book) => handleOpenBook(b)}
        onToggleFavorite={(b: Book) => toggleFavorite(b.id)}
        onAddToCollection={(b: Book) => setCollectionBook(b)}
        onViewDetails={(b: Book) => setDetailsBook(b)}
        onDelete={(b: Book) => setDeleteBookTarget(b)}
      />

      {/* Book Details Modal */}
      <BookDetailsModal
        visible={!!detailsBook}
        book={detailsBook}
        onClose={() => setDetailsBook(null)}
        onRead={(b: Book) => handleOpenBook(b)}
        onToggleFavorite={(b: Book) => toggleFavorite(b.id)}
        onDelete={(b: Book) => setDeleteBookTarget(b)}
      />

      {/* Add To Collection Modal */}
      <AddToCollectionModal
        visible={!!collectionBook}
        book={collectionBook}
        collections={collections}
        onClose={() => setCollectionBook(null)}
        onToggleBookInCollection={handleToggleCollection}
        onCreateCollection={async (name: string) => {
          await createCollection(name);
        }}
      />

      {/* Themed Delete Confirmation Dialog */}
      <LiruneDialog
        visible={!!deleteBookTarget}
        title="Remove from Library?"
        message={`Are you sure you want to remove "${deleteBookTarget?.title}"? Its bookmarks, annotations, and reading progress will also be cleared.`}
        confirmText="Remove"
        cancelText="Cancel"
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteBookTarget(null)}
      />

      {/* Toast Notification */}
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  bookCountBadge: {
    fontSize: 13,
    fontWeight: '500',
  },
  searchHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  clearBtn: {
    padding: 4,
  },
  filterRow: {
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 32,
  },
});