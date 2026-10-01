/**
 * Lirune Reader Mobile — First-Launch Welcome Card & Guide
 * Introduces users to Lirune Reader's calm, private reading environment.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

export interface WelcomeGuideModalProps {
  visible: boolean;
  onDismiss?: () => void;
  onClose?: () => void;
}

export function WelcomeGuideModal({
  visible,
  onDismiss,
  onClose,
}: WelcomeGuideModalProps) {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const [currentStep, setCurrentStep] = useState<number>(0);
  const handleDismiss = onDismiss || onClose || (() => {});

  if (!visible) return null;

  const steps = [
    {
      icon: 'book' as const,
      iconColor: isDark ? '#EEECF8' : colors.accent,
      title: 'A Calm, Private Home',
      tagline: 'Your books, completely offline and private.',
      description:
        'Lirune Reader is designed for quiet, distraction-free reading. Your books, progress, bookmarks, and notes remain stored locally on your device with no accounts, cloud sync, or telemetry.',
    },
    {
      icon: 'library' as const,
      iconColor: isDark ? '#C9B8FF' : '#6D28D9',
      title: 'All Your Formats',
      tagline: '18 formats: EPUB, PDF, MOBI, AZW, AZW3, FB2, CBZ, CBR, DJVU, DOCX, ODT, RTF, TXT, HTML, DOC, CHM, ZIP, RAR.',
      description:
        'Import single books or whole libraries from your device. Lirune extracts metadata, parses chapters, and presents your collection with custom covers and progress tracking.',
    },
    {
      icon: 'swap-horizontal' as const,
      iconColor: isDark ? '#7DD3FC' : '#0284C7',
      title: 'Page Mode & Scroll Mode',
      tagline: 'Read the way that feels natural to you.',
      description:
        'Switch between discrete Page Mode (swipe left/right or tap edges to turn pages) and continuous Scroll Mode anytime in Reader Settings. Customize typefaces, margins, line spacing, and paragraph spacing.',
    },
    {
      icon: 'heart' as const,
      iconColor: isDark ? '#FF6584' : '#E11D48',
      title: 'Collections & Annotations',
      tagline: 'Organize your library effortlessly.',
      description:
        'Long press any book in grid or list view to open the context menu. Tag favorites with the heart icon, organize titles into collections, and highlight passages with notes while you read.',
    },
  ];

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      handleDismiss();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1C1C22' : '#FFFFFF',
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          {/* Header Branding */}
          <View style={styles.brandRow}>
            <View style={[styles.brandIconCircle, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="bookmark" size={20} color={colors.accent} />
            </View>
            <View>
              <Text style={[styles.brandWordmark, { color: colors.text }]}>Lirune Reader</Text>
              <Text style={[styles.brandTagline, { color: colors.textMuted }]}>
                Guide & Introduction
              </Text>
            </View>
          </View>

          {/* Step Content */}
          <View style={styles.stepContent}>
            <View
              style={[
                styles.stepIconWrap,
                { backgroundColor: isDark ? 'rgba(238, 236, 248, 0.08)' : 'rgba(76, 70, 102, 0.08)' },
              ]}
            >
              <Ionicons name={step.icon} size={36} color={step.iconColor} />
            </View>

            <Text style={[styles.stepTitle, { color: colors.text }]}>
              {step.title}
            </Text>
            <Text style={[styles.stepTagline, { color: colors.accent }]}>
              {step.tagline}
            </Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
              {step.description}
            </Text>
          </View>

          {/* Step Indicators */}
          <View style={styles.indicators}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === currentStep
                        ? colors.accent
                        : isDark
                        ? 'rgba(255, 255, 255, 0.15)'
                        : 'rgba(0, 0, 0, 0.15)',
                    width: i === currentStep ? 22 : 6,
                  },
                ]}
              />
            ))}
          </View>

          {/* Footer Controls */}
          <View style={styles.footer}>
            {currentStep > 0 ? (
              <TouchableOpacity
                style={[styles.backBtn, { borderColor: colors.borderSubtle }]}
                onPress={handlePrev}
              >
                <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleDismiss}
              >
                <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.accent }]}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={[styles.nextText, { color: colors.accentForeground }]}>
                {isLast ? 'Get Started' : 'Continue'}
              </Text>
              {!isLast && (
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color={colors.accentForeground}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  brandIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWordmark: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  brandTagline: {
    fontSize: 11,
    fontWeight: '500',
  },
  stepContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  stepIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  stepTagline: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  stepDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    marginBottom: 20,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    gap: 8,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
