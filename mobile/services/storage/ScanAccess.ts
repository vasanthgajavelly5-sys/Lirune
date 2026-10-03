/**
 * Lirune Reader Mobile — scan access state
 *
 * Android 11 split storage in two: MediaStore only indexes media, so an EPUB or a
 * PDF sitting in Download is invisible to it, and the SAF picker refuses to hand
 * out the storage root or the Download folder itself. Only All files access
 * (MANAGE_EXTERNAL_STORAGE) can see a book library stored there.
 *
 * That permission is scary enough that asking for it silently — and then
 * returning an empty list when it was refused — is the wrong behaviour. This
 * module resolves what the app can actually reach; the Scan screen is responsible
 * for explaining the difference to the user.
 *
 * Nothing here uploads anything: the permission is only ever used to read file
 * names and paths the user already has on the device.
 */

import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { nativeStorage } from './NativeStorageBridge';
import { logger } from '@/utils/logger';

const TAG = 'ScanAccess';

export type ScanAccess =
  /** All files access (or the pre-Android-11 storage permission): the whole phone. */
  | 'full'
  /** MediaStore plus explicitly authorised folders only. */
  | 'limited'
  /** No storage permission at all. */
  | 'denied';

/** How long to wait for the user to come back from the system settings screen. */
const RETURN_TIMEOUT_MS = 120000;

function isAndroid11OrNewer(): boolean {
  const version = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  return Number.isFinite(version) ? version >= 30 : false;
}

/**
 * Whether the native module is present. A missing module makes every native step
 * silently do nothing, which used to look like "the phone has no books".
 */
export function isNativeScanAvailable(): boolean {
  return nativeStorage.isAvailable();
}

async function hasLegacyStoragePermission(): Promise<boolean> {
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE as never,
      {
        title: 'Allow access to your books',
        message: 'Lirune needs permission to read book files stored on this device.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    logger.warn(TAG, 'READ_EXTERNAL_STORAGE request failed', err);
    return false;
  }
}

/** Resolves once the app comes back to the foreground after a settings trip. */
function waitForReturnToApp(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve();
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish();
    });
    // The user may grant access and come straight back, or dismiss the screen
    // and never return; either way the scan continues with what we have.
    const timer = setTimeout(finish, RETURN_TIMEOUT_MS);
  });
}

/**
 * What can the scanner reach right now?
 *
 * Never throws and never prompts for the All files access settings screen on its
 * own: `openAllFilesAccessSettings` is a separate, explicit call so the caller can
 * explain the permission first.
 */
export async function resolveScanAccess(): Promise<ScanAccess> {
  if (Platform.OS !== 'android') return 'limited';
  if (!nativeStorage.isAvailable()) return 'limited';

  if (!isAndroid11OrNewer()) {
    return (await nativeStorage.hasStoragePermission()) ? 'full' : 'limited';
  }

  return (await nativeStorage.hasAllFilesAccess()) ? 'full' : 'limited';
}

/**
 * Opens the All files access settings page and waits for the user to come back.
 *
 * Returns the access level after the round trip. Callers must have explained the
 * permission first; the scan screen shows that dialog once per decision, not on
 * every tap.
 */
export async function openAllFilesAccessSettings(): Promise<ScanAccess> {
  if (Platform.OS !== 'android' || !nativeStorage.isAvailable()) return 'limited';

  if (!isAndroid11OrNewer()) {
    // Nothing to grant on Android 10 and below beyond the storage permission.
    return (await hasLegacyStoragePermission()) ? 'full' : 'denied';
  }

  if (await nativeStorage.hasAllFilesAccess()) return 'full';

  await nativeStorage.requestAllFilesAccess();
  await waitForReturnToApp();
  return resolveScanAccess();
}

/**
 * Requesting the pre-Android-11 permission, kept separate because it is a normal
 * runtime dialog rather than a settings trip.
 */
export async function requestLegacyStoragePermission(): Promise<ScanAccess> {
  if (Platform.OS !== 'android') return 'denied';
  if (!isAndroid11OrNewer()) {
    return (await hasLegacyStoragePermission()) ? 'full' : 'denied';
  }
  return resolveScanAccess();
}

/** Copy shown next to the Scan Phone button for the resolved access level. */
export function describeScanAccess(access: ScanAccess): string {
  switch (access) {
    case 'full':
      return 'Full scan: looking through your whole device.';
    case 'limited':
      return 'Limited scan: showing downloaded files and folders you have opened. Allow "All files access" to include Downloads and the whole phone.';
    default:
      return 'Storage access was declined. Lirune can still read files you pick with Scan Folder.';
  }
}
