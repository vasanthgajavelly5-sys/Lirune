/**
 * Lirune Reader Mobile — Reader Error Boundary
 * Prevents black screen crashes in reader engines and displays a graceful recovery interface.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { logger } from '@/utils/logger';

const TAG = 'ReaderErrorBoundary';

interface Props {
  children: ReactNode;
  themeBg?: string;
  textColor?: string;
  accentColor?: string;
  onRetry: () => void;
  onExit: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  retryCount: number;
}

export class ReaderErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error(TAG, 'Uncaught error in reader engine', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = () => {
    if (this.state.retryCount >= 3) return;
    this.setState((prev) => ({
      hasError: false,
      errorMessage: '',
      retryCount: prev.retryCount + 1,
    }));
    this.props.onRetry();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const bg = this.props.themeBg || '#1A1A1D';
      const textColor = this.props.textColor || '#FFFFFF';
      const accent = this.props.accentColor || '#EEECF8';
      const canRetry = this.state.retryCount < 3;

      return (
        <View style={[styles.container, { backgroundColor: bg }]}>
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Ionicons name="warning-outline" size={40} color="#FF6B6B" />
            </View>
            <Text style={[styles.title, { color: textColor }]}>Display Error</Text>
            <Text style={styles.subtitle}>
              {canRetry
                ? 'Lirune encountered an issue while rendering this document.'
                : 'Maximum retry attempts reached for this publication.'}
            </Text>
            {this.state.errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorDetails} numberOfLines={4}>
                  {this.state.errorMessage}
                </Text>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              {canRetry && (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: accent }]}
                  onPress={this.handleReset}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={18} color="#1A1A1D" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryButtonText}>
                    Retry ({3 - this.state.retryCount} left)
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={this.props.onExit}
                activeOpacity={0.7}
              >
                <Ionicons name="library-outline" size={18} color={textColor} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryButtonText, { color: textColor }]}>
                  Library
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 20,
  },
  errorDetails: {
    fontSize: 12,
    color: '#FF8A80',
    fontFamily: 'monospace',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#1A1A1D',
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
});
