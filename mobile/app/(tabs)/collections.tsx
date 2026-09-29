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
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibraryStore } from '@/state/libraryStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { Collection } from '@/models/Book';

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
  const { colors } = useThemeContext();
  const { collections, books, createCollection, deleteCollection, setSelectedCollectionId } =
    useLibraryStore();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  const handleCreate = async () => {
    if (!collectionName.trim()) return;
    try {
      await createCollection(collectionName.trim(), selectedColor);
      setCollectionName('');
      setIsModalVisible(false);
    } catch {
      Alert.alert('Error', 'Could not create collection.');
    }
  };

  const handleDelete = (coll: Collection) => {
    Alert.alert(
      'Delete Collection',
      `Delete "${coll.name}"? Books in this collection will not be deleted from your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteCollection(coll.id),
        },
      ]
    );
  };

  const handleSelectCollection = (coll: Collection) => {
    setSelectedCollectionId(coll.id);
    router.push('/(tabs)/library');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Collections</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {collections.length} custom {collections.length === 1 ? 'shelf' : 'shelves'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.accent }]}
          onPress={() => setIsModalVisible(true)}
        >
          <Ionicons name="add" size={18} color={colors.accentForeground} />
          <Text style={[styles.createBtnText, { color: colors.accentForeground }]}>
            New Shelf
          </Text>
        </TouchableOpacity>
      </View>

      {/* Collections List */}
      {collections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-open-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No Collections Yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Create collections like &quot;Sci-Fi&quot;, &quot;To Read&quot;, or &quot;Favorites&quot; to organize your reading.
          </Text>
          <TouchableOpacity
            style={[styles.emptyActionBtn, { backgroundColor: colors.accent }]}
            onPress={() => setIsModalVisible(true)}
          >
            <Text style={[styles.createBtnText, { color: colors.accentForeground }]}>
              Create First Collection
            </Text>
          </TouchableOpacity>
        </View>
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
                  onPress={() => handleDelete(item)}
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