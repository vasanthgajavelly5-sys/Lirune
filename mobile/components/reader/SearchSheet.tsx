/**
 * Lirune Reader Mobile — In-Book Search Sheet
 * Clean in-book search with live match counters, jumping to matches, and theme matching.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SearchResult } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { useThemeContext } from '@/theme/ThemeContext';

interface SearchSheetProps {
  visible: boolean;
  onClose: () => void;
  results: SearchResult[];
  isSearching: boolean;
  onSearch: (query: string) => void;
  onSelectResult: (result: SearchResult) => void;
  themeName?: string;
}

export function SearchSheet({
  visible,
  onClose,
  results,
  isSearching,
  onSearch,
  onSelectResult,
  themeName,
}: SearchSheetProps) {
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  // Harmonize with reader theme if provided
  const activeTheme = themeName ? READER_THEMES[themeName] || READER_THEMES.neutral : null;
  const isThemeDark = themeName ? (themeName === 'night' || themeName.startsWith('contrast')) : false;

  const sheetBg = activeTheme ? activeTheme.bg : colors.surface;
  const surfaceBg = activeTheme ? activeTheme.surface : colors.surfaceElevated;
  const textColor = activeTheme ? activeTheme.text : colors.text;
  const mutedColor = activeTheme ? activeTheme.muted : colors.textMuted;
  const borderColor = activeTheme
    ? (isThemeDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)')
    : colors.borderSubtle;
  const accentColor = activeTheme ? (activeTheme.link || (isThemeDark ? '#C9B8FF' : '#4C4666')) : colors.accent;

  const handleSubmit = () => {
    if (query.trim()) {
      onSearch(query.trim());
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
              borderTopColor: borderColor,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: surfaceBg, borderColor: borderColor },
              ]}
            >
              <Ionicons name="search" size={18} color={mutedColor} style={styles.searchIcon} />
              <TextInput
                style={[styles.input, { color: textColor }]}
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  if (text.trim().length > 1) {
                    onSearch(text.trim());
                  }
                }}
                placeholder="Search inside this book..."
                placeholderTextColor={mutedColor}
                returnKeyType="search"
                onSubmitEditing={handleSubmit}
                autoFocus={true}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color={mutedColor} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.cancelText, { color: accentColor }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Results Count Bar */}
          {query.trim().length > 0 && !isSearching && (
            <View style={[styles.countBar, { borderBottomColor: borderColor }]}>
              <Text style={[styles.countText, { color: mutedColor }]}>
                {results.length === 0
                  ? 'No matches found in book'
                  : `${results.length} match${results.length === 1 ? '' : 'es'} found`}
              </Text>
            </View>
          )}

          {isSearching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={[styles.loadingText, { color: mutedColor }]}>
                Searching document contents...
              </Text>
            </View>
          ) : results.length > 0 ? (
            <FlatList
              data={results}
              keyExtractor={(_item, idx) => `search_res_${idx}`}
              contentContainerStyle={styles.resultsList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.resultItem, { borderBottomColor: borderColor }]}
                  onPress={() => {
                    onSelectResult(item);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  {item.label && (
                    <Text style={[styles.resultLabel, { color: accentColor }]}>
                      {item.label}
                    </Text>
                  )}
                  <Text style={[styles.resultExcerpt, { color: textColor }]}>
                    {item.excerpt}
                  </Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={40} color={mutedColor} />
              <Text style={[styles.emptyText, { color: mutedColor }]}>
                {query.length > 0
                  ? `No occurrences found for "${query}".`
                  : 'Enter words or phrases to search within this publication.'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
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
  closeBtn: {
    marginLeft: 12,
    padding: 6,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  countBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countText: {
    fontSize: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  resultsList: {
    paddingBottom: 24,
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  resultExcerpt: {
    fontSize: 14,
    lineHeight: 21,
  },
});
