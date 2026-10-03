/**
 * Lirune Reader Mobile — WebView crash recovery
 *
 * Android kills a WebView renderer when the system is short on memory, and iOS
 * terminates a content process the same way. React Native then unmounts the view
 * with nothing on screen, and the reader's progress is only whatever the last
 * queue write reached — which is how "the book went blank and I lost my place"
 * happened.
 *
 * Every reader that hosts a WebView spreads these props into it, so recovery is
 * implemented once: save the last known position, remount with a new key, and let
 * the reader restore from the CFI it just persisted.
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { WebViewProps } from 'react-native-webview';

type RecoveryProps = Pick<
  WebViewProps,
  'onRenderProcessGone' | 'onContentProcessDidTerminate' | 'onError' | 'onHttpError'
>;
import { logger } from '@/utils/logger';

const TAG = 'WebViewRecovery';

export interface WebViewRecoveryOptions {
  /** Persists the position to write before the process goes away. */
  savePosition?: () => void;
  /** Shown to the user while the view is being rebuilt. */
  onMessage?: (message: string) => void;
  /** Distinguishes concurrent readers so their keys do not collide. */
  scope: string;
}

export interface WebViewRecovery {
  /** Spread into the `<WebView>`; carries the recovery handlers. */
  recoveryProps: RecoveryProps;
  /** Changes whenever the view has to be rebuilt. */
  reloadKey: string;
  /** True while a rebuild is in flight. */
  isRecovering: boolean;
}

export function useWebViewRecovery({ savePosition, onMessage, scope }: WebViewRecoveryOptions): WebViewRecovery {
  const [reloadCount, setReloadCount] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);
  const attemptsRef = useRef(0);

  const recover = useCallback(
    (reason: string) => {
      // A renderer that dies immediately on every reload is a bug, not a crash;
      // retrying forever would spin the CPU and drain the battery.
      if (attemptsRef.current >= 3) {
        logger.error(TAG, `${scope}: giving up after ${attemptsRef.current} recovery attempts (${reason})`);
        onMessage?.('This document keeps crashing. Try re-opening it, or re-import the file.');
        return;
      }
      attemptsRef.current += 1;
      logger.warn(TAG, `${scope}: WebView renderer lost (${reason}), rebuilding`);
      // Whatever the reader knows right now is the last position that can be kept.
      savePosition?.();
      onMessage?.('The document renderer was closed by the system. Restoring your place…');
      setIsRecovering(true);
      setReloadCount((count) => count + 1);
      // Give the remounted view a moment before the message is cleared.
      setTimeout(() => setIsRecovering(false), 1200);
    },
    [onMessage, savePosition, scope]
  );

  return {
    reloadKey: `${scope}-${reloadCount}`,
    isRecovering,
    recoveryProps: {
      onRenderProcessGone:
        Platform.OS === 'android'
          ? (event) => {
              // The app must not touch this view again: the docs require the
              // WebView to be torn down and remounted, never reused.
              const crashed =
                (event?.nativeEvent as { crashed?: boolean } | undefined)?.crashed ?? true;
              recover(crashed ? 'renderer crashed' : 'renderer gone');
            }
          : undefined,
      onContentProcessDidTerminate: () => recover('content process terminated'),
      onError: (event) => {
        logger.error(TAG, `${scope}: WebView error: ${event?.nativeEvent?.description ?? 'unknown'}`);
        recover('load error');
      },
      onHttpError: (event) => {
        // Sub-resource 404s are normal in a self-contained viewer document.
        logger.warn(TAG, `${scope}: HTTP ${event?.nativeEvent?.statusCode} for ${event?.nativeEvent?.url ?? ''}`);
      },
    },
  };
}
