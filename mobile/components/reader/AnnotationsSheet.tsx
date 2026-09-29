/**
 * Lirune Reader Mobile — Bookmarks, Highlights & Notes Sheet
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Bookmark, Highlight, Note } from '@/models/Book';

interface AnnotationsSheetProps {
  visible: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  notes: Note[];
  format?: string;
  onSelectBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (id: string) => void;
}

export function AnnotationsSheet({
  visible,
  onClose,
  bookmarks,
  highlights,
  notes,
  format,
  onSelectBookmark,
  onDeleteBookmark,
  onDeleteHighlight,
  onAddNote,
  onDeleteNote,
}: AnnotationsSheetProps) {
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'notes' | 'highlights'>('bookmarks');
  const [noteInput, setNoteInput] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  const handleSaveNote = () => {
    if (noteInput.trim()) {
      onAddNote(noteInput.trim());
      setNoteInput('');
      setIsAddingNote(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'bookmarks' && styles.tabActive]}
                onPress={() => setActiveTab('bookmarks')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'bookmarks' && styles.tabTextActive,
                  ]}
                >
                  Bookmarks ({bookmarks.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'notes' && styles.tabActive]}
                onPress={() => setActiveTab('notes')}
              >
                <Text
                  style={[styles.tabText, activeTab === 'notes' && styles.tabTextActive]}
                >
                  Notes ({notes.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'highlights' && styles.tabActive]}
                onPress={() => setActiveTab('highlights')}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'highlights' && styles.tabTextActive,
                  ]}
                >
                  Highlights ({highlights.length})
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#F0F0EB" />
            </TouchableOpacity>
          </View>

          {/* Bookmarks Tab */}
          {activeTab === 'bookmarks' && (
            <FlatList
              data={bookmarks}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No bookmarks added yet.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.cardItem}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => {
                      onSelectBookmark(item);
                      onClose();
                    }}
                  >
                    <Text style={styles.cardTitle}>{item.chapter}</Text>
                    <Text style={styles.cardDate}>
                      {new Date(item.dateCreated).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onDeleteBookmark(item.id)}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <View style={{ flex: 1 }}>
              {isAddingNote ? (
                <View style={styles.addNoteBox}>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Write a note about this section..."
                    placeholderTextColor="#888880"
                    multiline
                    value={noteInput}
                    onChangeText={setNoteInput}
                    autoFocus
                  />
                  <View style={styles.noteActionsRow}>
                    <TouchableOpacity
                      onPress={() => setIsAddingNote(false)}
                      style={styles.cancelNoteBtn}
                    >
                      <Text style={styles.cancelNoteText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveNote}
                      style={styles.saveNoteBtn}
                    >
                      <Text style={styles.saveNoteText}>Save Note</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.newNoteBtn}
                  onPress={() => setIsAddingNote(true)}
                >
                  <Ionicons name="add" size={18} color="#1A1A1D" />
                  <Text style={styles.newNoteText}>Add Note for Current Page</Text>
                </TouchableOpacity>
              )}

              <FlatList
                data={notes}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  !isAddingNote ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No notes written yet.</Text>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => (
                  <View style={styles.cardItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.noteBodyText}>{item.text}</Text>
                      {item.chapter && (
                        <Text style={styles.cardDate}>{item.chapter}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => onDeleteNote(item.id)}
                      style={styles.deleteBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                )}
              />
            </View>
          )}

          {/* Highlights Tab */}
          {activeTab === 'highlights' && (
            <FlatList
              data={highlights}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {!format || format === 'epub' || format === 'html' || format === 'fb2'
                      ? 'No highlights recorded yet. Select text in the reader to create a highlight.'
                      : `Highlighting via text selection is available for EPUB, HTML, and FB2. In ${format.toUpperCase()} documents, native text selection is an Android platform limitation.`}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.cardItem}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.highlightText,
                        { borderLeftColor: item.color || '#C9B8FF' },
                      ]}
                    >
                      &ldquo;{item.text}&rdquo;
                    </Text>
                    {item.note && <Text style={styles.highlightNote}>{item.note}</Text>}
                  </View>
                  <TouchableOpacity
                    onPress={() => onDeleteHighlight(item.id)}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#202024',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3E',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#2E2B38',
  },
  tabText: {
    color: '#888880',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#EEECF8',
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    padding: 16,
  },
  cardItem: {
    backgroundColor: '#2A2A2F',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#F0F0EB',
    fontSize: 15,
    fontWeight: '500',
  },
  cardDate: {
    color: '#888880',
    fontSize: 12,
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888880',
    fontSize: 14,
  },
  newNoteBtn: {
    backgroundColor: '#C9B8FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  newNoteText: {
    color: '#1A1A1D',
    fontSize: 14,
    fontWeight: '600',
  },
  addNoteBox: {
    backgroundColor: '#2A2A2F',
    margin: 16,
    borderRadius: 8,
    padding: 12,
  },
  noteInput: {
    color: '#F0F0EB',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  cancelNoteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelNoteText: {
    color: '#888880',
    fontSize: 13,
  },
  saveNoteBtn: {
    backgroundColor: '#C9B8FF',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  saveNoteText: {
    color: '#1A1A1D',
    fontSize: 13,
    fontWeight: '600',
  },
  noteBodyText: {
    color: '#F0F0EB',
    fontSize: 14,
    lineHeight: 20,
  },
  highlightText: {
    color: '#F0F0EB',
    fontSize: 14,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    paddingLeft: 8,
  },
  highlightNote: {
    color: '#B8B8B0',
    fontSize: 12,
    marginTop: 6,
    paddingLeft: 8,
  },
});
