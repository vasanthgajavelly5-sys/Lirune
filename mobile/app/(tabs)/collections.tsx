/**
 * Lirune Reader Mobile — Collections Screen
 * Manage, create, and organize custom reading collections.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibraryStore } from '@/state/libraryStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { Collection } from '@/models/Book';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { LiruneDialog } from '@/components/LiruneDialog';
import { EmptyCollectionsState } from '@/components/EmptyState';

const PRESET_COLORS = [
  '#C9B8FF',
  '#4ECDC4',
  '#FFB86C',
  '#FF6B6B',
  '#7DD3FC',
  '#A7F3D0',
  '#FDE047',
  '#F472B6',
];

export default function CollectionsScreen() {
  const router = useRouter();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const { collections, books, createCollection, deleteCollection, setSelectedCollectionId, addBookToCollection, removeBookFromCollection } =
    useLibraryStore();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [assignTarget, setAssignTarget] = useState<Collection | null>(null);
  const [collToDelete, setCollToDelete] = useState<Collection | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!collectionName.trim()) return;
    try {
      await createCollection(collectionName.trim(), selectedColor);
      setCollectionName('');
      setIsModalVisible(false);
    } catch {
      setErrorMessage('Could not create collection.');
    }
  };

  const handleConfirmDelete = async () => {
    if (collToDelete) {
      await deleteCollection(collToDelete.id);
      setCollToDelete(null);
    }
  };

  const handleSelectCollection = (coll: Collection) => {
    setSelectedCollectionId(coll.id);
    router.push('/');
  };

  const handleToggleMembership = async (bookId: string, coll: Collection) => {
    try {
      const isMember = books
        .find((b) => b.id === bookId)
        ?.collectionIds.includes(coll.id);
      if (isMember) {
        await removeBookFromCollection(bookId, coll.id);
      } else {
        await addBookToCollection(bookId, coll.id);
      }
    } catch {
      setErrorMessage('Could not update collection membership.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerLeft}>
          <LiruneNavButton />
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Collections</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {collections.length} custom {collections.length === 1 ? 'shelf' : 'shelves'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.accent }]}
          onPress={() => setIsModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color={colors.accentForeground} />
          <Text style={[styles.createBtnText, { color: colors.accentForeground }]}>
            New Shelf
          </Text>
        </TouchableOpacity>
      </View>

      {/* Collections List */}
      {collections.length === 0 ? (
        <EmptyCollectionsState onCreate={() => setIsModalVisible(true)} />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const count = books.filter((b) => b.collectionIds.includes(item.id)).length;
            return (
              <TouchableOpacity
                style={[
                  styles.collectionCard,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                ]}
                onPress={() => handleSelectCollection(item)}
              >
                <View style={[styles.colorBar, { backgroundColor: item.color || '#C9B8FF' }]} />
                <View style={styles.cardInfo}>
                  <Text style={[styles.collectionName, { color: colors.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.bookCount, { color: colors.textSecondary }]}>
                    {count} {count === 1 ? 'book' : 'books'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => setAssignTarget(item)}
                >
                  <Ionicons name="library-outline" size={18} color={colors.accent} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => setCollToDelete(item)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Create Collection Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              New Collection
            </Text>

            <TextInput
              style={[
                styles.modalInput,
                { color: colors.text, borderColor: colors.borderSubtle },
              ]}
              placeholder="Collection name..."
              placeholderTextColor={colors.textMuted}
              value={collectionName}
              onChangeText={setCollectionName}
              autoFocus
            />

            <Text style={[styles.colorLabel, { color: colors.textSecondary }]}>
              Select Color Tag
            </Text>
            <View style={styles.colorsRow}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    selectedColor === c && styles.colorCircleSelected,
                  ]}
                  onPress={() => setSelectedColor(c)}
                />
              ))}
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.accent }]}
                onPress={handleCreate}
              >
                <Text style={{ color: colors.accentForeground, fontWeight: '600' }}>
                  Create
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / remove books in a collection */}
      <Modal
        visible={assignTarget !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAssignTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              { backgroundColor: colors.surfaceElevated, maxHeight: '80%' },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {assignTarget ? `Books in "${assignTarget.name}"` : ''}
            </Text>

            {books.length === 0 ? (
              <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
                Import some books first.
              </Text>
            ) : (
              <ScrollView style={{ marginBottom: 16 }}>
                {books.map((b) => {
                  const isMember = assignTarget
                    ? b.collectionIds.includes(assignTarget.id)
                    : false;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.assignRow, { borderColor: colors.borderSubtle }]}
                      onPress={() => assignTarget && handleToggleMembership(b.id, assignTarget)}
                    >
                      <View style={styles.cardInfo}>
                        <Text
                          style={[styles.collectionName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {b.title}
                        </Text>
                        <Text
                          style={[styles.bookCount, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {b.author}
                        </Text>
                      </View>
                      <Ionicons
                        name={isMember ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isMember ? colors.accent : colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setAssignTarget(null)}
              >
                <Text style={{ color: colors.textSecondary }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Collection Dialog */}
      <LiruneDialog
        visible={!!collToDelete}
        title="Delete Collection"
        message={`Delete "${collToDelete?.name}"? Books in this collection will not be deleted from your library.`}
        icon="trash-outline"
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setCollToDelete(null)}
      />

      {/* Error Dialog */}
      <LiruneDialog
        visible={!!errorMessage}
        title="Notice"
        message={errorMessage || ''}
        icon="alert-circle-outline"
        confirmText="OK"
        onConfirm={() => setErrorMessage(null)}
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
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  collectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  colorBar: {
    width: 6,
    height: 36,
    borderRadius: 3,
    marginRight: 14,
  },
  cardInfo: {
    flex: 1,
  },
  collectionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  bookCount: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
  },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyActionBtn: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  colorLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  colorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modalSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
});