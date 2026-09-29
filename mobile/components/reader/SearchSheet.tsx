/**
 * Lirune Reader Mobile — In-Book Search Sheet
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
        <SafeAreaView style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.inputContainer}>
              <Ionicons name="search" size={18} color="#888880" style={styles.searchIcon} />
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search inside this book..."
                placeholderTextColor="#888880"
                returnKeyType="search"
                onSubmitEditing={handleSubmit}
                autoFocus={true}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color="#888880" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {isSearching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#C9B8FF" />
              <Text style={styles.loadingText}>Searching document...</Text>
            </View>
          ) : results.length > 0 ? (
            <FlatList
              data={results}
              keyExtractor={(_item, idx) => `search_res_${idx}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => {
                    onSelectResult(item);
                    onClose();
                  }}
                >
                  {item.label && (
                    <Text style={styles.resultLabel}>{item.label}</Text>
                  )}
                  <Text style={styles.resultExcerpt}>{item.excerpt}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {query.length > 0
                  ? 'No occurrences found.'
                  : 'Type a word or phrase to search.'}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3E',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2F',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    color: '#F0F0EB',
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
    color: '#C9B8FF',
    fontSize: 15,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#888880',
    marginTop: 10,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888880',
    fontSize: 14,
  },
  resultItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C9B8FF',
    marginBottom: 4,
  },
  resultExcerpt: {
    fontSize: 14,
    color: '#D8D8D0',
    lineHeight: 20,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2E2E32',
  },
});
