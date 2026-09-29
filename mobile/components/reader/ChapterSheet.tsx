/**
 * Lirune Reader Mobile — Table of Contents Drawer/Sheet
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOCItem } from '@/models/Book';

interface ChapterSheetProps {
  visible: boolean;
  onClose: () => void;
  toc: TOCItem[];
  currentCfi?: string | null;
  onSelectChapter: (item: TOCItem, index: number) => void;
}

export function ChapterSheet({
  visible,
  onClose,
  toc,
  onSelectChapter,
}: ChapterSheetProps) {
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
            <Text style={styles.headerTitle}>Table of Contents</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#F0F0EB" />
            </TouchableOpacity>
          </View>

          {toc.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No chapters or sections found.</Text>
            </View>
          ) : (
            <FlatList
              data={toc}
              keyExtractor={(item, index) => item.id || `toc_${index}`}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.itemRow,
                    { paddingLeft: 16 + (item.depth || 0) * 16 },
                  ]}
                  onPress={() => {
                    onSelectChapter(item, index);
                    onClose();
                  }}
                >
                  <Text style={styles.itemText} numberOfLines={2}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    maxHeight: '80%',
    minHeight: '40%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3E',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#F0F0EB',
  },
  closeButton: {
    padding: 4,
  },
  itemRow: {
    paddingVertical: 14,
    paddingRight: 20,
  },
  itemText: {
    fontSize: 15,
    color: '#E0E0DB',
    lineHeight: 22,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2E2E32',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888880',
    fontSize: 14,
  },
});
