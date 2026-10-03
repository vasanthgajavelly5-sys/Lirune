/**
 * Lirune Reader Mobile — Files Discovery & Storage Import Screen
 * Discovers and imports books stored across device storage and folders.
 * Features:
 * - Scoped-storage compliant SAF folder scanner (recursive)
 * - Known storage & authorized folders scan
 * - Multi-format filters (EPUB, PDF, TXT, HTML, FB2, CBZ)
 * - Duplicate avoidance against existing library
 * - Batch selection and progress reporting
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { ImportService } from '@/services/import/ImportService';
import {
  ZipInspectionService,
  ZipBookEntry,
} from '@/services/import/ZipInspectionService';
import {
  RarInspectionService,
  RarBookEntry,
} from '@/services/import/RarInspectionService';
import { ZipInspectionModal } from '@/components/ZipInspectionModal';
import { getFormatFromExtension, BookFormat } from '@/models/Book';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { LiruneToast } from '@/components/LiruneToast';
import { LiruneDialog } from '@/components/LiruneDialog';
import { logger } from '@/utils/logger';
import { nativeStorage, type DiscoveredNativeFile } from '@/services/storage/NativeStorageBridge';
import {
  describeScanAccess,
  openAllFilesAccessSettings,
  resolveScanAccess,
  type ScanAccess,
} from '@/services/storage/ScanAccess';
import { findDuplicate } from '@/services/import/duplicateCheck';
import { peekMany } from '@/services/discovery/DiscoveryMetadata';

const TAG = 'FilesDiscovery';

/** Upper bound on what one scan returns; a phone can hold hundreds of thousands of files. */
const SCAN_RESULT_CAP = 5000;

/** Extensions the full-storage walk looks for when "Include archives" is on. */
const SCAN_EXTENSIONS = [
  '.epub',
  '.pdf',
  '.txt',
  '.html',
  '.htm',
  '.fb2',
  '.cbz',
  '.mobi',
  '.azw',
  '.azw3',
  '.djvu',
  '.doc',
  '.docx',
  '.rtf',
  '.odt',
  '.chm',
  '.cbr',
  '.zip',
  '.rar',
];

/**
 * Paths owned by this app.
 *
 * Scanning them listed the app's own imported copies under their UUID file names,
 * which is how "Scan Phone" filled up with `0f8a….epub` rows that then imported a
 * second copy of books already in the library.
 */
function isAppOwnedPath(path: string): boolean {
  if (!path) return false;
  const documents = FileSystem.documentDirectory;
  const cache = FileSystem.cacheDirectory;
  if (documents && path.startsWith(documents)) return true;
  if (cache && path.startsWith(cache)) return true;
  return false;
}

/** The explanation is shown once per decision, not on every tap. */
function shouldExplainScanAccess(dismissed: boolean): boolean {
  return !dismissed;
}

/**
 * Where the folder picker should open.
 *
 * Books almost always land in Download, and the picker defaults to the last used
 * location; hinting at Download saves most users a level of navigation. Android
 * 11+ still refuses to hand out Download itself, which the hint tells them.
 */
const DOWNLOAD_TREE_HINT = 'content://com.android.externalstorage.documents/tree/primary%3ADownload';

interface DiscoveredFile {
  id: string;
  uri: string;
  name: string;
  format: BookFormat;
  size: number;
  folderName: string;
  inLibrary: boolean;
  selected: boolean;
  /** Real publication title once it has been read; undefined until then. */
  title?: string;
  author?: string;
  /** True when `title` came from the book rather than from the file name. */
  titleIsMetadata?: boolean;
  /** Filesystem path, when the native scan produced one (needed for metadata). */
  path?: string;
}

const SUPPORTED_EXTENSIONS = [
  '.epub',
  '.pdf',
  '.txt',
  '.html',
  '.htm',
  '.fb2',
  '.cbz',
  '.mobi',
  '.azw',
  '.azw3',
  '.djvu',
  '.doc',
  '.docx',
  '.rtf',
  '.odt',
  '.chm',
  '.cbr',
  '.zip',
  '.rar',
];

const FORMAT_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Formats' },
  { id: 'epub', label: 'EPUB' },
  { id: 'pdf', label: 'PDF' },
  { id: 'mobi', label: 'Kindle (MOBI/AZW)' },
  { id: 'fb2', label: 'FB2' },
  { id: 'cbz', label: 'Comics (CBZ/CBR)' },
  { id: 'docx', label: 'Word/ODT' },
  { id: 'txt', label: 'TXT' },
  { id: 'html', label: 'HTML' },
  { id: 'djvu', label: 'DjVu' },
  { id: 'archives', label: 'Archives (ZIP/RAR)' },
];

export default function FilesScreen() {
  const router = useRouter();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  const { books, loadLibrary } = useLibraryStore();
  const { openBook } = useReaderStore();
  const {
    authorizedFolderUris,
    setLastAuthorizedFolderUri,
    addAuthorizedFolderUri,
    scanAccessDismissed,
    setScanAccessDismissed,
  } = useSettingsStore();

  const [discoveredFiles, setDiscoveredFiles] = useState<DiscoveredFile[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [hasScanned, setHasScanned] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [scanNotice, setScanNotice] = useState<string>('');
  const [includeArchives, setIncludeArchives] = useState(false);
  const [pendingScanAccessPrompt, setPendingScanAccessPrompt] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    total: number;
    current: number;
    currentFile: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Archive Container Inspection State (ZIP & RAR)
  const [zipModalVisible, setZipModalVisible] = useState(false);
  const [zipName, setZipName] = useState('');
  const [isRarArchive, setIsRarArchive] = useState(false);
  const [zipEntries, setZipEntries] = useState<ZipBookEntry[]>([]);
  const [inspectingZipUri, setInspectingZipUri] = useState<string | null>(null);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipExtractProgress, setZipExtractProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);

  // Check whether a discovered file is already in the library. Uses the same rule
  // as the import path (same format, same size, and the same file name or the
  // same title+author) so a row never disagrees with what import would decide.
  const isFileInLibrary = useCallback(
    (fileName: string, format: BookFormat, size?: number) => {
      return books.some(
        (b) =>
          b.format === format &&
          (b.filePath?.toLowerCase().endsWith(fileName.toLowerCase()) ||
            b.uri.toLowerCase().endsWith(fileName.toLowerCase()) ||
            findDuplicate({ format, fileName, size, title: fileName }, [b]) !== undefined)
      );
    },
    [books]
  );

  // Re-evaluate inLibrary status when library books change
  useEffect(() => {
    setDiscoveredFiles((prev) =>
      prev.map((f) => ({
        ...f,
        inLibrary: isFileInLibrary(f.name, f.format, f.size),
      }))
    );
  }, [books, isFileInLibrary]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  /**
   * Helper to scan a standard local or SAF directory recursively
   */
  const scanDirectoryRecursive = async (
    dirUri: string,
    folderName: string,
    depth = 0,
    maxDepth = 5
  ): Promise<DiscoveredFile[]> => {
    if (depth > maxDepth) return [];
    const results: DiscoveredFile[] = [];

    try {
      const { StorageAccessFramework } = FileSystem;

      if (dirUri.startsWith('content://')) {
        // Scoped Storage SAF Directory
        const childUris = await StorageAccessFramework.readDirectoryAsync(dirUri);
        for (const childUri of childUris) {
          try {
            const rawSegment = childUri.split('%2F').pop() || childUri.split('/').pop() || '';
            const decodedName = decodeURIComponent(rawSegment);
            const lowerName = decodedName.toLowerCase();

            const isSupported = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
            if (isSupported) {
              const formatInfo = getFormatFromExtension(decodedName);
              if (formatInfo.supported) {
                let size = 0;
                try {
                  const info = await FileSystem.getInfoAsync(childUri);
                  size = info.exists && !info.isDirectory ? info.size || 0 : 0;
                } catch {
                  // Size optional for SAF URIs before copy
                }
                results.push({
                  id: childUri,
                  uri: childUri,
                  name: decodedName,
                  format: formatInfo.id as BookFormat,
                  size,
                  folderName,
                  inLibrary: isFileInLibrary(decodedName, formatInfo.id as BookFormat),
                  selected: !isFileInLibrary(decodedName, formatInfo.id as BookFormat),
                });
              }
            } else if (
              depth < maxDepth &&
              !/\.(json|xml|png|jpg|jpeg|gif|webp|mp3|mp4|zip|rar|7z|apk|exe|log|md)$/i.test(lowerName)
            ) {
              // Check if it's a subdirectory by attempting recursive scan
              try {
                const subResults = await scanDirectoryRecursive(
                  childUri,
                  decodedName || folderName,
                  depth + 1,
                  maxDepth
                );
                results.push(...subResults);
              } catch {
                // Ignore non-directory or inaccessible child
              }
            }
          } catch (itemErr) {
            logger.warn(TAG, `Error inspecting SAF item: ${childUri}`, itemErr);
          }
        }
      } else {
        // Standard file:// or app sandbox directory
        const entries = await FileSystem.readDirectoryAsync(dirUri);
        for (const entry of entries) {
          const entryUri = `${dirUri}${entry.endsWith('/') ? '' : '/'}${entry}`;
          const lowerName = entry.toLowerCase();
          const isSupported = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

          if (isSupported) {
            const formatInfo = getFormatFromExtension(entry);
            if (formatInfo.supported) {
              const info = await FileSystem.getInfoAsync(entryUri);
              results.push({
                id: entryUri,
                uri: entryUri,
                name: entry,
                format: formatInfo.id as BookFormat,
                size: info.exists && !info.isDirectory ? info.size || 0 : 0,
                folderName,
                inLibrary: isFileInLibrary(entry, formatInfo.id as BookFormat),
                selected: !isFileInLibrary(entry, formatInfo.id as BookFormat),
              });
            }
          } else {
            try {
              const info = await FileSystem.getInfoAsync(entryUri);
              if (info.exists && info.isDirectory) {
                const subResults = await scanDirectoryRecursive(
                  `${entryUri}/`,
                  entry,
                  depth + 1,
                  maxDepth
                );
                results.push(...subResults);
              }
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch (err) {
      logger.warn(TAG, `Could not read directory ${dirUri}`, err);
    }

    return results;
  };

  /**
   * Action 1: Scan Phone.
   *
   * Three sources, in order of coverage:
   *   1. All files access -> a native walk of every volume (the only way to see
   *      an EPUB or PDF in Download or at the storage root, because MediaStore
   *      does not index them and SAF will not hand out those locations);
   *   2. MediaStore, which needs no permission at all;
   *   3. the folders the user has explicitly authorised.
   *
   * The app's own `books/` directory is never scanned: it holds the copies Lirune
   * already imported under UUID names, which is why the list used to fill up with
   * `0f8a….epub` rows.
   */
  const handleScanPhone = async () => {
    setIsScanning(true);
    setScanStatus('Checking storage access…');

    try {
      setHasScanned(true);
      const allFound: DiscoveredFile[] = [];
      const seenIds = new Set(discoveredFiles.map((f) => f.id));

      if (!nativeStorage.isAvailable()) {
        setScanNotice(
          'LiruneStorage is missing from this build, so device scanning is unavailable. Re-run "npx expo prebuild" and rebuild. Use Scan Folder in the meantime.'
        );
      }

      let access: ScanAccess = 'limited';
      if (nativeStorage.isAvailable()) {
        access = await resolveScanAccess();

        if (access === 'limited' && shouldExplainScanAccess(scanAccessDismissed)) {
          setPendingScanAccessPrompt(true);
          setIsScanning(false);
          setScanStatus('');
          return;
        }

        if (access === 'full') {
          setScanStatus('Scanning your device…');
          const stopProgress = nativeStorage.onScanProgress((progress) => {
            setScanStatus(`Scanning… ${progress.found} books found`);
          });
          try {
            const fullFiles = await nativeStorage.scanAllStorage(
              includeArchives ? { extensions: SCAN_EXTENSIONS } : {}
            );
            for (const nf of fullFiles) {
              if (seenIds.has(nf.id) || isAppOwnedPath(nf.path || nf.uri)) continue;
              seenIds.add(nf.id);
              const formatInfo = getFormatFromExtension(nf.name);
              if (!formatInfo.supported) continue;
              const format = formatInfo.id as BookFormat;
              allFound.push({
                id: nf.id,
                uri: nf.uri,
                path: nf.path,
                name: nf.name,
                format,
                size: nf.size,
                folderName: nf.folderName || 'Device Storage',
                inLibrary: isFileInLibrary(nf.name, format, nf.size),
                selected: !isFileInLibrary(nf.name, format, nf.size),
              });
            }
            logger.info(TAG, `Full storage scan found ${fullFiles.length} files`);
          } catch (fullErr) {
            logger.warn(TAG, 'Full storage scan failed', fullErr);
          } finally {
            stopProgress();
          }
        }
      }

      // MediaStore always runs: it covers the case where all-files access is
      // partial and costs nothing without it.
      if (nativeStorage.isAvailable()) {
        setScanStatus('Querying MediaStore…');
        try {
          const nativeFiles: DiscoveredNativeFile[] = await nativeStorage.scanMediaStore();
          for (const nf of nativeFiles) {
            if (seenIds.has(nf.id) || isAppOwnedPath(nf.path || nf.uri)) continue;
            if (!nf.format) continue;
            seenIds.add(nf.id);
            allFound.push({
              id: nf.id,
              uri: nf.uri,
              name: nf.name,
              format: nf.format,
              size: nf.size,
              folderName: nf.folderName || 'Device Storage',
              inLibrary: isFileInLibrary(nf.name, nf.format, nf.size),
              selected: !isFileInLibrary(nf.name, nf.format, nf.size),
            });
          }
          logger.info(TAG, `MediaStore scan found ${nativeFiles.length} files`);
        } catch (msErr) {
          logger.warn(TAG, 'MediaStore scan failed', msErr);
        }
      }

      // Folders the user authorised with Scan Folder.
      for (const folderUri of authorizedFolderUris) {
        try {
          const folderName = decodeURIComponent(folderUri.split('%3A').pop() || 'Authorized Folder');
          setScanStatus(`Scanning ${folderName}…`);
          if (nativeStorage.isAvailable() && folderUri.startsWith('content://')) {
            const nativeSafFiles = await nativeStorage.scanSafTree(folderUri, 5);
            for (const nf of nativeSafFiles) {
              if (seenIds.has(nf.id) || !nf.format) continue;
              seenIds.add(nf.id);
              allFound.push({
                id: nf.id,
                uri: nf.uri,
                name: nf.name,
                format: nf.format,
                size: nf.size,
                folderName: nf.folderName || folderName,
                inLibrary: isFileInLibrary(nf.name, nf.format, nf.size),
                selected: !isFileInLibrary(nf.name, nf.format, nf.size),
              });
            }
          } else {
            const authResults = await scanDirectoryRecursive(folderUri, folderName, 0, 4);
            for (const f of authResults) {
              if (seenIds.has(f.id)) continue;
              seenIds.add(f.id);
              allFound.push(f);
            }
          }
        } catch (authErr) {
          logger.warn(TAG, `Error scanning authorized folder ${folderUri}`, authErr);
        }
      }

      setDiscoveredFiles((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = allFound.filter((f) => !existingIds.has(f.id));
        return [...prev, ...newItems];
      });

      const limited = access !== 'full';
      setScanNotice(limited ? describeScanAccess(access) : '');
      const capNote = allFound.length >= SCAN_RESULT_CAP ? ' (first 5000 shown)' : '';
      setToastMessage(
        allFound.length > 0
          ? `Discovered ${allFound.length} document${allFound.length === 1 ? '' : 's'}${capNote}`
          : 'Scan complete: no supported books found. Use "Scan Folder" to pick a specific folder, or place books in your Downloads folder.'
      );
    } catch (err) {
      logger.error(TAG, 'Error during phone scan', err);
      setToastMessage('Failed to scan device storage.');
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  const handleCancelScan = useCallback(() => {
    void nativeStorage.cancelScan();
    setScanNotice('Scan cancelled.');
  }, []);

  /** Called from the All files access dialog. */
  const handleScanAccessResponse = useCallback(
    async (allow: boolean) => {
      setPendingScanAccessPrompt(false);
      if (allow) {
        setScanAccessDismissed(false);
        const access = await openAllFilesAccessSettings();
        setScanNotice(access === 'full' ? '' : describeScanAccess(access));
        void handleScanPhone();
      } else {
        setScanAccessDismissed(true);
        setScanNotice(describeScanAccess('limited'));
      }
    },
    [handleScanPhone, scanAccessDismissed]
  );

  /**
   * Action 2: Scan Folder via SAF folder authorization (Download, nested folders, SD cards)
   * Uses the native scanSafTree() for content:// URIs for full recursive DocumentsContract traversal.
   */
  const handleScanFolder = async () => {
    setIsScanning(true);
    setScanStatus('Requesting folder access...');

    try {
      const { StorageAccessFramework } = FileSystem;
      if (!StorageAccessFramework?.requestDirectoryPermissionsAsync) {
        setToastMessage('Storage Access Framework is not available on this device.');
        return;
      }

      // Open on Download: it is where books actually live. Some OEM pickers
      // ignore the hint, which is harmless.
      let permissions;
      try {
        permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(DOWNLOAD_TREE_HINT);
      } catch (hintErr) {
        logger.warn(TAG, 'Folder picker rejected the Download hint', hintErr);
        permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      }
      if (!permissions.granted) {
        setToastMessage('Folder access was not granted. Please try again and select a folder (e.g. Download, Documents, or a subfolder).');
        return;
      }

      setHasScanned(true);
      const targetUri = permissions.directoryUri;
      // Remember every authorised folder, not just the newest: a user with a
      // library in two places expects one Scan Phone to cover both.
      await addAuthorizedFolderUri(targetUri);

      const folderName = decodeURIComponent(
        targetUri.split('%3A').pop()?.split('%2F').join('/') || 'Storage Folder'
      );
      setScanStatus(`Scanning ${folderName}...`);

      let files: DiscoveredFile[] = [];

      // Use native SAF tree scanner if available — it uses DocumentsContract and handles
      // all MIME types/directory flags correctly without JS guessing
      if (nativeStorage.isAvailable() && targetUri.startsWith('content://')) {
        try {
          const nativeFiles = await nativeStorage.scanSafTree(targetUri, 6);
          files = nativeFiles
            .filter((nf) => nf.format)
            .map((nf) => {
              const format = nf.format as BookFormat;
              return {
                id: nf.id,
                uri: nf.uri,
                name: nf.name,
                format,
                size: nf.size,
                folderName: nf.folderName || folderName,
                inLibrary: isFileInLibrary(nf.name, format, nf.size),
                selected: !isFileInLibrary(nf.name, format, nf.size),
              };
            });
          logger.info(TAG, `Native SAF scan found ${files.length} files in ${folderName}`);
        } catch (nativeErr) {
          logger.warn(TAG, 'Native SAF scan failed, falling back to JS traversal', nativeErr);
          files = await scanDirectoryRecursive(targetUri, folderName, 0, 5);
        }
      } else {
        files = await scanDirectoryRecursive(targetUri, folderName, 0, 5);
      }

      setDiscoveredFiles((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = files.filter((f) => !existingIds.has(f.id));
        return [...prev, ...newItems];
      });

      setToastMessage(
        `Discovered ${files.length} book${files.length === 1 ? '' : 's'} in ${folderName}`
      );
    } catch (err) {
      logger.error(TAG, 'Error during folder scan', err);
      setToastMessage('Unable to access selected folder.');
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  /**
   * Inspect a ZIP container and prompt user with its book contents
   */
  const handleInspectZip = async (uri: string, name: string) => {
    setIsScanning(true);
    setScanStatus(`Inspecting ${name}...`);
    try {
      const entries = await ZipInspectionService.inspectZip(uri);
      if (entries.length === 0) {
        setToastMessage(`No supported book files found inside "${name}".`);
        return;
      }
      setZipName(name);
      setIsRarArchive(false);
      setZipEntries(entries);
      setInspectingZipUri(uri);
      setZipModalVisible(true);
    } catch (err: any) {
      logger.error(TAG, 'Failed inspecting ZIP container', err);
      setToastMessage('Could not inspect ZIP archive.');
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  /**
   * Inspect a RAR container and prompt user with its book contents
   */
  const handleInspectRar = async (uri: string, name: string) => {
    setIsScanning(true);
    setScanStatus(`Inspecting ${name}...`);
    try {
      const entries = await RarInspectionService.inspectRar(uri);
      if (entries.length === 0) {
        setToastMessage(`No supported book files found inside "${name}".`);
        return;
      }
      setZipName(name);
      setIsRarArchive(true);
      setZipEntries(entries);
      setInspectingZipUri(uri);
      setZipModalVisible(true);
    } catch (err: any) {
      logger.error(TAG, 'Failed inspecting RAR container', err);
      setToastMessage('Could not inspect RAR archive.');
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  /**
   * Import selected books from an inspected archive container (ZIP or RAR)
   */
  const handleImportArchiveEntries = async (selected: ZipBookEntry[]) => {
    if (!inspectingZipUri || selected.length === 0) return;
    setIsExtractingZip(true);
    setZipExtractProgress({ current: 0, total: selected.length, fileName: '' });

    try {
      let importedBooks: any[] = [];
      if (isRarArchive) {
        importedBooks = await RarInspectionService.importSelectedEntries(
          inspectingZipUri,
          selected as any,
          (current: number, total: number, fileName: string) => {
            setZipExtractProgress({ current, total, fileName });
          }
        );
      } else {
        importedBooks = await ZipInspectionService.importSelectedEntries(
          inspectingZipUri,
          selected,
          (current: number, total: number, fileName: string) => {
            setZipExtractProgress({ current, total, fileName });
          }
        );
      }

      await loadLibrary();
      setZipModalVisible(false);
      setToastMessage(
        `Successfully imported ${importedBooks.length} book${importedBooks.length === 1 ? '' : 's'} from archive.`
      );
    } catch (err: any) {
      logger.error(TAG, 'Failed extracting from archive', err);
      setToastMessage('Failed to import books from archive.');
    } finally {
      setIsExtractingZip(false);
      setZipExtractProgress(null);
      setIsRarArchive(false);
    }
  };

  /**
   * Action: Open a discovered file directly in Lirune's internal reader, or inspect if ZIP/RAR
   */
  const handleOpenFileOrInspect = async (item: DiscoveredFile) => {
    if (item.format === 'zip') {
      await handleInspectZip(item.uri, item.name);
      return;
    }
    if (item.format === 'rar') {
      await handleInspectRar(item.uri, item.name);
      return;
    }

    // 1. If already in library, find book and navigate straight to internal reader
    const cleanItemName = item.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    const existingBook = books.find(
      (b) =>
        b.format === item.format &&
        (b.uri === item.uri ||
          b.title.toLowerCase().trim() === cleanItemName ||
          (b.filePath && b.filePath.toLowerCase().endsWith(item.name.toLowerCase())) ||
          b.uri.toLowerCase().endsWith(item.name.toLowerCase()))
    );

    if (existingBook) {
      await openBook(existingBook);
      router.push({ pathname: '/reader', params: { bookId: existingBook.id } });
      return;
    }

    // 2. If not yet in library, import first then open immediately
    setImportProgress({ total: 1, current: 1, currentFile: item.name });
    try {
      const res = await ImportService.importFile(item.uri, item.name, item.size);
      if (res.success && res.book) {
        setDiscoveredFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, inLibrary: true, selected: false } : f))
        );
        await loadLibrary();
        await openBook(res.book);
        router.push({ pathname: '/reader', params: { bookId: res.book.id } });
      } else {
        const errorMsg = res.error
          ? typeof res.error === 'string'
            ? res.error
            : (res.error as any).message || 'Failed to import book'
          : 'Failed to import book';
        setToastMessage(errorMsg);
      }
    } catch (err: any) {
      logger.error(TAG, 'Failed opening discovered file', err);
      setToastMessage('Could not import and open file.');
    } finally {
      setImportProgress(null);
    }
  };

  /**
   * Action 3: Scan File (pick individual or multiple files directly)
   */
  const handlePickFiles = async () => {
    if (ImportService.isBusy()) {
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
        base64: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setHasScanned(true);

      // If single file and it's an archive, directly open inspection modal
      if (result.assets.length === 1) {
        const single = result.assets[0];
        if (single.name.toLowerCase().endsWith('.zip')) {
          await handleInspectZip(single.uri, single.name);
          return;
        }
        if (single.name.toLowerCase().endsWith('.rar')) {
          await handleInspectRar(single.uri, single.name);
          return;
        }
      }

      const newDiscovered: DiscoveredFile[] = [];
      for (const asset of result.assets) {
        const lowerName = asset.name.toLowerCase();
        if (lowerName.endsWith('.zip')) {
          newDiscovered.push({
            id: asset.uri,
            uri: asset.uri,
            name: asset.name,
            format: 'zip',
            size: asset.size || 0,
            folderName: 'Picked Archives',
            inLibrary: false,
            selected: false,
          });
          continue;
        }
        if (lowerName.endsWith('.rar')) {
          newDiscovered.push({
            id: asset.uri,
            uri: asset.uri,
            name: asset.name,
            format: 'rar',
            size: asset.size || 0,
            folderName: 'Picked Archives',
            inLibrary: false,
            selected: false,
          });
          continue;
        }

        const formatInfo = getFormatFromExtension(asset.name);
        if (formatInfo.supported) {
          const inLib = isFileInLibrary(asset.name, formatInfo.id as BookFormat);
          newDiscovered.push({
            id: asset.uri,
            uri: asset.uri,
            name: asset.name,
            format: formatInfo.id as BookFormat,
            size: asset.size || 0,
            folderName: 'Selected Files',
            inLibrary: inLib,
            selected: !inLib,
          });
        }
      }

      setDiscoveredFiles((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const nonDupes = newDiscovered.filter((f) => !existingIds.has(f.id));
        return [...nonDupes, ...prev];
      });

      setToastMessage(`Added ${newDiscovered.length} file(s) to discovery list`);
    } catch (err: any) {
      if (err?.message?.includes('Different document picking in progress')) {
        logger.warn(TAG, 'Picker call ignored due to concurrent picking');
        return;
      }
      logger.error(TAG, 'File picker failed', err);
      setToastMessage('Could not open file picker.');
    }
  };

  /**
   * Toggle item selection
   */
  const toggleSelectFile = (id: string) => {
    setDiscoveredFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  /**
   * Select or Deselect all new files
   */
  const handleToggleSelectAll = () => {
    const allSelected = displayedFiles
      .filter((f) => !f.inLibrary)
      .every((f) => f.selected);

    setDiscoveredFiles((prev) =>
      prev.map((f) => {
        if (f.inLibrary) return f;
        return { ...f, selected: !allSelected };
      })
    );
  };

  /**
   * Import all selected files
   */
  const handleImportSelected = async () => {
    const toImport = discoveredFiles.filter((f) => f.selected && !f.inLibrary);
    if (toImport.length === 0) {
      setToastMessage('No new files selected for import.');
      return;
    }

    setImportProgress({ total: toImport.length, current: 0, currentFile: '' });
    let successCount = 0;

    for (let i = 0; i < toImport.length; i++) {
      const file = toImport[i];
      setImportProgress({
        total: toImport.length,
        current: i + 1,
        currentFile: file.name,
      });

      try {
        const res = await ImportService.importFile(file.uri, file.name, file.size);
        if (res.success) {
          successCount++;
          // Mark as in library in state
          setDiscoveredFiles((prev) =>
            prev.map((f) => (f.id === file.id ? { ...f, inLibrary: true, selected: false } : f))
          );
        }
      } catch (importErr) {
        logger.error(TAG, `Failed importing ${file.name}`, importErr);
      }
    }

    await loadLibrary();
    setImportProgress(null);
    setToastMessage(`Successfully imported ${successCount} book${successCount === 1 ? '' : 's'}.`);
  };

  // Filtered displayed files
  const q = searchFilter.toLowerCase().trim();
  const displayedFiles = discoveredFiles.filter((f) => {
    if (selectedFormat !== 'all') {
      if (selectedFormat === 'mobi' && !['mobi', 'azw', 'azw3'].includes(f.format)) return false;
      else if (selectedFormat === 'cbz' && !['cbz', 'cbr'].includes(f.format)) return false;
      else if (selectedFormat === 'docx' && !['docx', 'doc', 'odt', 'rtf'].includes(f.format)) return false;
      else if (selectedFormat === 'archives' && !['zip', 'rar'].includes(f.format)) return false;
      else if (!['mobi', 'cbz', 'docx', 'archives'].includes(selectedFormat) && f.format !== selectedFormat) return false;
    }
    if (
      q &&
      !f.name.toLowerCase().includes(q) &&
      !f.folderName.toLowerCase().includes(q) &&
      !f.format.toLowerCase().includes(q) &&
      // A search for an author should find their books even when every file is
      // named after a download artefact.
      !(f.title || '').toLowerCase().includes(q) &&
      !(f.author || '').toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  /**
   * Fills in real titles and authors for the rows the user can actually see.
   *
   * Only EPUB on a local path can be inspected cheaply; everything else keeps its
   * cleaned file name, which is what `DiscoveryMetadata` decides.
   */
  const handleViewableFilesChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: DiscoveredFile }> }) => {
      const targets = viewableItems
        .map(({ item }) => item)
        .filter((item) => !item.title && !item.author && item.format !== 'zip' && item.format !== 'rar');
      if (targets.length === 0) return;
      void peekMany(targets, (target, info) => {
        setDiscoveredFiles((prev) =>
          prev.map((file) =>
            file.id === target.id
              ? { ...file, title: info.title, author: info.author, titleIsMetadata: info.fromMetadata }
              : file
          )
        );
      });
    },
    []
  );

  const selectedCount = discoveredFiles.filter((f) => f.selected && !f.inLibrary).length;
  const newCount = discoveredFiles.filter((f) => !f.inLibrary).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Top Header with Side Nav Button */}
      <View style={[styles.topHeader, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerLeft}>
          <LiruneNavButton />
          <View>
            <Text style={[styles.screenTitle, { color: colors.text }]}>Files</Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              Storage Discovery &amp; Import
            </Text>
          </View>
        </View>
        <Text style={[styles.bookCountBadge, { color: colors.textSecondary }]}>
          {hasScanned ? `${discoveredFiles.length} found` : 'Not scanned yet'}
        </Text>
      </View>

      {/* Primary Actions: Scan Phone, Scan Folder, Scan File */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.accent }]}
          onPress={handleScanPhone}
          disabled={isScanning || !!importProgress}
          activeOpacity={0.8}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color={colors.accentForeground} style={{ marginRight: 6 }} />
          ) : (
            <Ionicons name="phone-portrait-outline" size={17} color={colors.accentForeground} style={{ marginRight: 6 }} />
          )}
          <Text style={[styles.actionBtnText, { color: colors.accentForeground }]}>
            Scan Phone
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionBtn,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1 },
          ]}
          onPress={handleScanFolder}
          disabled={isScanning || !!importProgress}
          activeOpacity={0.7}
        >
          <Ionicons name="folder-open-outline" size={17} color={colors.text} style={{ marginRight: 6 }} />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Scan Folder</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionBtn,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1 },
          ]}
          onPress={handlePickFiles}
          disabled={isScanning || !!importProgress}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={17} color={colors.text} style={{ marginRight: 6 }} />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Scan File</Text>
        </TouchableOpacity>

        {/* A long full-storage walk needs an escape hatch. */}
        {isScanning && (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1 },
            ]}
            onPress={handleCancelScan}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle-outline" size={17} color={colors.text} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>Cancel scan</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Archives outnumber books on a typical phone, so they are opt-in. */}
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setIncludeArchives((value) => !value)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={includeArchives ? 'checkbox' : 'square-outline'}
          size={18}
          color={colors.accent}
          style={{ marginRight: 8 }}
        />
        <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>
          Include ZIP and RAR archives in Scan Phone
        </Text>
      </TouchableOpacity>

      {/* Why the result list is shorter than the phone, or longer. */}
      {scanNotice.length > 0 && (
        <View style={[styles.guidanceBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={[styles.guidanceText, { color: colors.textSecondary }]}>{scanNotice}</Text>
        </View>
      )}

      {/* Storage Guidance Note */}
      <View style={[styles.guidanceBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.accent} style={{ marginRight: 8, marginTop: 1 }} />
        <Text style={[styles.guidanceText, { color: colors.textSecondary }]}>
          Android Storage: &ldquo;Scan Phone&rdquo; walks the whole device when you allow &ldquo;All files access&rdquo;, and otherwise falls back to downloaded files and the folders you have opened. Android blocks picking the storage root or the whole Download folder, so use Scan Phone for those. &ldquo;Scan File&rdquo; picks any single file.
        </Text>
      </View>

      {/* Search Filter Input */}
      <View style={styles.searchBoxContainer}>
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="search" size={17} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Filter discovered files by name or folder..."
            placeholderTextColor={colors.textMuted}
            value={searchFilter}
            onChangeText={setSearchFilter}
            autoCapitalize="none"
          />
          {searchFilter.length > 0 && (
            <TouchableOpacity onPress={() => setSearchFilter('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Format Filter Chips */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FORMAT_FILTERS.map((fmt) => {
            const isSelected = selectedFormat === fmt.id;
            return (
              <TouchableOpacity
                key={fmt.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? colors.accent : colors.surfaceElevated,
                    borderColor: isSelected ? colors.accent : colors.borderSubtle,
                  },
                ]}
                onPress={() => setSelectedFormat(fmt.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? colors.accentForeground : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {fmt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Scan Status Banner */}
      {isScanning && (
        <View style={[styles.statusBanner, { backgroundColor: colors.surfaceElevated }]}>
          <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 10 }} />
          <Text style={[styles.statusBannerText, { color: colors.text }]}>{scanStatus}</Text>
        </View>
      )}

      {/* Import Progress Banner */}
      {importProgress && (
        <View style={[styles.importProgressBanner, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.importProgressTitle, { color: colors.accent }]}>
              Importing ({importProgress.current} of {importProgress.total})
            </Text>
            <Text style={[styles.importProgressSub, { color: colors.text }]} numberOfLines={1}>
              {importProgress.currentFile}
            </Text>
          </View>
        </View>
      )}

      {/* List Header & Batch Actions */}
      {discoveredFiles.length > 0 && (
        <View style={[styles.batchHeader, { borderBottomColor: colors.borderSubtle }]}>
          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={handleToggleSelectAll}
            disabled={newCount === 0 || !!importProgress}
          >
            <Ionicons
              name={
                newCount > 0 &&
                displayedFiles.filter((f) => !f.inLibrary).every((f) => f.selected)
                  ? 'checkbox'
                  : 'square-outline'
              }
              size={18}
              color={colors.accent}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.batchHeaderText, { color: colors.text }]}>
              Select All New ({newCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.importBtn,
              {
                backgroundColor: selectedCount > 0 ? colors.accent : colors.surfaceElevated,
                opacity: selectedCount > 0 && !importProgress ? 1 : 0.6,
              },
            ]}
            onPress={handleImportSelected}
            disabled={selectedCount === 0 || !!importProgress}
          >
            <Text
              style={[
                styles.importBtnText,
                { color: selectedCount > 0 ? colors.accentForeground : colors.textMuted },
              ]}
            >
              Import Selected ({selectedCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Discovered Files List */}
      <FlatList
        data={displayedFiles}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={handleViewableFilesChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 80 }}
        contentContainerStyle={[
          styles.listContent,
          displayedFiles.length === 0 && styles.listContentEmpty,
        ]}
        renderItem={({ item }) => {
          return (
            <TouchableOpacity
              style={[
                styles.fileCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: item.selected ? colors.accent : colors.borderSubtle,
                  borderWidth: item.selected ? 1.5 : 1,
                },
              ]}
              onPress={() => handleOpenFileOrInspect(item)}
              activeOpacity={0.7}
            >
              <View style={styles.fileCardLeft}>
                {item.format === 'zip' || item.format === 'rar' ? (
                  <View style={[styles.checkIcon, { padding: 2 }]}>
                    <Ionicons name="archive-outline" size={20} color={colors.accent} />
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (!item.inLibrary) toggleSelectFile(item.id);
                    }}
                    style={styles.checkIcon}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {item.inLibrary ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    ) : (
                      <Ionicons
                        name={item.selected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={item.selected ? colors.accent : colors.textMuted}
                      />
                    )}
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }}>
                  {/* Real publication title first; the file name is the fallback
                      and the smaller line once the book has answered. */}
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>
                    {item.title || item.name}
                  </Text>
                  {item.titleIsMetadata && (
                    <Text style={[styles.fileAuthorText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.author || item.name}
                    </Text>
                  )}
                  <View style={styles.fileMetaRow}>
                    <View style={[styles.formatTag, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.formatTagText, { color: colors.accent }]}>
                        {item.format.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.fileSizeText, { color: colors.textMuted }]}>
                      {formatBytes(item.size)}
                    </Text>
                    {item.titleIsMetadata && (
                      <Text style={[styles.folderNameText, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    )}
                    <Text style={[styles.folderNameText, { color: colors.textSecondary }]} numberOfLines={1}>
                      📁 {item.folderName}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.fileCardRight}>
                {item.format === 'zip' || item.format === 'rar' ? (
                  <TouchableOpacity
                    style={[styles.singleImportBtn, { backgroundColor: colors.accentSoft }]}
                    onPress={() => (item.format === 'rar' ? handleInspectRar(item.uri, item.name) : handleInspectZip(item.uri, item.name))}
                  >
                    <Ionicons name="eye-outline" size={16} color={colors.accent} />
                    <Text style={[styles.singleImportBtnText, { color: colors.accent }]}>Inspect</Text>
                  </TouchableOpacity>
                ) : item.inLibrary ? (
                  <TouchableOpacity
                    style={[styles.singleImportBtn, { backgroundColor: 'rgba(78, 205, 196, 0.15)' }]}
                    onPress={() => handleOpenFileOrInspect(item)}
                  >
                    <Ionicons name="book-outline" size={15} color={colors.success} />
                    <Text style={[styles.singleImportBtnText, { color: colors.success }]}>Open</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.singleImportBtn, { backgroundColor: colors.surfaceElevated }]}
                    onPress={async () => {
                      setImportProgress({ total: 1, current: 1, currentFile: item.name });
                      try {
                        const res = await ImportService.importFile(item.uri, item.name, item.size);
                        if (res.success) {
                          setDiscoveredFiles((prev) =>
                            prev.map((f) => (f.id === item.id ? { ...f, inLibrary: true, selected: false } : f))
                          );
                          await loadLibrary();
                          setToastMessage(`"${item.name}" imported to library.`);
                        }
                      } finally {
                        setImportProgress(null);
                      }
                    }}
                  >
                    <Ionicons name="add" size={16} color={colors.accent} />
                    <Text style={[styles.singleImportBtnText, { color: colors.accent }]}>Import</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !isScanning ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconOrb, { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons
                  name={hasScanned ? 'search-outline' : 'folder-open-outline'}
                  size={36}
                  color={colors.accent}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {hasScanned ? 'No books found' : 'Not scanned yet'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {hasScanned
                  ? 'No supported documents were found matching your current filter. Try scanning another folder or phone storage.'
                  : 'Select Scan Phone, Scan Folder, or Scan File to discover books and documents on your device.'}
              </Text>
            </View>
          ) : null
        }
      />

      {/* ZIP/RAR Container Inspection Modal */}
      <ZipInspectionModal
        visible={zipModalVisible}
        zipName={zipName}
        entries={zipEntries}
        isExtracting={isExtractingZip}
        extractProgress={zipExtractProgress}
        onClose={() => setZipModalVisible(false)}
        onImportSelected={handleImportArchiveEntries}
      />

      {/* Lirune Toast */}
      {toastMessage && (
        <LiruneToast
          visible={!!toastMessage}
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {/* All files access is a scary permission to hand out without an
          explanation; nothing is ever uploaded, only read. */}
      <LiruneDialog
        visible={pendingScanAccessPrompt}
        title={'Allow "All files access"?'}
        message={
          'Lirune needs "All files access" to find books in your Downloads folder and at the root of your storage — Android hides EPUBs and PDFs from everything else. ' +
          'Lirune only reads file names and paths that are already on this device. Nothing is uploaded and nothing is changed.\n\n' +
          'You can skip this: scanning will still show downloaded files and the folders you have opened.'
        }
        icon="folder-open-outline"
        actions={[
          {
            label: 'Allow in Settings',
            onPress: () => {
              void handleScanAccessResponse(true);
            },
            variant: 'primary',
          },
          {
            label: 'Not now',
            onPress: () => {
              void handleScanAccessResponse(false);
            },
            variant: 'secondary',
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  bookCountBadge: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    minHeight: 48,
    elevation: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  primaryActionBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    minHeight: 48,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 48,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
  guidanceText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  searchBoxContainer: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 13,
    height: '100%',
    padding: 0,
  },
  clearBtn: {
    padding: 4,
  },
  filterRow: {
    marginTop: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  importProgressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  importProgressTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  importProgressSub: {
    fontSize: 11,
    marginTop: 1,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batchHeaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  importBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  importBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 8,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
  },
  fileCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  checkIcon: {
    marginRight: 10,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  fileAuthorText: {
    fontSize: 12.5,
    lineHeight: 16,
    marginTop: 1,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  formatTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  formatTagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  fileSizeText: {
    fontSize: 11,
  },
  folderNameText: {
    fontSize: 11,
    maxWidth: 120,
  },
  fileCardRight: {
    alignItems: 'flex-end',
  },
  inLibraryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inLibraryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  singleImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  singleImportBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyIconOrb: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
