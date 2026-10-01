/**
 * Lirune Reader Mobile — Offline TTS Reader Controls Sheet
 * Floating player bar and bottom drawer for listening to books offline.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ttsService, TtsState } from '@/services/tts/TtsService';
import { READER_THEMES } from '@/theme/Colors';

interface TtsControlsSheetProps {
  visible: boolean;
  themeName: string;
  bookTitle: string;
  onClose: () => void;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

export function TtsControlsSheet({
  visible,
  themeName,
  bookTitle,
  onClose,
}: TtsControlsSheetProps) {
  const insets = useSafeAreaInsets();
  const palette = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isDark = themeName === 'night' || themeName.startsWith('contrast');

  const [ttsState, setTtsState] = useState<TtsState>(ttsService.getState());
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  useEffect(() => {
    ttsService.hydrateVoiceSelection();
    ttsService.queryAvailableVoices();
    const unsubscribe = ttsService.subscribe((state) => {
      setTtsState(state);
    });
    return unsubscribe;
  }, []);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.surface,
          borderTopColor: palette.border || 'rgba(128,128,128,0.2)',
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <View style={styles.speakingBadge}>
            <Ionicons name="volume-high" size={14} color={palette.link} style={{ marginRight: 4 }} />
            <Text style={[styles.speakingText, { color: palette.link }]}>Offline TTS</Text>
          </View>
          <Text style={[styles.bookTitle, { color: palette.text }]} numberOfLines={1}>
            {bookTitle}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            ttsService.stop();
            onClose();
          }}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={22} color={palette.muted} />
        </TouchableOpacity>
      </View>

      {/* Current Sentence Excerpt */}
      <View style={[styles.excerptBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
        <Text style={[styles.excerptText, { color: palette.text }]} numberOfLines={3}>
          {ttsState.currentText || 'No readable text loaded.'}
        </Text>
        <Text style={[styles.counterText, { color: palette.muted }]}>
          {ttsState.totalSentences > 0
            ? `${ttsState.currentSentenceIndex + 1} of ${ttsState.totalSentences}`
            : '0 / 0'}
        </Text>
      </View>

      {/* Playback Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={() => ttsService.previous()}
          style={styles.navButton}
          disabled={ttsState.currentSentenceIndex <= 0}
        >
          <Ionicons
            name="play-back"
            size={22}
            color={ttsState.currentSentenceIndex > 0 ? palette.text : palette.muted}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (ttsState.isPlaying) {
              ttsService.pause();
            } else {
              ttsService.play();
            }
          }}
          style={[styles.playButton, { backgroundColor: palette.link || '#4C4666' }]}
          activeOpacity={0.85}
        >
          <Ionicons
            name={ttsState.isPlaying ? 'pause' : 'play'}
            size={28}
            color={isDark ? '#1A1A1D' : '#FFFFFF'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => ttsService.next()}
          style={styles.navButton}
          disabled={ttsState.currentSentenceIndex >= ttsState.totalSentences - 1}
        >
          <Ionicons
            name="play-forward"
            size={22}
            color={ttsState.currentSentenceIndex < ttsState.totalSentences - 1 ? palette.text : palette.muted}
          />
        </TouchableOpacity>
      </View>

      {/* Speed & Voice Options */}
      <View style={styles.optionsRow}>
        {/* Speed Chips */}
        <View style={styles.speedGroup}>
          <Text style={[styles.optionLabel, { color: palette.muted }]}>Speed:</Text>
          {SPEED_OPTIONS.map((spd) => {
            const isSelected = Math.abs(ttsState.rate - spd) < 0.05;
            return (
              <TouchableOpacity
                key={spd}
                style={[
                  styles.speedChip,
                  {
                    backgroundColor: isSelected ? palette.link : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  },
                ]}
                onPress={() => ttsService.setRate(spd)}
              >
                <Text
                  style={[
                    styles.speedChipText,
                    { color: isSelected ? (isDark ? '#1A1A1D' : '#FFFFFF') : palette.text },
                  ]}
                >
                  {spd}x
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Voice Selector */}
        <TouchableOpacity
          style={[styles.voiceBtn, { borderColor: palette.border || 'rgba(128,128,128,0.2)' }]}
          onPress={() => {
            ttsService.queryAvailableVoices();
            setShowVoicePicker(true);
          }}
        >
          <Ionicons name="mic-outline" size={14} color={palette.text} style={{ marginRight: 4 }} />
          <Text style={[styles.voiceBtnText, { color: palette.text }]} numberOfLines={1}>
            {ttsState.availableVoices.length > 0 ? 'Voice' : 'Voice (System)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Voice Selection Modal */}
      <Modal visible={showVoicePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.voiceModalContent, { backgroundColor: palette.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Select Local Voice</Text>
              <TouchableOpacity onPress={() => setShowVoicePicker(false)}>
                <Ionicons name="close" size={24} color={palette.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {/* Default System Voice option */}
              <TouchableOpacity
                style={[
                  styles.voiceItem,
                  {
                    backgroundColor: !ttsState.selectedVoiceIdentifier
                      ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                      : 'transparent',
                  },
                ]}
                onPress={() => {
                  ttsService.setVoice(undefined);
                  setShowVoicePicker(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.voiceName, { color: palette.text }]}>System Default Voice</Text>
                  <Text style={[styles.voiceLang, { color: palette.muted }]}>Device native TTS</Text>
                </View>
                {!ttsState.selectedVoiceIdentifier && (
                  <Ionicons name="checkmark" size={18} color={palette.link} />
                )}
              </TouchableOpacity>

              {ttsState.availableVoices.map((voice) => {
                const isSelected = voice.identifier === ttsState.selectedVoiceIdentifier;
                return (
                  <TouchableOpacity
                    key={voice.identifier}
                    style={[
                      styles.voiceItem,
                      {
                        backgroundColor: isSelected ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      ttsService.setVoice(voice.identifier);
                      setShowVoicePicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.voiceName, { color: palette.text }]}>{voice.name}</Text>
                      <Text style={[styles.voiceLang, { color: palette.muted }]}>{voice.language}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color={palette.link} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 150,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleArea: {
    flex: 1,
    marginRight: 8,
  },
  speakingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  speakingText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bookTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  excerptBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  excerptText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  counterText: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginVertical: 4,
  },
  navButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  speedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionLabel: {
    fontSize: 11,
    marginRight: 2,
  },
  speedChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  speedChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  voiceBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  voiceModalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  voiceName: {
    fontSize: 14,
    fontWeight: '600',
  },
  voiceLang: {
    fontSize: 12,
    marginTop: 2,
  },
});
