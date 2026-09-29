/**
 * Lirune Reader Mobile — About Screen
 * Version 4.0.4, Lirune branding, supported formats, privacy statement,
 * and Buy Me a Coffee support link.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';

export default function AboutScreen() {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const router = useRouter();

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const formats = [
    { name: 'EPUB', desc: 'Reflowable & Fixed' },
    { name: 'PDF', desc: 'Offline Vector' },
    { name: 'TXT', desc: 'Chunked Streaming' },
    { name: 'HTML', desc: 'Web Documents' },
    { name: 'FB2', desc: 'FictionBook XML' },
    { name: 'CBZ', desc: 'Comic Archives' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.topBarLeft}>
          <LiruneNavButton />
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: colors.text }]}>About</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Branding */}
        <View style={styles.header}>
          <View
            style={[
              styles.logoOrb,
              {
                backgroundColor: isDark ? 'rgba(238, 236, 248, 0.08)' : 'rgba(76, 70, 102, 0.08)',
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <Ionicons name="book" size={40} color={colors.accent} />
          </View>
          <Text style={[styles.wordmark, { color: colors.text }]}>Lirune Reader</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            A calm, private home for your books
          </Text>

          <View style={[styles.versionBadge, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.versionText, { color: colors.textSecondary }]}>
              Version 4.0.4 (Android) • Build 4004001
            </Text>
          </View>
        </View>

        {/* Buy Me a Coffee Support Action */}
        <TouchableOpacity
          style={[
            styles.supportCard,
            {
              backgroundColor: isDark ? 'rgba(255, 221, 0, 0.06)' : 'rgba(255, 221, 0, 0.12)',
              borderColor: '#FFDD00',
            },
          ]}
          onPress={() => handleOpenLink('https://buymeacoffee.com/vasanthgajavelly')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Support Lirune on Buy Me a Coffee"
        >
          <View style={styles.supportLeft}>
            <View style={styles.supportIconWrap}>
              <Ionicons name="cafe" size={24} color="#FFDD00" />
            </View>
            <View style={styles.supportTextWrap}>
              <Text style={[styles.supportTitle, { color: colors.text }]}>
                Support Lirune Reader
              </Text>
              <Text style={[styles.supportDesc, { color: colors.textSecondary }]}>
                Buy Me a Coffee to help keep Lirune independent, open-source, and ad-free.
              </Text>
            </View>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.text} style={styles.supportArrow} />
        </TouchableOpacity>

        {/* Philosophy / Overview */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy & Philosophy</Text>
          <Text style={[styles.descLine, { color: colors.textSecondary }]}>
            Lirune Reader is built on a quiet, privacy-first foundation. There are no accounts, no cloud sync servers, no analytics beacons, and no advertisements.
          </Text>
          <Text style={[styles.descLine, { color: colors.textSecondary }]}>
            Your entire library, reading stats, bookmarks, highlights, and annotations live entirely on your device under your direct control.
          </Text>
        </View>

        {/* Supported Formats */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Supported Formats</Text>
          <View style={styles.formatGrid}>
            {formats.map((fmt) => (
              <View
                key={fmt.name}
                style={[styles.formatChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
              >
                <Text style={[styles.formatName, { color: colors.accent }]}>{fmt.name}</Text>
                <Text style={[styles.formatDesc, { color: colors.textSecondary }]}>{fmt.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Features Matrix */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Core Capabilities</Text>
          <View style={styles.featureList}>
            {[
              'Discrete Page Mode & Continuous Scroll Mode',
              '8 handcrafted reading color palettes',
              'Adjustable font size, typeface, line & paragraph spacing',
              'In-book full-text search with live hit counters',
              'Offline-first library organization with custom collections',
              'Full JSON library backup and restore',
              'Long-press context actions on any book',
              'Local TalkBack and screen-reader accessibility',
            ].map((feature, i) => (
              <View key={i} style={styles.featureItem}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} style={styles.featureCheck} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* External Links */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Links & Source</Text>
          <View style={styles.linkList}>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => handleOpenLink('https://buymeacoffee.com/vasanthgajavelly')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: colors.accent }]}>Buy Me a Coffee</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => handleOpenLink('https://github.com/vasanthgajavelly5-sys/Lirune')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: colors.accent }]}>Source Code (GitHub)</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => handleOpenLink('https://github.com/vasanthgajavelly5-sys/Lirune/issues')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: colors.accent }]}>Report an Issue</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => handleOpenLink('https://github.com/vasanthgajavelly5-sys/Lirune/blob/main/docs/PRIVACY.md')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: colors.accent }]}>Privacy Documentation</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* License */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>License</Text>
          <Text style={[styles.licenseText, { color: colors.textSecondary }]}>
            GNU General Public License v3.0 (GPL-3.0) — Free &amp; Open Source Software, forever.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            Made with calm care for readers everywhere.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  backButton: {
    padding: 6,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },
  header: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  logoOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  wordmark: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    marginBottom: 14,
  },
  versionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  supportLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  supportIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 221, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportTextWrap: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  supportDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  supportArrow: {
    marginLeft: 8,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  descLine: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formatChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    width: '48%',
  },
  formatName: {
    fontSize: 13,
    fontWeight: '700',
  },
  formatDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  featureList: {
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureCheck: {
    marginTop: 2,
  },
  featureText: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  linkList: {
    gap: 4,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  licenseText: {
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
  },
});