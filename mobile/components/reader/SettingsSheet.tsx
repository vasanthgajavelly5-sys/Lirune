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
  useWindowDimensions,
  Pressable,
  Platform,
  StatusBar,
} from 'react-native';
import { useStableInsets } from '@/hooks/useStableInsets';
import { Ionicons } from '@expo/vector-icons';
import { ReaderSettings, ReaderThemeName, clampReaderBrightness } from '@/models/Book';
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
  const insets = useStableInsets();
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) : 0;
  const safeTop = Math.max(insets.top, statusBarHeight, 28);
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = Math.min(360, Math.floor(screenWidth * 0.88));

  const [showAllFontsModal, setShowAllFontsModal] = useState(false);
  const [fontCategoryFilter, setFontCategoryFilter] = useState<'all' | 'serif' | 'sans' | 'slab' | 'special'>('all');

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

  const brightness = clampReaderBrightness(settings.brightness);

  const columnOptions: { label: string; value: ReaderSettings['columns'] }[] = [
    { label: 'Auto', value: 'auto' },
    { label: 'One', value: 1 },
    { label: 'Two', value: 2 },
  ];

  const primaryFontIds = ['serif', 'sans-serif', 'cormorant', 'merriweather'];
  const displayedPrimaryFonts = READER_FONTS.filter((f) => {
    const isSelected =
      settings.fontFamily.toLowerCase() === f.name.toLowerCase() ||
      settings.fontFamily.toLowerCase() === f.id.toLowerCase();
    return primaryFontIds.includes(f.id.toLowerCase()) || isSelected;
  }).slice(0, 4);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth, 0],
  });

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <>
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { paddingTop: safeTop + 4, paddingBottom: safeBottom + 4 }]}>
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
              borderTopColor: borderColor,
              borderBottomColor: borderColor,
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

          <ScrollView
            style={styles.content}
            contentContainerStyle={{ paddingBottom: safeBottom + 24 }}
            showsVerticalScrollIndicator={false}
          >
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

            {/* Columns — 'auto' follows the measured window, 1 and 2 force it */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Columns</Text>
              <View style={[styles.segmentedControl, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                {columnOptions.map((option) => {
                  const isSelected = (settings.columns ?? 'auto') === option.value;
                  return (
                    <TouchableOpacity
                      key={String(option.value)}
                      style={[
                        styles.segmentBtn,
                        isSelected && { backgroundColor: activeAccent },
                      ]}
                      onPress={() => onUpdateSettings({ columns: option.value })}
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
                        {option.label}
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

            {/* 3. READING COMFORT */}
            <Text style={[styles.sectionTitle, { color: mutedColor, marginTop: 18 }]}>
              Reading Comfort
            </Text>

            {/* Brightness — the same value the edge swipe gesture writes */}
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: textColor }]}>Brightness</Text>
              <View style={[styles.stepperRow, { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 }]}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  accessibilityLabel="Dim the page"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({ brightness: clampReaderBrightness((settings.brightness ?? 100) - 10) })
                  }
                >
                  <Ionicons name="moon-outline" size={16} color={textColor} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { color: textColor }]}>{brightness}%</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                  accessibilityLabel="Brighten the page"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    onUpdateSettings({ brightness: clampReaderBrightness((settings.brightness ?? 100) + 10) })
                  }
                >
                  <Ionicons name="sunny-outline" size={16} color={textColor} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.brightnessTrackWrap, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
              <View style={styles.brightnessTrack}>
                <View
                  style={[
                    styles.brightnessFill,
                    { width: `${brightness}%`, backgroundColor: activeAccent },
                  ]}
                />
              </View>
            </View>

            {/* Keep Screen Awake */}
            <View style={[styles.controlRow, { marginTop: 12 }]}>
              <View style={styles.controlLabelGroup}>
                <Text style={[styles.controlLabel, { color: textColor }]}>Keep Screen Awake</Text>
                <Text style={[styles.controlHint, { color: mutedColor }]}>
                  Hold the display on while this book stays open.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onUpdateSettings({ keepScreenAwake: settings.keepScreenAwake === false })}
                accessibilityRole="switch"
                accessibilityState={{ checked: settings.keepScreenAwake !== false }}
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor:
                      settings.keepScreenAwake !== false ? activeAccent : (isThemeDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
                  },
                ]}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.switchKnob,
                    settings.keepScreenAwake !== false ? styles.switchKnobOn : styles.switchKnobOff,
                  ]}
                />
              </TouchableOpacity>
            </View>

            {/* 4. RICH TYPOGRAPHY */}
            <Text style={[styles.sectionTitle, { color: mutedColor, marginTop: 18 }]}>
              Typeface
            </Text>

            {/* Primary Font Choice Cards */}
            <View style={styles.fontList}>
              {displayedPrimaryFonts.map((font) => {
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

              {/* More Fonts Button */}
              <TouchableOpacity
                style={[
                  styles.moreFontsBtn,
                  {
                    backgroundColor: surfaceBg,
                    borderColor: borderColor,
                  },
                ]}
                onPress={() => setShowAllFontsModal(true)}
                activeOpacity={0.75}
              >
                <View style={styles.moreFontsLeft}>
                  <View style={[styles.moreFontsIconBg, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                    <Ionicons name="text-outline" size={16} color={activeAccent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moreFontsTitle, { color: textColor }]}>
                      More Fonts ({READER_FONTS.length} available)…
                    </Text>
                    <Text style={[styles.moreFontsSubtitle, { color: mutedColor }]}>
                      Browse all freely licensed reading typefaces
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={17} color={mutedColor} />
              </TouchableOpacity>
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

    {/* Dedicated All Fonts Popup Modal */}
    <Modal
      visible={showAllFontsModal}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={() => setShowAllFontsModal(false)}
    >
      <View style={styles.fontsModalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAllFontsModal(false)} />
        <View
          style={[
            styles.fontsModalContainer,
            {
              backgroundColor: panelBg,
              borderColor: borderColor,
            },
          ]}
        >
          {/* Modal Header */}
          <View style={[styles.fontsModalHeader, { borderBottomColor: borderColor }]}>
            <View>
              <Text style={[styles.fontsModalTitle, { color: textColor }]}>Choose Typeface</Text>
              <Text style={[styles.fontsModalSubtitle, { color: mutedColor }]}>
                {READER_FONTS.length} freely usable reading typefaces
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowAllFontsModal(false)}
              style={[styles.closeBtn, { backgroundColor: surfaceBg }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Category filter pills */}
          <View style={styles.categoryPillsRow}>
            {(['all', 'serif', 'sans', 'slab', 'special'] as const).map((cat) => {
              const isCatActive = fontCategoryFilter === cat;
              const catLabel =
                cat === 'all'
                  ? 'All'
                  : cat === 'special'
                    ? 'Dyslexic'
                    : cat.charAt(0).toUpperCase() + cat.slice(1);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryFilterPill,
                    isCatActive
                      ? { backgroundColor: activeAccent }
                      : { backgroundColor: surfaceBg, borderColor: borderColor, borderWidth: 1 },
                  ]}
                  onPress={() => setFontCategoryFilter(cat)}
                >
                  <Text
                    style={[
                      styles.categoryFilterPillText,
                      { color: isCatActive ? activeAccentFg : mutedColor },
                    ]}
                  >
                    {catLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Full list of fonts */}
          <ScrollView
            style={styles.fontsModalList}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {READER_FONTS.filter((f) => fontCategoryFilter === 'all' || f.category === fontCategoryFilter).map((font) => {
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
                      marginBottom: 8,
                    },
                  ]}
                  onPress={() => {
                    onUpdateSettings({ fontFamily: font.name });
                    setShowAllFontsModal(false);
                  }}
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
                          { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                        ]}
                      >
                        <Text style={[styles.categoryBadgeText, { color: mutedColor }]}>
                          {font.category?.toUpperCase() || 'SERIF'}
                        </Text>
                      </View>
                      {font.license && (
                        <Text style={[styles.licenseBadgeText, { color: mutedColor }]}>
                          • {font.license}
                        </Text>
                      )}
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
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
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
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    overflow: 'hidden',
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
    flex: 1,
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
  controlLabelGroup: {
    flex: 1,
    marginRight: 12,
  },
  controlHint: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  brightnessTrackWrap: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  brightnessTrack: {
    flex: 1,
    borderRadius: 3,
  },
  brightnessFill: {
    height: '100%',
    borderRadius: 3,
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  switchKnobOn: { alignSelf: 'flex-end' },
  switchKnobOff: { alignSelf: 'flex-start' },
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
  moreFontsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  moreFontsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  moreFontsIconBg: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreFontsTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  moreFontsSubtitle: {
    fontSize: 10,
    marginTop: 1,
  },
  fontsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  fontsModalContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  fontsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fontsModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  fontsModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    flexWrap: 'wrap',
  },
  categoryFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  categoryFilterPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fontsModalList: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  licenseBadgeText: {
    fontSize: 9,
    fontStyle: 'italic',
  },
});
