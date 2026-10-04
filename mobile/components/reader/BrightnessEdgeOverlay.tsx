/**
 * Lirune Reader Mobile — Edge Brightness Control & Keep Screen Awake
 *
 * Swipe up or down along the left or right screen edge to dim or brighten the
 * reader. A floating pill follows the gesture and hides itself two seconds after
 * the finger lifts.
 *
 * One rule shapes this component: it must never take a touch away from the
 * reader. The overlay is `box-none`, and the only views that can become the touch
 * responder are the two 44dp edge zones, which sit outside the page-turn tap
 * zones. Keep Screen Awake is mounted conditionally so it releases the lock as
 * soon as the reader closes, without depending on an effect to tidy up after it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  Text,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { nativeScreen } from '@/services/native/NativeScreenBridge';

/** Width of the edge zones that trigger brightness control (dp). */
const EDGE_ZONE_DP = 44;
/** Vertical dp of travel for one percent of brightness change. */
const DP_PER_PERCENT = 3.2;
/** Movement before a touch is treated as a gesture rather than a stray tap. */
const GESTURE_SLOP = 8;
/** ms the pill stays on screen after the gesture ends. */
const PILL_HIDE_DELAY_MS = 2000;
/** How far a gesture must lean vertical before it is claimed. */
const VERTICAL_BIAS = 1.6;

interface BrightnessEdgeOverlayProps {
  /** False while a sheet is open, so the overlay cannot compete with its controls. */
  isReading: boolean;
  /** Undimmed brightness, 10 - 100. */
  brightness: number;
  onBrightnessChange: (brightness: number) => void;
  keepAwake?: boolean;
  accentColor?: string;
  textColor?: string;
  pillBg?: string;
}

/** The responder props `PanResponder.create` hands back. */
type GestureResponderHandlers = ReturnType<typeof PanResponder.create>['panHandlers'];

/**
 * Holds the display on with `FLAG_KEEP_SCREEN_ON` for as long as it is mounted.
 *
 * A window flag is the right lifetime for "Keep Screen Awake": the system drops it
 * when the window goes away, so leaving the reader releases it even if the app is
 * killed mid-chapter. Mounting and unmounting with the setting — rather than
 * toggling from inside — means switching the preference off releases the flag
 * immediately.
 */
function KeepScreenAwake({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    void nativeScreen.setKeepScreenOn(true);
    return () => {
      void nativeScreen.setKeepScreenOn(false);
    };
  }, [enabled]);
  return null;
}

export function BrightnessEdgeOverlay({
  isReading,
  brightness,
  onBrightnessChange,
  keepAwake = false,
  accentColor = '#C9B8FF',
  textColor = '#FFFFFF',
  pillBg = 'rgba(28,28,32,0.88)',
}: BrightnessEdgeOverlayProps) {
  const [pillVisible, setPillVisible] = useState(false);
  const [pillOpacity] = useState(() => new Animated.Value(0));
  const pillHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The gesture handlers are created once so an in-flight gesture is never
  // dropped by a re-render; they read the live values through this record, which
  // is kept in step in an effect rather than during render.
  const live = useRef({ brightness, onBrightnessChange });
  useEffect(() => {
    live.current = { brightness, onBrightnessChange };
  }, [brightness, onBrightnessChange]);
  const readLive = useCallback(() => live.current, []);

  const showPill = useCallback(() => {
    if (pillHideTimer.current) {
      clearTimeout(pillHideTimer.current);
      pillHideTimer.current = null;
    }
    setPillVisible(true);
    Animated.timing(pillOpacity, {
      toValue: 1,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [pillOpacity]);

  const hidePill = useCallback(
    (delay: number) => {
      if (pillHideTimer.current) clearTimeout(pillHideTimer.current);
      pillHideTimer.current = setTimeout(() => {
        Animated.timing(pillOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setPillVisible(false);
        });
      }, delay);
    },
    [pillOpacity]
  );

  // Built once, in an effect: creating a PanResponder during render would run
  // the gesture callbacks in the render phase.
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers | null>(null);
  useEffect(() => {
    const responder = PanResponder.create({
      // A tap in the edge zone still belongs to the reader (it turns the page),
      // so the responder is only claimed once the finger has actually moved.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState
      ) =>
        Math.abs(gesture.dy) > GESTURE_SLOP &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx) * VERTICAL_BIAS,
      onPanResponderGrant: () => {
        showPill();
      },
      onPanResponderMove: (_event, gesture) => {
        const current = readLive();
        const delta = Math.round(-gesture.dy / DP_PER_PERCENT);
        const next = Math.min(100, Math.max(10, current.brightness - delta));
        if (next !== current.brightness) current.onBrightnessChange(next);
      },
      onPanResponderRelease: () => hidePill(PILL_HIDE_DELAY_MS),
      onPanResponderTerminate: () => hidePill(PILL_HIDE_DELAY_MS),
    });
    setPanHandlers(responder.panHandlers);
  }, [hidePill, readLive, showPill]);

  // Nothing to draw for a fully bright reader.
  const dimAlpha = brightness >= 100 ? 0 : (100 - brightness) / 100;
  const level = Math.round(brightness);

  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
    level >= 80 ? 'sunny-outline' : level >= 45 ? 'partly-sunny-outline' : 'moon-outline';

  useEffect(
    () => () => {
      if (pillHideTimer.current) clearTimeout(pillHideTimer.current);
    },
    []
  );

  return (
    <>
      {/* Keep Screen Awake outlives the overlay: opening a menu is not leaving the
          book, and the flag is released when the reader itself goes away. */}
      {keepAwake && <KeepScreenAwake enabled />}

      {!isReading ? null : (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="brightness-edge-overlay">
          {/* Dimming layer. Under the pill and under the navigation bars. */}
          {dimAlpha > 0 && (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: dimAlpha }]}
              pointerEvents="none"
            />
          )}

          {/* The only two views that can claim a touch. */}
          <View style={[styles.edgeZone, styles.edgeLeft]} {...(panHandlers ?? {})} accessible={false} />
          <View style={[styles.edgeZone, styles.edgeRight]} {...(panHandlers ?? {})} accessible={false} />

          {pillVisible && (
            <Animated.View
              style={[styles.pill, { backgroundColor: pillBg, opacity: pillOpacity }]}
              pointerEvents="none"
              accessibilityRole="progressbar"
              accessibilityValue={{ now: level, min: 10, max: 100 }}
            >
              <Ionicons name={iconName} size={18} color={accentColor} style={styles.pillIcon} />
              <View style={styles.pillTrack}>
                <View style={[styles.pillFill, { width: `${level}%`, backgroundColor: accentColor }]} />
              </View>
              <Text style={[styles.pillLabel, { color: textColor }]}>{level}%</Text>
            </Animated.View>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  edgeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: EDGE_ZONE_DP,
    zIndex: 2,
  },
  edgeLeft: { left: 0 },
  edgeRight: { right: 0 },
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    top: '18%',
    width: 210,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 3,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  pillIcon: { marginRight: 8 },
  pillTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  pillFill: {
    height: '100%',
    borderRadius: 2,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'right',
  },
});