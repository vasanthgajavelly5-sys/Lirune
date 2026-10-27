/**
 * Lirune Reader Mobile — Blocked / Unsupported Incoming Intent Modal
 * Displayed when an external app triggers VIEW / SEND intent with an unsupported
 * or blocked file (such as .apk, .jar, corrupt, or unrecognized formats).
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';
import { nativeStorage } from '@/services/storage/NativeStorageBridge';

export interface BlockedFileInfo {
  fileName: string;
  reason: string;
  uri?: string;
}

interface BlockedFileModalProps {
  info: BlockedFileInfo | null;
  onDismiss: () => void;
}

export function BlockedFileModal({ info, onDismiss }: BlockedFileModalProps) {
  const { colors } = useThemeContext();

  if (!info) return null;

  const handleClose = async () => {
    try {
      await nativeStorage.clearCurrentIntent();
    } catch {
      // Ignored
    }
    onDismiss();
    // Finish activity / exit app to return to previous caller
    BackHandler.exitApp();
  };

  return (
    <Modal
      visible={Boolean(info)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.dialogCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.iconCircle}>
            <Ionicons name="ban-outline" size={40} color={colors.blocked} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            {"Lirune can't open this file"}
          </Text>

          <View style={[styles.filenameBox, { backgroundColor: colors.background, borderColor: colors.borderSubtle }]}>
            <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.filenameText, { color: colors.text }]} numberOfLines={2}>
              {info.fileName}
            </Text>
          </View>

          <Text style={[styles.reasonText, { color: colors.textSecondary }]}>
            {info.reason}
          </Text>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.accent }]}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close and return to previous application"
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(224, 108, 117, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  filenameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    width: '100%',
    marginBottom: 14,
  },
  filenameText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  closeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
