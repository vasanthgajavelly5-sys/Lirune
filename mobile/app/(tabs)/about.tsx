import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';

export default function AboutScreen() {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const formats = [
    ['EPUB', 'Reflowable and fixed'],
    ['PDF', 'Offline vector'],
    ['MOBI', 'Kindle format'],
    ['AZW', 'Amazon Kindle'],
    ['AZW3', 'Kindle Format 8'],
    ['FB2', 'FictionBook XML'],
    ['CBZ', 'Comic ZIP archive'],
    ['CBR', 'Comic RAR archive'],
    ['DOCX', 'Word OpenXML'],
    ['DOC', 'Word 97-2003 binary'],
    ['ODT', 'OpenDocument Text'],
    ['RTF', 'Rich text format'],
    ['TXT', 'Plain text'],
    ['HTML', 'Web documents'],
    ['CHM', 'Compiled HTML help'],
    ['DJVU', 'DjVu document'],
    ['ZIP', 'Archive container'],
    ['RAR', 'Archive container'],
  ];
  const features = [
    'Universal offline document readers', 'Discrete page and continuous EPUB reading',
    'Native offline text-to-speech', 'Offline English dictionary',
    'Content zoom with safe-area protection', 'Highlights, notes, and bookmarks',
    'Reading themes and adjustable typography', 'In-book search',
    'Local collections and filters', 'SAF storage discovery',
    'Zero telemetry, analytics, advertisements, accounts, or cloud sync',
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={[styles.topBar, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.topBarLeft}>
          <LiruneNavButton />
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: colors.text }]}>About</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.logoOrb, { backgroundColor: isDark ? 'rgba(238,236,248,0.08)' : 'rgba(76,70,102,0.08)', borderColor: colors.borderSubtle }]}>
            <Ionicons name="book" size={40} color={colors.accent} />
          </View>
          <Text style={[styles.wordmark, { color: colors.text }]}>Lirune Reader</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>A calm, private home for your books</Text>
          <View style={[styles.versionBadge, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.versionText, { color: colors.textSecondary }]}>Version {Constants.expoConfig?.version ?? 'Unknown'} (Android)</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy and Philosophy</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Lirune Reader is completely offline. There are no accounts, cloud sync servers, analytics beacons, advertisements, or required network services.</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Your books, reading progress, bookmarks, highlights, notes, dictionary, and settings stay on this device.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Supported Formats</Text>
          <View style={styles.formatGrid}>
            {formats.map(([name, description]) => (
              <View key={name} style={[styles.formatChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.formatName, { color: colors.accent }]}>{name}</Text>
                <Text style={[styles.formatDesc, { color: colors.textSecondary }]}>{description}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Core Capabilities</Text>
          {features.map((feature) => (
            <View key={feature} style={styles.featureItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="cafe" size={20} color="#FF813F" style={{ marginRight: 8 }} />
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Support the Project</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.textSecondary, marginTop: 8 }]}>
            Lirune Reader is free, open source, and ad-free. If you enjoy reading with Lirune, consider buying a coffee to support development!
          </Text>
          <TouchableOpacity
            style={styles.coffeeButton}
            onPress={() => Linking.openURL('https://buymeacoffee.com/vasanthgajavelly')}
            activeOpacity={0.85}
            accessibilityRole="link"
            accessibilityLabel="Buy Me a Coffee"
          >
            <Ionicons name="cafe" size={19} color="#000000" style={{ marginRight: 8 }} />
            <Text style={styles.coffeeButtonText}>Buy Me a Coffee</Text>
            <Ionicons name="open-outline" size={16} color="#000000" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>License</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>GNU General Public License v3.0 (GPL-3.0). Free and open-source software.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBarTitle: { fontSize: 20, fontWeight: '700' },
  backButton: { padding: 6 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  header: { alignItems: 'center', marginTop: 12, marginBottom: 20 },
  logoOrb: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  wordmark: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  tagline: { fontSize: 14, marginBottom: 14 },
  versionBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  versionText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  bodyText: { fontSize: 13, lineHeight: 20, marginBottom: 8 },
  formatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, width: '48%' },
  formatName: { fontSize: 13, fontWeight: '700' },
  formatDesc: { fontSize: 11, marginTop: 2 },
  featureItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  featureText: { fontSize: 13, lineHeight: 19, flex: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  coffeeButton: {
    backgroundColor: '#FFDD00',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  coffeeButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
