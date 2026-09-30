/**
 * Lirune Reader Mobile — Reading Appearance Panel
 * Lirune Desktop-adapted Right-Side Sliding Panel.
 * Includes Theme Palette, Reading Mode & Margins, and Rich Typography (all 7 READER_FONTS, Size, Spacing, Alignment).
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ReaderSettings, ReaderThemeName } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { READER_FONTS, getNativeFontFamily } from '@/theme/Typography';
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
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const panelWidth = Math.min(360, Math.floor(screenWidth * 0.88));

  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.timing(anim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, anim]);

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

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth, 0],
  });

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Right-Side Panel */}
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              backgroundColor: isDark ? '#1C1C20' : '#FFFFFF',
              borderLeftColor: colors.borderSubtle,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 12,
              transform: [{ translateX }],
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconOrb, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="color-palette-outline" size={18} color={colors.accent} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Appearance</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                  Typography &amp; Layout
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
              accessibilityLabel="Close appearance panel"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 1. THEME PALETTE */}
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
                        borderWidth: isSelected ? 2.5 : 1,
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

            {/* 2. READING MODE & MARGINS */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 18 }]}>
              Reading Layout
            </Text>

            {/* Flow Mode */}
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Reading Flow</Text>
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
                        {mode === 'paginated' ? 'Page' : 'Scroll'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Margins */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
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

            {/* 3. RICH TYPOGRAPHY */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 18 }]}>
              Typeface
            </Text>

            {/* Full Font Choice Cards */}
            <View style={styles.fontList}>
              {READER_FONTS.map((font) => {
                const isSelected =
                  settings.fontFamily === font.name ||
                  settings.fontFamily.toLowerCase() === font.id.toLowerCase() ||
                  (font.id === 'serif' && settings.fontFamily.toLowerCase() === 'serif') ||
                  (font.id === 'sans' && settings.fontFamily.toLowerCase() === 'sans-serif') ||
                  (font.id === 'mono' && settings.fontFamily.toLowerCase() === 'monospace');

                const nativeFamily = getNativeFontFamily(font.name);

                return (
                  <TouchableOpacity
                    key={font.id}
                    style={[
                      styles.fontCard,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(238, 236, 248, 0.12)'
                            : 'rgba(76, 70, 102, 0.08)'
                          : colors.surfaceElevated,
                        borderColor: isSelected ? colors.accent : 'transparent',
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => onUpdateSettings({ fontFamily: font.name })}
                    activeOpacity={0.75}
                  >
                    <View style={styles.fontCardLeft}>
                      <View style={styles.fontHeaderRow}>
                        <Text
                          style={[
                            styles.fontCardName,
                            {
                              color: isSelected ? colors.accent : colors.text,
                              fontFamily: nativeFamily,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {font.name}
                        </Text>
                        <View
                          style={[
                            styles.categoryBadge,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                            },
                          ]}
                        >
                          <Text style={[styles.categoryBadgeText, { color: colors.textMuted }]}>
                            {font.preview}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.fontPreview,
                          {
                            color: colors.textSecondary,
                            fontFamily: nativeFamily,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {font.subtitle}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Font Size Stepper */}
            <View style={[styles.controlRow, { marginTop: 14 }]}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Font Size</Text>
              <View style={[styles.stepperRow, { backgroundColor: colors.surfaceElevated }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })
                  }
                >
                  <Ionicons name="remove" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.fontSize} px</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({ fontSize: Math.min(36, settings.fontSize + 2) })
                  }
                >
                  <Ionicons name="add" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Line Spacing */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Line Spacing</Text>
              <View style={[styles.stepperRow, { backgroundColor: colors.surfaceElevated }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      lineHeight: Number(Math.max(1.2, settings.lineHeight - 0.2).toFixed(1)),
                    })
                  }
                >
                  <Ionicons name="remove" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.lineHeight}x</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      lineHeight: Number(Math.min(2.4, settings.lineHeight + 0.2).toFixed(1)),
                    })
                  }
                >
                  <Ionicons name="add" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Paragraph Spacing */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <Text style={[styles.controlLabel, { color: colors.text }]}>Paragraph Gap</Text>
              <View style={[styles.stepperRow, { backgroundColor: colors.surfaceElevated }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      paragraphSpacing: Math.max(
                        0.5,
                        Math.round(((settings.paragraphSpacing || 1.0) - 0.25) * 100) / 100
                      ),
                    })
                  }
                >
                  <Ionicons name="remove" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: colors.text }]}>
                  {settings.paragraphSpacing || 1.0} em
                </Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: colors.surface }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      paragraphSpacing: Math.min(
                        2.5,
                        Math.round(((settings.paragraphSpacing || 1.0) + 0.25) * 100) / 100
                      ),
                    })
                  }
                >
                  <Ionicons name="add" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Text Alignment */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
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
                        size={17}
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
              <Ionicons
                name="refresh-outline"
                size={16}
                color={colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>
                Restore Default Appearance
              </Text>
            </TouchableOpacity>

            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  panel: {
    height: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconOrb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 8,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  themeSwatch: {
    width: '23%',
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  swatchText: {
    fontSize: 15,
    fontWeight: '700',
  },
  swatchLabel: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 2,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    paddingHorizontal: 3,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
  },
  segmentText: {
    fontSize: 11,
  },
  fontList: {
    gap: 6,
    marginBottom: 4,
  },
  fontCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  fontCardLeft: {
    flex: 1,
    marginRight: 8,
  },
  fontHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fontCardName: {
    fontSize: 14,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  fontPreview: {
    fontSize: 11,
    marginTop: 2,
  },
  resetBtn: {
    marginTop: 20,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
