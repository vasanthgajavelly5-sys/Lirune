/**
 * Lirune Reader Mobile — Reader Display Settings Sheet
 * Lirune Design Language: Theme, Layout (Page/Scroll, Margins), and Typography (Font, Size, Line/Paragraph Spacing, Alignment).
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
import { useThemeContext } from '@/theme/ThemeContext';

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
  const { colors } = useThemeContext();

  const fontFamilies = ['Serif', 'Sans-Serif', 'Monospace'];
  const alignments: ('left' | 'center' | 'right' | 'justify')[] = [
    'left',
    'center',
    'right',
    'justify',
  ];
  const marginOptions = [
    { label: 'Compact', value: 12 },
    { label: 'Standard', value: 20 },
    { label: 'Wide', value: 28 },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={[styles.sheetContainer, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}>
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <View style={styles.headerLeft}>
              <Ionicons name="options-outline" size={20} color={colors.accent} />
              <Text style={[styles.headerTitle, { color: colors.text }]}>Reading Appearance</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close settings">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 1. THEME */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Theme Palette</Text>
            <View style={styles.themeGrid}>
              {Object.values(READER_THEMES).map((theme) => {
                const isSelected = settings.theme === theme.id;
                return (
                  <TouchableOpacity
                    key={theme.id}
                    style={[
                      styles.themeSwatch,
                      {
                        backgroundColor: theme.bg,
                        borderColor: isSelected ? colors.accent : colors.borderSubtle,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => onUpdateSettings({ theme: theme.id as ReaderThemeName })}
                    activeOpacity={0.8}
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

            {/* 2. LAYOUT: Page vs Scroll & Margins */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Reading Layout</Text>
            
            {/* Flow Mode */}
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Reading Mode</Text>
              <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated }]}>
                {(['paginated', 'scrolled'] as const).map((mode) => {
                  const isSelected = settings.flow === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.segmentBtn,
                        isSelected && { backgroundColor: colors.accent },
                      ]}
                      onPress={() => onUpdateSettings({ flow: mode })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isSelected ? colors.accentForeground : colors.textSecondary,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {mode === 'paginated' ? 'Page Turn' : 'Scroll'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Margins */}
            <View style={[styles.controlRow, { marginTop: 10 }]}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Page Margins</Text>
              <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated }]}>
                {marginOptions.map((opt) => {
                  const isSelected = settings.margin === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.segmentBtn,
                        isSelected && { backgroundColor: colors.accent },
                      ]}
                      onPress={() => onUpdateSettings({ margin: opt.value })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isSelected ? colors.accentForeground : colors.textSecondary,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 3. TYPOGRAPHY */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Typography</Text>

            {/* Typeface */}
            <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated, marginBottom: 12 }]}>
              {fontFamilies.map((font) => {
                const isSelected = settings.fontFamily === font;
                return (
                  <TouchableOpacity
                    key={font}
                    style={[
                      styles.segmentBtn,
                      isSelected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => onUpdateSettings({ fontFamily: font })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: isSelected ? colors.accentForeground : colors.textSecondary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {font}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Font Size Stepper */}
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Font Size</Text>
              <View style={[styles.stepperRow, { backgroundColor: colors.surfaceElevated }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() =>
                    onUpdateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })
                  }
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.fontSize} px</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() =>
                    onUpdateSettings({ fontSize: Math.min(36, settings.fontSize + 2) })
                  }
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Line Spacing */}
            <View style={[styles.controlRow, { marginTop: 10 }]}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Line Spacing</Text>
              <View style={[styles.stepperRow, { backgroundColor: colors.surfaceElevated }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() =>
                    onUpdateSettings({
                      lineHeight: Number(Math.max(1.2, settings.lineHeight - 0.2).toFixed(1)),
                    })
                  }
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.lineHeight}x</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() =>
                    onUpdateSettings({
                      lineHeight: Number(Math.min(2.4, settings.lineHeight + 0.2).toFixed(1)),
                    })
                  }
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Paragraph Spacing */}
            <View style={[styles.controlRow, { marginTop: 10 }]}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Paragraph Spacing</Text>
              <View style={[styles.stepperRow, { backgroundColor: colors.surfaceElevated }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() =>
                    onUpdateSettings({
                      paragraphSpacing: Math.max(0.5, Math.round(((settings.paragraphSpacing || 1.0) - 0.25) * 100) / 100),
                    })
                  }
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: colors.text }]}>
                  {settings.paragraphSpacing || 1.0} em
                </Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() =>
                    onUpdateSettings({
                      paragraphSpacing: Math.min(2.5, Math.round(((settings.paragraphSpacing || 1.0) + 0.25) * 100) / 100),
                    })
                  }
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Text Alignment */}
            <View style={[styles.controlRow, { marginTop: 10 }]}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Alignment</Text>
              <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated }]}>
                {alignments.map((align) => {
                  const isSelected = settings.alignment === align;
                  let iconName: any = 'reorder-three-outline';
                  if (align === 'center') iconName = 'reorder-two-outline';
                  if (align === 'justify') iconName = 'menu-outline';

                  return (
                    <TouchableOpacity
                      key={align}
                      style={[
                        styles.segmentBtn,
                        isSelected && { backgroundColor: colors.accent },
                      ]}
                      onPress={() => onUpdateSettings({ alignment: align })}
                    >
                      <Ionicons
                        name={iconName}
                        size={18}
                        color={isSelected ? colors.accentForeground : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Reset Button */}
            <TouchableOpacity
              style={[styles.resetBtn, { borderColor: colors.borderSubtle }]}
              onPress={onResetSettings}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>Restore Default Appearance</Text>
            </TouchableOpacity>

            <View style={{ height: 36 }} />
          </ScrollView>
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeSwatch: {
    width: '23%',
    height: 58,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  swatchText: {
    fontSize: 17,
    fontWeight: '700',
  },
  swatchLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 4,
  },
  stepBtn: {
    width: 32,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  segmentText: {
    fontSize: 12,
  },
  resetBtn: {
    marginTop: 22,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
