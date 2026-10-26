/**
 * Lirune Reader Mobile — Storage Diagnostics Modal
 * Inspects sources, SAF grant validity, job journal, and in-memory log buffer with a Copy button.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';
import { getDatabase } from '@/services/database/Database';
import { nativeStorage } from '@/services/storage/NativeStorageBridge';
import { logger } from '@/utils/logger';

interface StorageDiagnosticsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function StorageDiagnosticsModal({ visible, onClose }: StorageDiagnosticsModalProps) {
  const { colors } = useThemeContext();
  const [sources, setSources] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [volumes, setVolumes] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      loadDiagnostics();
    }
  }, [visible]);

  const loadDiagnostics = async () => {
    try {
      // 1. Logs
      setLogs(logger.getLogBuffer());

      // 2. Volumes
      const vols = await nativeStorage.getStorageVolumes();
      setVolumes(vols);

      // 3. Database sources and jobs
      const db = await getDatabase();
      if (db) {
        const sourceRows = await db.getAllAsync<any>(
          'SELECT * FROM sources ORDER BY id DESC LIMIT 50;'
        );
        setSources(sourceRows);

        const jobRows = await db.getAllAsync<any>(
          'SELECT * FROM jobs ORDER BY id DESC LIMIT 50;'
        );
        setJobs(jobRows);

        // Validate persisted grants
        if (sourceRows.length > 0) {
          const uris = sourceRows.map((s) => s.tree_uri).filter(Boolean);
          const validation = await nativeStorage.validatePersistedGrants(uris);
          const revokedSet = new Set(validation.revokedUris);
          setSources(
            sourceRows.map((s) => ({
              ...s,
              isActuallyValid: !revokedSet.has(s.tree_uri),
            }))
          );
        }
      }
    } catch (err) {
      logger.error('Diagnostics', 'Failed to load diagnostics', err);
    }
  };

  const handleCopyReport = async () => {
    const report = {
      timestamp: new Date().toISOString(),
      volumes,
      sources,
      recentJobs: jobs,
      recentLogs: logs,
    };
    try {
      await Share.share({
        title: 'Lirune Storage Diagnostics',
        message: JSON.stringify(report, null, 2),
      });
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Storage Diagnostics</Text>
          <TouchableOpacity onPress={handleCopyReport} style={styles.copyBtn}>
            <Ionicons name="copy-outline" size={20} color={colors.accent} />
            <Text style={[styles.copyBtnText, { color: colors.accent }]}>Copy</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Storage Volumes */}
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>Storage Volumes</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {volumes.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No storage volumes reported</Text>
            ) : (
              volumes.map((v, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>
                    {v.label} {v.isPrimary ? '(Primary)' : '(Removable)'}
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.textSecondary }]}>
                    ID: {v.id} | Free: {(v.freeBytes / 1024 / 1024).toFixed(0)} MB / {(v.totalBytes / 1024 / 1024).toFixed(0)} MB
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Persisted Sources */}
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>Configured Sources &amp; SAF Grants</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {sources.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No SAF sources recorded yet</Text>
            ) : (
              sources.map((s, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={styles.badgeRow}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{s.label || s.tree_uri}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: s.isActuallyValid ? colors.success + '22' : colors.error + '22' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: s.isActuallyValid ? colors.success : colors.error },
                        ]}
                      >
                        {s.isActuallyValid ? 'Grant Valid' : 'Grant Lost'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.itemSub, { color: colors.textSecondary }]}>
                    URI: {s.tree_uri}
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.textMuted }]}>
                    Mode: {s.import_mode} | Last Scan: {s.last_scan_at ? new Date(s.last_scan_at).toLocaleString() : 'Never'}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Job Journal */}
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>Recent Job Journal</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {jobs.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No jobs journaled yet</Text>
            ) : (
              jobs.map((j, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={styles.badgeRow}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>Job #{j.id} ({j.type})</Text>
                    <Text
                      style={[
                        styles.statusText,
                        { color: j.state === 'ready' ? colors.success : j.state === 'failed' ? colors.error : colors.accent },
                      ]}
                    >
                      {j.state}
                    </Text>
                  </View>
                  {j.error ? (
                    <Text style={[styles.itemSub, { color: colors.error }]}>Error: {j.error}</Text>
                  ) : null}
                  <Text style={[styles.itemSub, { color: colors.textMuted }]}>
                    Updated: {new Date(j.updated_at).toLocaleTimeString()}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Recent Logs (Last 200) */}
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Recent Logs ({logs.length} lines)
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {logs.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No log lines buffered</Text>
            ) : (
              logs.map((line, idx) => (
                <Text key={idx} style={[styles.logLine, { color: colors.textSecondary }]}>
                  {line}
                </Text>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  itemRow: {
    paddingVertical: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  logLine: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginVertical: 1,
  },
});
