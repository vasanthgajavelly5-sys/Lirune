/**
 * Lirune Reader Mobile — Archive Password Prompt Modal
 * Secure password dialog with 5-attempt threshold, inline error reporting,
 * and memory-only password handling.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

interface ArchivePasswordModalProps {
  visible: boolean;
  archiveName: string;
  attempts: number;
  maxAttempts?: number;
  errorMessage?: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function ArchivePasswordModal({
  visible,
  archiveName,
  attempts,
  maxAttempts = 5,
  errorMessage,
  onSubmit,
  onCancel,
}: ArchivePasswordModalProps) {
  const { colors } = useThemeContext();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!password.trim()) return;
    setIsSubmitting(true);
    onSubmit(password);
    setIsSubmitting(false);
    setPassword('');
  };

  const handleCancel = () => {
    setPassword('');
    onCancel();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={32} color={colors.accent} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Password Protected Archive</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Enter the password to browse books inside <Text style={{ fontWeight: '600' }}>{archiveName}</Text>.
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: errorMessage ? colors.error : colors.borderSubtle,
                color: colors.text,
              },
            ]}
            placeholder="Archive password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoFocus
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />

          {errorMessage ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>
                {errorMessage} (Attempt {attempts} of {maxAttempts})
              </Text>
            </View>
          ) : null}

          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.borderSubtle }]}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                styles.submitBtn,
                { backgroundColor: colors.accent, opacity: !password.trim() || isSubmitting ? 0.6 : 1 },
              ]}
              onPress={handleSubmit}
              disabled={!password.trim() || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Unlock archive"
            >
              <Text style={[styles.btnText, { color: colors.accentForeground }]}>Unlock</Text>
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
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3b82f61a',
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
  sub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 12,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    flex: 1,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  submitBtn: {},
  btnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
