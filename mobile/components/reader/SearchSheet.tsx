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
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchResult } from '@/models/Book';
import { useThemeContext } from '@/theme/ThemeContext';

interface SearchSheetProps {
  visible: boolean;
  onClose: () => void;
  results: SearchResult[];
  isSearching: boolean;
  onSearch: (query: string) => void;
  onSelectResult: (result: SearchResult) => void;
}

export function SearchSheet({
  visible,
  onClose,
  results,
  isSearching,
  onSearch,
  onSelectResult,
}: SearchSheetProps) {
  const { colors } = useThemeContext();
  const [query, setQuery] = useState('');

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
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={[styles.sheetContainer, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
              ]}
            >
              <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  if (text.trim().length > 1) {
                    onSearch(text.trim());
                  }
                }}
                placeholder="Search inside this book..."
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                onSubmitEditing={handleSubmit}
                autoFocus={true}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.cancelText, { color: colors.accent }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Results Count Bar */}
          {query.trim().length > 0 && !isSearching && (
            <View style={[styles.countBar, { borderBottomColor: colors.borderSubtle }]}>
              <Text style={[styles.countText, { color: colors.textSecondary }]}>
                {results.length === 0
                  ? 'No matches found in book'
                  : `${results.length} match${results.length === 1 ? '' : 'es'} found`}
              </Text>
            </View>
          )}

          {isSearching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
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
                  style={[styles.resultItem, { borderBottomColor: colors.borderSubtle }]}
                  onPress={() => {
                    onSelectResult(item);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  {item.label && (
                    <Text style={[styles.resultLabel, { color: colors.accent }]}>
                      {item.label}
                    </Text>
                  )}
                  <Text style={[styles.resultExcerpt, { color: colors.text }]}>
                    {item.excerpt}
                  </Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {query.length > 0
                  ? `No occurrences found for "${query}".`
                  : 'Enter words or phrases to search within this publication.'}
              </Text>
            </View>
          )}
        </SafeAreaView>
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
