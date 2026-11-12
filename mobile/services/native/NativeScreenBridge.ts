/**
 * Lirune Reader Mobile — Native Screen Bridge
 *
 * Window-level display controls for the reader, backed by the `LiruneScreen`
 * Kotlin module installed by `plugins/withLiruneScreen.js`.
 *
 * Every call here is best-effort. "Keep Screen Awake" is a comfort preference, so
 * a build without the native module must simply not hold the display on rather
 * than warn on every render or take the reader down with it.
 */

import { NativeModules, Platform } from 'react-native';
import { logger } from '@/utils/logger';

const TAG = 'NativeScreenBridge';

const { LiruneScreen } = NativeModules;

export const nativeScreen = {
  /** False on platforms without the module, and in a build that lost it. */
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!LiruneScreen;
  },

  /**
   * Holds the display on, or releases it.
   *
   * Resolves true when the window flag was applied, false when there was nothing
   * to apply it to or the platform has no such control.
   */
  async setKeepScreenOn(enabled: boolean): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await LiruneScreen.setKeepScreenOn(enabled);
    } catch (err) {
      logger.warn(TAG, 'setKeepScreenOn failed', err);
      return false;
    }
  },
};