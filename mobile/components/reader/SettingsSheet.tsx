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
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const panelWidth = Math.min(360, Math.floor(screenWidth * 0.88));

  // Dynamic theme matching reader's active theme
  const activeTheme = READER_THEMES[settings.theme] || READER_THEMES.neutral;
  const isThemeDark = settings.theme === 'night' || settings.theme.startsWith('contrast');
  const panelBg = activeTheme.bg;
  const surfaceBg = activeTheme.surface;
  const textColor = activeTheme.text;
  const mutedColor = activeTheme.muted;
  const borderColor = isThemeDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
  const activeAccent = activeTheme.link || (isThemeDark ? '#C9B8FF' : '#4C4666');
  const activeAccentFg = isThemeDark ? '#000000' : '#FFFFFF';

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
      statusBarTranslucent={true}
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
              backgroundColor: panelBg,
              borderLeftColor: borderColor,
              paddingTop: Math.max(insets.top, 16) + 6,
              paddingBottom: Math.max(insets.bottom, 16) + 10,
              transform: [{ translateX }],
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconOrb, { backgroundColor: surfaceBg }]}>
                <Ionicons name="color-palette-outline" size={18} color={activeAccent} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: textColor }]}>Appearance</Text>
                <Text style={[styles.headerSubtitle, { color: mutedColor }]}>
                  Typography &amp; Layout
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: surfaceBg }]}
              accessibilityLabel="Close appearance panel"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 1. THEME PALETTE */}
            <Text style={[styles.sectionTitle, { color: mutedColor }]}>Theme Palette</Text>
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
                        borderColor: isSelected ? activeAccent : borderColor,
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
            <Text style={[styles.sectionTitle, { color: mutedColor, marginTop: 18 }]}>
              Reading Layout
            </Text>

            {/* Flow Mode */}
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Reading Flow</Text>
              <View style={[styles.segmentedControl, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                {(['paginated', 'scrolled'] as const).map((mode) => {
                  const isSelected = settings.flow === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.segmentBtn,
                        isSelected && { backgroundColor: activeAccent },
                      ]}
                      onPress={() => onUpdateSettings({ flow: mode })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isSelected ? activeAccentFg : mutedColor,
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
              <Text style={[styles.controlLabel, { color: textColor }]}>Page Margins</Text>
              <View style={[styles.segmentedControl, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                {marginOptions.map((opt) => {
                  const isSelected = settings.margin === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.segmentBtn,
                        isSelected && { backgroundColor: activeAccent },
                      ]}
                      onPress={() => onUpdateSettings({ margin: opt.value })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isSelected ? activeAccentFg : mutedColor,
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

            {/* Page Gap (Paginated Mode) */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Page Gap</Text>
              <View style={[styles.stepperRow, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      pageGap: Math.max(0, settings.pageGap - 4),
                    })
                  }
                >
                  <Ionicons name="remove" size={16} color={textColor} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: textColor }]}>{settings.pageGap} px</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      pageGap: Math.min(32, settings.pageGap + 4),
                    })
                  }
                >
                  <Ionicons name="add" size={16} color={textColor} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 3. RICH TYPOGRAPHY */}
            <Text style={[styles.sectionTitle, { color: mutedColor, marginTop: 18 }]}>
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
                          ? isThemeDark
                            ? 'rgba(201, 184, 255, 0.15)'
                            : 'rgba(76, 70, 102, 0.12)'
                          : surfaceBg,
                        borderColor: isSelected ? activeAccent : borderColor,
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
                              color: isSelected ? activeAccent : textColor,
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
                              backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            },
                          ]}
                        >
                          <Text style={[styles.categoryBadgeText, { color: mutedColor }]}>
                            {font.preview}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.fontPreview,
                          {
                            color: mutedColor,
                            fontFamily: nativeFamily,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {font.subtitle}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={activeAccent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Font Size Stepper */}
            <View style={[styles.controlRow, { marginTop: 14 }]}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Font Size</Text>
              <View style={[styles.stepperRow, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })
                  }
                >
                  <Ionicons name="remove" size={16} color={textColor} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: textColor }]}>{settings.fontSize} px</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({ fontSize: Math.min(36, settings.fontSize + 2) })
                  }
                >
                  <Ionicons name="add" size={16} color={textColor} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Line Spacing */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Line Spacing</Text>
              <View style={[styles.stepperRow, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      lineHeight: Number(Math.max(1.2, settings.lineHeight - 0.2).toFixed(1)),
                    })
                  }
                >
                  <Ionicons name="remove" size={16} color={textColor} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: textColor }]}>{settings.lineHeight}x</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({
                      lineHeight: Number(Math.min(2.4, settings.lineHeight + 0.2).toFixed(1)),
                    })
                  }
                >
                  <Ionicons name="add" size={16} color={textColor} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Paragraph Spacing */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Paragraph Gap</Text>
              <View style={[styles.stepperRow, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
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
                  <Ionicons name="remove" size={16} color={textColor} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: textColor }]}>
                  {settings.paragraphSpacing || 1.0} em
                </Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
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
                  <Ionicons name="add" size={16} color={textColor} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Text Alignment */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Alignment</Text>
              <View style={[styles.segmentedControl, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
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
                        isSelected && { backgroundColor: activeAccent },
                      ]}
                      onPress={() => onUpdateSettings({ alignment: align })}
                    >
                      <Ionicons
                        name={iconName}
                        size={17}
                        color={isSelected ? activeAccentFg : mutedColor}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Reset Button */}
            <TouchableOpacity
              style={[styles.resetBtn, { borderColor: borderColor, backgroundColor: surfaceBg }]}
              onPress={onResetSettings}
              activeOpacity={0.7}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={mutedColor}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.resetBtnText, { color: textColor }]}>
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
