/**
 * Lirune Reader Mobile — Bookmarks, Highlights & Notes Sheet
 * Coherent with Lirune Reader design system and active reader theme.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Bookmark, Highlight, Note } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';

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
  themeName?: string;
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
  themeName = 'neutral',
}: AnnotationsSheetProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'notes' | 'highlights'>('bookmarks');
  const [noteInput, setNoteInput] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  const activeTheme = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isThemeDark = themeName === 'night' || themeName.startsWith('contrast');

  const sheetBg = activeTheme.bg;
  const surfaceBg = activeTheme.surface;
  const textColor = activeTheme.text;
  const mutedColor = activeTheme.muted;
  const borderColor = isThemeDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
  const activeAccent = activeTheme.link || (isThemeDark ? '#C9B8FF' : '#4C4666');
  const activeAccentFg = isThemeDark ? '#000000' : '#FFFFFF';

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
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: sheetBg,
              borderColor: borderColor,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          {/* Header & Tabs */}
          <View style={[styles.header, { borderBottomColor: borderColor, backgroundColor: surfaceBg }]}>
            <View style={styles.tabsRow}>
              {(['bookmarks', 'notes', 'highlights'] as const).map((tab) => {
                const isSelected = activeTab === tab;
                const count =
                  tab === 'bookmarks'
                    ? bookmarks.length
                    : tab === 'notes'
                    ? notes.length
                    : highlights.length;
                const label =
                  tab === 'bookmarks' ? 'Bookmarks' : tab === 'notes' ? 'Notes' : 'Highlights';

                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.tab,
                      isSelected && { borderBottomColor: activeAccent, borderBottomWidth: 2 },
                    ]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color: isSelected ? activeAccent : mutedColor,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {label} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              accessibilityLabel="Close annotations"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={textColor} />
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
                  <Ionicons name="bookmark-outline" size={36} color={mutedColor} style={{ marginBottom: 8 }} />
                  <Text style={[styles.emptyText, { color: mutedColor }]}>No bookmarks added yet.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.cardItem, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => {
                      onSelectBookmark(item);
                      onClose();
                    }}
                  >
                    <Text style={[styles.cardTitle, { color: textColor }]}>{item.chapter}</Text>
                    <Text style={[styles.cardDate, { color: mutedColor }]}>
                      {new Date(item.dateCreated).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onDeleteBookmark(item.id)}
                    style={styles.deleteBtn}
                    accessibilityLabel="Delete bookmark"
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
              {!isAddingNote && (
                <TouchableOpacity
                  style={[styles.addNoteHeaderBtn, { borderColor: borderColor, backgroundColor: surfaceBg }]}
                  onPress={() => setIsAddingNote(true)}
                >
                  <Ionicons name="add" size={18} color={activeAccent} style={{ marginRight: 6 }} />
                  <Text style={[styles.addNoteHeaderText, { color: activeAccent }]}>Add Note to Current Chapter</Text>
                </TouchableOpacity>
              )}

              {isAddingNote && (
                <View style={[styles.addNoteContainer, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
                  <TextInput
                    style={[styles.noteInput, { color: textColor }]}
                    placeholder="Type your note here..."
                    placeholderTextColor={mutedColor}
                    multiline
                    value={noteInput}
                    onChangeText={setNoteInput}
                    autoFocus
                  />
                  <View style={styles.noteActionsRow}>
                    <TouchableOpacity
                      onPress={() => {
                        setIsAddingNote(false);
                        setNoteInput('');
                      }}
                      style={styles.cancelNoteBtn}
                    >
                      <Text style={[styles.cancelNoteText, { color: mutedColor }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveNote}
                      style={[styles.saveNoteBtn, { backgroundColor: activeAccent }]}
                    >
                      <Text style={[styles.saveNoteText, { color: activeAccentFg }]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <FlatList
                data={notes}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="create-outline" size={36} color={mutedColor} style={{ marginBottom: 8 }} />
                    <Text style={[styles.emptyText, { color: mutedColor }]}>No notes created yet.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={[styles.cardItem, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.noteBodyText, { color: textColor }]}>{item.text}</Text>
                      {item.chapter && (
                        <Text style={[styles.cardDate, { color: mutedColor, marginTop: 4 }]}>
                          In: {item.chapter}
                        </Text>
                      )}
                      <Text style={[styles.cardDate, { color: mutedColor, marginTop: 2 }]}>
                        {new Date(item.dateCreated).toLocaleDateString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => onDeleteNote(item.id)}
                      style={styles.deleteBtn}
                      accessibilityLabel="Delete note"
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
                  <Ionicons name="color-wand-outline" size={36} color={mutedColor} style={{ marginBottom: 8 }} />
                  <Text style={[styles.emptyText, { color: mutedColor }]}>No highlights added yet.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.cardItem, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.highlightText,
                        { color: textColor, borderLeftColor: item.color || activeAccent },
                      ]}
                      numberOfLines={4}
                    >
                      &ldquo;{item.text}&rdquo;
                    </Text>
                    {item.note && (
                      <Text style={[styles.highlightNote, { color: mutedColor }]}>{item.note}</Text>
                    )}
                    <Text style={[styles.cardDate, { color: mutedColor, marginTop: 4, paddingLeft: 8 }]}>
                      {new Date(item.dateCreated).toLocaleDateString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onDeleteHighlight(item.id)}
                    style={styles.deleteBtn}
                    accessibilityLabel="Delete highlight"
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    height: '75%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsRow: {
    flexDirection: 'row',
    flex: 1,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  tabText: {
    fontSize: 13,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 11,
  },
  deleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  addNoteHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    marginBottom: 0,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  addNoteHeaderText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addNoteContainer: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  noteInput: {
    fontSize: 14,
    minHeight: 70,
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
    fontSize: 13,
  },
  saveNoteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  saveNoteText: {
    fontSize: 13,
    fontWeight: '700',
  },
  noteBodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  highlightText: {
    fontSize: 14,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    paddingLeft: 8,
    lineHeight: 20,
  },
  highlightNote: {
    fontSize: 12,
    marginTop: 6,
    paddingLeft: 8,
  },
});
