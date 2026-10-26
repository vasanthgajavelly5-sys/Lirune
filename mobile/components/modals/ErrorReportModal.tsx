/**
 * Lirune Reader Mobile — Archive Error Report Modal
 * Shows human-readable error descriptions with "Copy report" diagnostic functionality.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

interface ErrorReportModalProps {
  visible: boolean;
  title: string;
  message: string;
  details?: string;
  onDismiss: () => void;
}

export function ErrorReportModal({
  visible,
  title,
  message,
  details,
  onDismiss,
}: ErrorReportModalProps) {
  const { colors } = useThemeContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const report = `[Lirune Archive Report]\nError: ${title}\nDescription: ${message}\nDetails:\n${details || 'No additional stack traces.'}`;
    try {
      Clipboard.setString(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="warning-outline" size={32} color="#E06C75" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          {details ? (
            <View style={[styles.detailsBox, { backgroundColor: colors.background, borderColor: colors.borderSubtle }]}>
              <ScrollView style={{ maxHeight: 120 }}>
                <Text style={[styles.detailsText, { color: colors.textMuted }]}>{details}</Text>
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.btn, styles.copyBtn, { borderColor: colors.borderSubtle }]}
              onPress={handleCopy}
              accessibilityRole="button"
              accessibilityLabel="Copy report"
            >
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={16}
                color={copied ? colors.success : colors.text}
              />
              <Text style={[styles.btnText, { color: copied ? colors.success : colors.text }]}>
                {copied ? 'Copied!' : 'Copy report'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.dismissBtn, { backgroundColor: colors.accent }]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={[styles.btnText, { color: colors.accentForeground }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e06c751a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  detailsBox: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  detailsText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  copyBtn: {
    borderWidth: 1,
  },
  dismissBtn: {},
  btnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
