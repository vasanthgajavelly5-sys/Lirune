/**
 * Lirune Reader Mobile — Offline Word Lookup Modal
 * Instant local dictionary sheet with word definitions and save capability.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DictionaryService, WordDefinition } from '@/services/dictionary/DictionaryService';
import { READER_THEMES } from '@/theme/Colors';

interface DictionaryModalProps {
  visible: boolean;
  word: string;
  contextText?: string;
  bookId?: string;
  bookTitle?: string;
  themeName: string;
  onClose: () => void;
}

export function DictionaryModal({
  visible,
  word,
  contextText,
  bookId,
  bookTitle,
  themeName,
  onClose,
}: DictionaryModalProps) {
  const palette = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isDark = themeName === 'night' || themeName.startsWith('contrast');

  const [definition, setDefinition] = useState<WordDefinition | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (visible && word) {
      const def = DictionaryService.lookup(word);
      setDefinition(def);
      setIsSaved(false);
    }
  }, [visible, word]);

  if (!visible || !definition) return null;

  const handleSaveWord = async () => {
    if (!definition) return;
    await DictionaryService.saveWord(
      definition.word,
      definition.definition,
      bookId,
      bookTitle,
      contextText
    );
    setIsSaved(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.dialogCard, { backgroundColor: palette.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.wordHeader}>
              <Text style={[styles.wordTitle, { color: palette.text }]}>
                {definition.word}
              </Text>
              {definition.partOfSpeech && (
                <Text style={[styles.partOfSpeech, { color: palette.muted }]}>
                  {definition.partOfSpeech}
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={palette.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* Definition text */}
            <Text style={[styles.definitionText, { color: palette.text }]}>
              {definition.definition}
            </Text>

            {/* Example sentence */}
            {definition.example && (
              <View style={[styles.exampleBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}>
                <Text style={[styles.exampleText, { color: palette.muted }]}>
                  &ldquo;{definition.example}&rdquo;
                </Text>
              </View>
            )}

            {/* Synonyms */}
            {definition.synonyms && definition.synonyms.length > 0 && (
              <View style={styles.synonymsSection}>
                <Text style={[styles.synonymsLabel, { color: palette.muted }]}>Synonyms:</Text>
                <View style={styles.chipsRow}>
                  {definition.synonyms.map((s) => (
                    <View
                      key={s}
                      style={[
                        styles.synonymChip,
                        { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                      ]}
                    >
                      <Text style={[styles.synonymChipText, { color: palette.text }]}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: isSaved
                    ? 'rgba(78, 205, 196, 0.15)'
                    : palette.link || (isDark ? '#C9B8FF' : '#4C4666'),
                },
              ]}
              onPress={handleSaveWord}
              disabled={isSaved}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isSaved ? 'checkmark-circle' : 'bookmark-outline'}
                size={16}
                color={isSaved ? '#4ECDC4' : isDark ? '#1A1A1D' : '#FFFFFF'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.saveButtonText,
                  {
                    color: isSaved ? '#4ECDC4' : isDark ? '#1A1A1D' : '#FFFFFF',
                  },
                ]}
              >
                {isSaved ? 'Word Saved' : 'Save to Vocabulary'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  wordHeader: {
    flex: 1,
  },
  wordTitle: {
    fontSize: 20,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  partOfSpeech: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scrollArea: {
    maxHeight: 240,
    marginVertical: 4,
  },
  definitionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  exampleBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  exampleText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  synonymsSection: {
    marginTop: 12,
  },
  synonymsLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  synonymChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  synonymChipText: {
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
