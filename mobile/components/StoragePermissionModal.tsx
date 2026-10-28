/**
 * Lirune Reader Mobile — Storage Permission Modal
 *
 * Shown once after the welcome intro (or immediately if intro was skipped).
 * Requests MANAGE_EXTERNAL_STORAGE (All Files Access) the way ReadEra does:
 *   - explain what it is and why we need it
 *   - clearly state the app is 100% offline
 *   - if the user declines, show a follow-up warning that explains consequences
 *     and lets them reconsider or proceed with limited access (per-file SAF only)
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

type PermStep = 'explain' | 'declined_warning';

export interface StoragePermissionModalProps {
  visible: boolean;
  onComplete: (granted: boolean) => void;
}

export function StoragePermissionModal({ visible, onComplete }: StoragePermissionModalProps) {
  const { colors } = useThemeContext();
  const [step, setStep] = useState<PermStep>('explain');

  if (!visible) return null;

  if (step === 'explain') {
    return (
      <Modal visible animationType="fade" transparent onRequestClose={() => setStep('declined_warning')}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: (colors as any).modalBackground ?? colors.surface, borderColor: colors.borderSubtle }]}>
            <View style={styles.iconRow}>
              <View style={[styles.bigIconCircle, { backgroundColor: colors.accent + '22' }]}>
                <Ionicons name="shield-checkmark" size={40} color={colors.accent} />
              </View>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Allow Storage Access</Text>
            <Text style={[styles.subtitle, { color: colors.accent }]}>Browse your entire device — no account required</Text>
            <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
              <View style={[styles.privacyBadge, { backgroundColor: colors.success + '18', borderColor: colors.success + '40' }]}>
                <Ionicons name="wifi-outline" size={16} color={colors.success} />
                <Text style={[styles.privacyBadgeText, { color: colors.success }]}>
                  100% Offline · No Internet · No Account · No Cloud
                </Text>
              </View>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {'Lirune works like a file manager. When you grant '}
                <Text style={{ color: colors.text, fontWeight: '600' }}>All Files Access</Text>
                {', you can navigate from root storage to every folder — including '}
                <Text style={{ fontStyle: 'italic' }}>Downloads</Text>
                {', '}
                <Text style={{ fontStyle: 'italic' }}>Documents</Text>
                {', SD card — and open books directly '}
                <Text style={{ color: colors.text, fontWeight: '600' }}>without copying or uploading them anywhere</Text>
                {'.'}
              </Text>
              {([
                { icon: 'folder-open-outline', text: 'Browse Downloads, Documents & SD card instantly' },
                { icon: 'flash-outline', text: 'Open books in-place — no slow import copy' },
                { icon: 'archive-outline', text: 'Peek inside ZIP files without extracting' },
                { icon: 'lock-closed-outline', text: 'All data stays on your device, always' },
              ] as const).map(({ icon, text }, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={[styles.featureIconBox, { backgroundColor: colors.accent + '18' }]}>
                    <Ionicons name={icon} size={17} color={colors.accent} />
                  </View>
                  <Text style={[styles.featureText, { color: colors.textSecondary }]}>{text}</Text>
                </View>
              ))}
              <Text style={[styles.legalNote, { color: colors.textMuted }]}>
                {'Android will show its system settings screen. Toggle '}
                <Text style={{ fontStyle: 'italic' }}>Allow access to manage all files</Text>
                {' and return to Lirune. You can revoke this at any time in Android Settings → Apps → Lirune → Permissions.'}
              </Text>
            </ScrollView>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { borderColor: colors.borderSubtle }]}
                onPress={() => setStep('declined_warning')}
                accessibilityRole="button"
                accessibilityLabel="Not now">
                <Text style={[styles.btnText, { color: colors.textSecondary }]}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent }]}
                onPress={() => onComplete(true)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Grant all files access">
                <Ionicons name="shield-checkmark" size={17} color={colors.accentForeground} />
                <Text style={[styles.btnText, { color: colors.accentForeground, fontWeight: '700' }]}>Grant Access</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => onComplete(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: (colors as any).modalBackground ?? colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.iconRow}>
            <View style={[styles.bigIconCircle, { backgroundColor: colors.warning + '22' }]}>
              <Ionicons name="warning" size={40} color={colors.warning} />
            </View>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Limited Access Mode</Text>
          <Text style={[styles.subtitle, { color: colors.warning }]}>Some features will not be available</Text>
          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.privacyBadge, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]}>
              <Ionicons name="lock-closed" size={15} color={colors.accent} />
              <Text style={[styles.privacyBadgeText, { color: colors.accent }]}>
                This app is completely offline. It never sends data anywhere.
              </Text>
            </View>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {'Without All Files Access you can still use Lirune, but you will need to '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>pick each folder or file individually</Text>
              {' using Android\'s file picker. You\'ll have more control over exactly what Lirune can see — but you '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>won\'t be able to browse Downloads directly</Text>
              {' or open files without an import step.'}
            </Text>
            {([
              { icon: 'close-circle-outline', text: 'Cannot browse Downloads or storage root', warn: true },
              { icon: 'close-circle-outline', text: 'Each folder must be authorized separately', warn: true },
              { icon: 'close-circle-outline', text: 'Opening a book requires a slow import copy', warn: true },
              { icon: 'checkmark-circle-outline', text: 'You can still import files using the file picker', warn: false },
              { icon: 'checkmark-circle-outline', text: 'All reading features work normally', warn: false },
            ] as const).map(({ icon, text, warn }, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name={icon} size={18} color={warn ? colors.error : colors.success} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{text}</Text>
              </View>
            ))}
            <Text style={[styles.legalNote, { color: colors.textMuted }]}>
              {'You can grant All Files Access at any time from the '}
              <Text style={{ fontWeight: '600' }}>Folders</Text>
              {' tab or from '}
              <Text style={{ fontWeight: '600' }}>Settings → Storage Access</Text>
              {'.'}
            </Text>
          </ScrollView>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, { borderColor: colors.borderSubtle }]}
              onPress={() => onComplete(false)}
              accessibilityRole="button"
              accessibilityLabel="Proceed without access">
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>Proceed without</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent }]}
              onPress={() => setStep('explain')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Give full access">
              <Ionicons name="shield-checkmark" size={17} color={colors.accentForeground} />
              <Text style={[styles.btnText, { color: colors.accentForeground, fontWeight: '700' }]}>Give Full Access</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, borderRadius: 24, borderWidth: 1, padding: 24, elevation: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, maxHeight: '90%' as any },
  iconRow: { alignItems: 'center', marginBottom: 14 },
  bigIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: -0.4, marginBottom: 4 },
  subtitle: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  bodyScroll: { maxHeight: 320 },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  privacyBadgeText: { fontSize: 12, fontWeight: '600', flex: 1 },
  body: { fontSize: 13.5, lineHeight: 21, marginBottom: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  featureIconBox: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  featureText: { fontSize: 13, lineHeight: 19, flex: 1 },
  legalNote: { fontSize: 11.5, lineHeight: 17, marginTop: 12, marginBottom: 4 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14 },
  btnPrimary: {},
  btnSecondary: { borderWidth: 1 },
  btnText: { fontSize: 13.5, fontWeight: '600' },
});
