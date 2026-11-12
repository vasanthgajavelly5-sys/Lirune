/**
 * Lirune Reader Mobile — Startup Init Gating Helper
 * Determines whether critical launch stores (settings and library)
 * have completed loading so the splash screen can be safely hidden
 * without an empty grid or wrong-theme flash.
 */

export interface InitGatingState {
  settingsLoaded: boolean;
  libraryLoaded: boolean;
}

/**
 * Pure gating helper: returns true if and only if both settings and library
 * have finished loading their persistent state from SQLite.
 */
export function canHideSplashScreen(state: InitGatingState): boolean {
  return Boolean(state.settingsLoaded && state.libraryLoaded);
}
