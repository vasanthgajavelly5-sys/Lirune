/**
 * Lirune Reader Mobile — Reader Display Settings Sheet
 * Allows switching reading theme, font size, typeface, alignment, and spacing.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReaderSettings, ReaderThemeName } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (partial: Partial<ReaderSettings>) => void;
  onResetSettings: () => void;
}

export function SettingsSheet({
  visible,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
}: SettingsSheetProps) {
  const fontFamilies = ['Serif', 'Sans-Serif', 'Monospace'];
  const alignments: ('left' | 'center' | 'right' | 'justify')[] = [
    'left',
    'center',
    'right',
    'justify',
  ];

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
            <Text style={styles.headerTitle}>Reading Appearance</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#F0F0EB" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Theme Palettes Swatches */}
            <Text style={styles.sectionTitle}>Theme</Text>
            <View style={styles.themeGrid}>
              {Object.values(READER_THEMES).map((theme) => {
                const isSelected = settings.theme === theme.id;
                return (
                  <TouchableOpacity
                    key={theme.id}
                    style={[
                      styles.themeSwatch,
                      { backgroundColor: theme.bg, borderColor: isSelected ? '#C9B8FF' : '#3A3A3E' },
                    ]}
                    onPress={() => onUpdateSettings({ theme: theme.id as ReaderThemeName })}
                  >
                    <Text style={[styles.swatchText, { color: theme.text }]}>Aa</Text>
                    <Text
                      style={[styles.swatchLabel, { color: theme.muted }]}
                      numberOfLines={1}
                    >
                      {theme.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Font Size Stepper */}
            <Text style={styles.sectionTitle}>Font Size</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  onUpdateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })
                }
              >
                <Ionicons name="remove" size={20} color="#F0F0EB" />
              </TouchableOpacity>
              <Text style={styles.stepValue}>{settings.fontSize} px</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  onUpdateSettings({ fontSize: Math.min(36, settings.fontSize + 2) })
                }
              >
                <Ionicons name="add" size={20} color="#F0F0EB" />
              </TouchableOpacity>
            </View>

            {/* Typeface Selection */}
            <Text style={styles.sectionTitle}>Typeface</Text>
            <View style={styles.segmentedControl}>
              {fontFamilies.map((font) => {
                const isSelected = settings.fontFamily === font;
                return (
                  <TouchableOpacity
                    key={font}
                    style={[
                      styles.segmentBtn,
                      isSelected && styles.segmentBtnActive,
                    ]}
                    onPress={() => onUpdateSettings({ fontFamily: font })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        isSelected && styles.segmentTextActive,
                      ]}
                    >
                      {font}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Text Alignment */}
            <Text style={styles.sectionTitle}>Alignment</Text>
            <View style={styles.segmentedControl}>
              {alignments.map((align) => {
                const isSelected = settings.alignment === align;
                let iconName: any = 'menu-outline';
                if (align === 'left') iconName = 'reorder-three-outline';
                if (align === 'center') iconName = 'reorder-two-outline';
                if (align === 'right') iconName = 'reorder-three-outline';

                return (
                  <TouchableOpacity
                    key={align}
                    style={[
                      styles.segmentBtn,
                      isSelected && styles.segmentBtnActive,
                    ]}
                    onPress={() => onUpdateSettings({ alignment: align })}
                  >
                    <Ionicons
                      name={iconName}
                      size={20}
                      color={isSelected ? '#1A1A1D' : '#B8B8B0'}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Line Height */}
            <Text style={styles.sectionTitle}>Line Spacing</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  onUpdateSettings({
                    lineHeight: Number(Math.max(1.2, settings.lineHeight - 0.2).toFixed(1)),
                  })
                }
              >
                <Ionicons name="remove" size={20} color="#F0F0EB" />
              </TouchableOpacity>
              <Text style={styles.stepValue}>{settings.lineHeight}x</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  onUpdateSettings({
                    lineHeight: Number(Math.min(2.4, settings.lineHeight + 0.2).toFixed(1)),
                  })
                }
              >
                <Ionicons name="add" size={20} color="#F0F0EB" />
              </TouchableOpacity>
            </View>

            {/* Reset Button */}
            <TouchableOpacity style={styles.resetBtn} onPress={onResetSettings}>
              <Text style={styles.resetBtnText}>Restore Defaults</Text>
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </ScrollView>
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
  closeBtn: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888880',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 10,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeSwatch: {
    width: '23%',
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  swatchText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  swatchLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2F',
    borderRadius: 8,
    height: 44,
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#35353B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    color: '#F0F0EB',
    fontSize: 15,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2F',
    borderRadius: 8,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#C9B8FF',
  },
  segmentText: {
    color: '#B8B8B0',
    fontSize: 13,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#1A1A1D',
    fontWeight: '600',
  },
  resetBtn: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A3E',
  },
  resetBtnText: {
    color: '#B8B8B0',
    fontSize: 14,
  },
});
