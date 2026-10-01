/**
 * Lirune Reader Mobile — Add to Collection Modal
 * Themed dialog to manage collection assignments for a book.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Book, Collection } from '@/models/Book';
import { useThemeContext } from '@/theme/ThemeContext';

export interface AddToCollectionModalProps {
  visible: boolean;
  book: Book | null;
  collections: Collection[];
  onClose: () => void;
  onToggleBookInCollection: (collectionId: string, bookId: string) => Promise<void>;
  onCreateCollection?: (name: string) => Promise<void>;
}

export function AddToCollectionModal({
  visible,
  book,
  collections,
  onClose,
  onToggleBookInCollection,
  onCreateCollection,
}: AddToCollectionModalProps) {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const [newCollName, setNewCollName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!visible || !book) return null;

  const handleCreate = async () => {
    if (!newCollName.trim() || !onCreateCollection) return;
    await onCreateCollection(newCollName.trim());
    setNewCollName('');
    setIsCreating(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.container,
            {
              backgroundColor: isDark ? '#1C1C22' : '#FFFFFF',
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                Collections
              </Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {book.title}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {collections.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No collections yet. Create your first collection below.
              </Text>
            ) : (
              collections.map((coll) => {
                const isAssigned = coll.bookIds.includes(book.id) || book.collectionIds?.includes(coll.id);
                return (
                  <TouchableOpacity
                    key={coll.id}
                    style={[
                      styles.collRow,
                      {
                        backgroundColor: isAssigned
                          ? isDark
                            ? 'rgba(238, 236, 248, 0.1)'
                            : 'rgba(76, 70, 102, 0.08)'
                          : 'transparent',
                        borderColor: isAssigned ? colors.accent : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => onToggleBookInCollection(coll.id, book.id)}
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
                        styles.collName,
                        {
                          color: isAssigned ? colors.text : colors.textSecondary,
                          fontWeight: isAssigned ? '700' : '500',
                        },
                      ]}
                    >
                      {coll.name}
                    </Text>
                    <Ionicons
                      name={isAssigned ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isAssigned ? colors.accent : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })
            )}

            {isCreating ? (
              <View style={[styles.createRow, { borderColor: colors.borderSubtle }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Collection name..."
                  placeholderTextColor={colors.textMuted}
                  value={newCollName}
                  onChangeText={setNewCollName}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.accent }]}
                  onPress={handleCreate}
                >
                  <Text style={[styles.saveText, { color: colors.accentForeground }]}>
                    Add
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.newBtn}
                onPress={() => setIsCreating(true)}
              >
                <Ionicons name="add" size={18} color={colors.accent} />
                <Text style={[styles.newBtnText, { color: colors.accent }]}>
                  New Collection
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: colors.accent }]}
              onPress={onClose}
            >
              <Text style={[styles.doneBtnText, { color: colors.accentForeground }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '75%',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    maxWidth: 240,
  },
  closeBtn: {
    padding: 4,
  },
  list: {
    padding: 16,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 20,
  },
  collRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  collDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  collName: {
    fontSize: 14,
    flex: 1,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  saveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  saveText: {
    fontSize: 12,
    fontWeight: '700',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    marginTop: 4,
  },
  newBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  doneBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
