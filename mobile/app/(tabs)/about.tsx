import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Pressable } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from '@/components';

export default function AboutScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>ABOUT</Text>
          <Text style={[styles.wordmark, { color: theme.colors.text }]}>Lirune Reader</Text>
        </View>

        {/* Version */}
        <View style={styles.versionCard}>
          <Text style={[styles.versionLabel, { color: theme.colors.textMuted }]}>Version</Text>
          <Text style={[styles.versionNumber, { color: theme.colors.text }]}>4.0.3</Text>
          <Text style={[styles.versionBuild, { color: theme.colors.textFaint }]}>Build 4003001</Text>
        </View>

        {/* Description */}
        <Card variant="default" padding="lg" style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>About Lirune Reader</Text>
          <View style={styles.description}>
            <Text style={[styles.descLine, { color: theme.colors.textSecondary }]}>Lirune Reader is a calm, private home for your books.</Text>
            <Text style={[styles.descLine, { color: theme.colors.textSecondary }]}>Designed for focused reading, it keeps your library, progress, and notes entirely on your device — no accounts, no cloud, no tracking.</Text>
            <Text style={[styles.descLine, { color: theme.colors.textSecondary }]}>Built with care for readers who value privacy and simplicity.</Text>
          </View>
        </Card>

        {/* Features */}
        <Card variant="default" padding="lg" style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Features</Text>
          <View style={styles.featureList}>
            {[
              'EPUB 2/3 reading with pagination & scroll',
              'Offline-first, privacy-first architecture',
              'Collections for organizing your library',
              'Favorites, bookmarks, highlights & notes',
              'Customizable themes (dark, light, sepia)',
              'Typography controls (font, size, spacing, margins)',
              'Full-text search across your library',
              'Reading progress & statistics',
              'EPUB import via document picker',
              'Data export / import (JSON)',
            ].map((feature, i) => (
              <View key={i} style={styles.featureItem}>
                <Text style={[styles.featureBullet, { color: theme.colors.accent }]}>•</Text>
                <Text style={[styles.featureText, { color: theme.colors.textSecondary }]}>{feature}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Links */}
        <Card variant="default" padding="lg" style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Links</Text>
          <View style={styles.linkList}>
            <LinkButton label="Source Code (GitHub)" url="https://github.com/vasanthgajavelly5-sys/Novera" theme={theme} />
            <LinkButton label="Report an Issue" url="https://github.com/vasanthgajavelly5-sys/Novera/issues" theme={theme} />
            <LinkButton label="Privacy Policy" url="https://github.com/vasanthgajavelly5-sys/Novera/blob/main/docs/PRIVACY.md" theme={theme} />
            <LinkButton label="Third-Party Licenses" url="https://github.com/vasanthgajavelly5-sys/Novera/blob/main/THIRD_PARTY_NOTICES.md" theme={theme} />
          </View>
        </Card>

        {/* License */}
        <Card variant="outlined" padding="lg" style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>License</Text>
          <Text style={[styles.licenseText, { color: theme.colors.textMuted }]}>GPL-3.0-only — Free software, forever.</Text>
        </Card>

        {/* Credits */}
        <View style={styles.credits}>
          <Text style={[styles.creditsText, { color: theme.colors.textFaint }]}>Made with care for readers everywhere.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function LinkButton({ label, url, theme }: { label: string; url: string; theme: ReturnType<typeof import('@/theme').useTheme> }) {
  return (
    <Pressable style={styles.linkRow} onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={label}>
      <Text style={[styles.linkText, { color: theme.colors.accent }]}>{label}</Text>
      <Text style={[styles.linkArrow, { color: theme.colors.textMuted }]}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  header: { marginBottom: 24 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  wordmark: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  versionCard: { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  versionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  versionNumber: { fontSize: 28, fontWeight: '700', marginBottom: 2 },
  versionBuild: { fontSize: 11 },
  sectionCard: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  description: { gap: 12 },
  descLine: { fontSize: 14, lineHeight: 22 },
  featureList: { gap: 12 },
  featureItem: { flexDirection: 'row', gap: 10 },
  featureBullet: { fontSize: 14, fontWeight: '700' },
  featureText: { fontSize: 14, lineHeight: 20, flex: 1 },
  linkList: { gap: 12 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C3949' },
  linkText: { fontSize: 15, fontWeight: '500' },
  linkArrow: { fontSize: 15 },
  licenseText: { fontSize: 14, lineHeight: 20 },
  credits: { alignItems: 'center', paddingTop: 24, paddingBottom: 40 },
  creditsText: { fontSize: 12, textAlign: 'center' },
});