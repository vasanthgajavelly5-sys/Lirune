/**
 * Lirune Reader Mobile — Reading Profiles Modal
 * Save, load, and delete named ReaderSettings profiles.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useSettingsStore } from '@/state/settingsStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { LiruneDialog } from '@/components/LiruneDialog';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ProfileModal({ visible, onClose }: Props) {
  const { colors } = useThemeContext();
  const { profiles, saveProfile, loadProfile, deleteProfile } = useSettingsStore();
  const [newName, setNewName] = useState('');

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) return;
    await saveProfile(name);
    setNewName('');
  };

  const handleLoad = async (name: string) => {
    await loadProfile(name);
    onClose();
  };

  const handleDelete = (name: string) => {
    Alert.alert('Delete Profile', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteProfile(name) },
    ]);
  };

  const profileNames = Object.keys(profiles);

  return (
    <LiruneDialog visible={visible} onCancel={onClose} title="Reading Profiles" cancelText="Close">
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Profile name"
          placeholderTextColor={colors.textMuted}
          value={newName}
          onChangeText={setNewName}
        />
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.accent }]}
          onPress={handleSave}
        >
          <Text style={[styles.saveBtnText, { color: colors.accentForeground }]}>Save</Text>
        </TouchableOpacity>
      </View>
      {profileNames.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No saved profiles yet.</Text>
      ) : (
        <FlatList
          data={profileNames}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <View style={[styles.profileRow, { borderBottomColor: colors.borderSubtle }]}>
              <Text style={[styles.profileName, { color: colors.text }]}>{item}</Text>
              <TouchableOpacity onPress={() => handleLoad(item)} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: colors.accent }]}>Load</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </LiruneDialog>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, fontSize: 14 },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { fontSize: 14, fontWeight: '600' },
  empty: { textAlign: 'center', fontSize: 14, marginTop: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  profileName: { flex: 1, fontSize: 15 },
  actionBtn: { paddingHorizontal: 10 },
  actionText: { fontSize: 14, fontWeight: '500' },
});
