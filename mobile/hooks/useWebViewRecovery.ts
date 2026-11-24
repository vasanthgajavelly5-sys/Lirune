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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import { logger } from '@/utils/logger';

type RecoveryProps = Pick<
  WebViewProps,
  'onRenderProcessGone' | 'onContentProcessDidTerminate' | 'onError' | 'onHttpError'
>;

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
  const isMountedRef = useRef(true);
  const savePositionRef = useRef(savePosition);
  savePositionRef.current = savePosition;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const recover = useCallback(
    (reason: string) => {
      if (!isMountedRef.current) return;
      // A renderer that dies immediately on every reload is a bug, not a crash;
      // retrying forever would spin the CPU and drain the battery.
      if (attemptsRef.current >= 3) {
        logger.error(TAG, `${scope}: giving up after ${attemptsRef.current} recovery attempts (${reason})`);
        onMessageRef.current?.('This document keeps crashing. Try re-opening it, or re-import the file.');
        return;
      }
      attemptsRef.current += 1;
      logger.warn(TAG, `${scope}: WebView renderer lost (${reason}), rebuilding`);
      // Whatever the reader knows right now is the last position that can be kept.
      savePositionRef.current?.();
      onMessageRef.current?.('The document renderer was closed by the system. Restoring your place…');
      setIsRecovering(true);
      setReloadCount((count) => count + 1);
      // Give the remounted view a moment before the message is cleared.
      setTimeout(() => {
        if (isMountedRef.current) setIsRecovering(false);
      }, 1200);
    },
    [scope]
  );

  return {
    reloadKey: `${scope}-${reloadCount}`,
    isRecovering,
    recoveryProps: {
      onRenderProcessGone:
        Platform.OS === 'android'
          ? (event) => {
              if (!isMountedRef.current) return;
              // Only recover if the render process genuinely crashed.
              // If Android killed the renderer cleanly because the view was unmounted,
              // detached, or reclaimed under system isolation, recover must NOT fire.
              const nativeEvent = event?.nativeEvent as { didCrash?: boolean; crashed?: boolean } | undefined;
              const didCrash = nativeEvent?.didCrash ?? nativeEvent?.crashed ?? false;
              if (didCrash) {
                recover('renderer crashed');
              } else {
                logger.info(TAG, `${scope}: WebView renderer cleanly reaped by OS (view unmounted/isolated)`);
              }
            }
          : undefined,
      onContentProcessDidTerminate: () => recover('content process terminated'),
      onError: (event) => {
        // Subresource or minor load errors must not trigger a destructive WebView remount loop.
        logger.warn(TAG, `${scope}: WebView load error: ${event?.nativeEvent?.description ?? 'unknown'}`);
      },
      onHttpError: (event) => {
        // Sub-resource 404s are normal in a self-contained viewer document.
        logger.warn(TAG, `${scope}: HTTP ${event?.nativeEvent?.statusCode} for ${event?.nativeEvent?.url ?? ''}`);
      },
    },
  };
}
