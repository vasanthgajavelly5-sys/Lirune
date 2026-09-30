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

import React, { useState, useEffect, useCallback } from 'react';
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
import { ZipInspectionModal } from '@/components/ZipInspectionModal';
import { getFormatFromExtension, BookFormat } from '@/models/Book';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { LiruneToast } from '@/components/LiruneToast';
import { logger } from '@/utils/logger';

const TAG = 'FilesDiscovery';

interface DiscoveredFile {
  id: string;
  uri: string;
  name: string;
  format: BookFormat;
  size: number;
  folderName: string;
  inLibrary: boolean;
  selected: boolean;
}

const SUPPORTED_EXTENSIONS = ['.epub', '.pdf', '.txt', '.html', '.htm', '.fb2', '.cbz', '.zip'];

const FORMAT_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Formats' },
  { id: 'epub', label: 'EPUB' },
  { id: 'pdf', label: 'PDF' },
  { id: 'txt', label: 'TXT' },
  { id: 'html', label: 'HTML' },
  { id: 'fb2', label: 'FB2' },
  { id: 'cbz', label: 'CBZ' },
  { id: 'zip', label: 'ZIP' },
];

export default function FilesScreen() {
  const router = useRouter();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  const { books, loadLibrary } = useLibraryStore();
  const { openBook } = useReaderStore();
  const { lastAuthorizedFolderUri, setLastAuthorizedFolderUri } = useSettingsStore();

  const [discoveredFiles, setDiscoveredFiles] = useState<DiscoveredFile[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [importProgress, setImportProgress] = useState<{
    total: number;
    current: number;
    currentFile: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ZIP Container Inspection State
  const [zipModalVisible, setZipModalVisible] = useState(false);
  const [zipName, setZipName] = useState('');
  const [zipEntries, setZipEntries] = useState<ZipBookEntry[]>([]);
  const [inspectingZipUri, setInspectingZipUri] = useState<string | null>(null);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipExtractProgress, setZipExtractProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);

  // Check if a file is already in library by clean title and format
  const isFileInLibrary = useCallback(
    (fileName: string, format: BookFormat) => {
      const cleanName = fileName.replace(/\.[^/.]+$/, '').toLowerCase().trim();
      return books.some(
        (b) =>
          b.format === format &&
          (b.title.toLowerCase().trim() === cleanName ||
            b.filePath.toLowerCase().endsWith(fileName.toLowerCase()))
      );
    },
    [books]
  );

  // Re-evaluate inLibrary status when library books change
  useEffect(() => {
    setDiscoveredFiles((prev) =>
      prev.map((f) => ({
        ...f,
        inLibrary: isFileInLibrary(f.name, f.format),
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
   * Action 1: Scan Device Storage via SAF folder authorization
   */
  const handleScanStorageFolder = async () => {
    setIsScanning(true);
    setScanStatus('Requesting storage folder access...');

    try {
      const { StorageAccessFramework } = FileSystem;
      let targetUri = lastAuthorizedFolderUri;

      // If we don't have an authorized folder or user wants to pick a new one
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        setToastMessage('Folder access was not granted.');
        setIsScanning(false);
        setScanStatus('');
        return;
      }

      targetUri = permissions.directoryUri;
      await setLastAuthorizedFolderUri(targetUri);

      setScanStatus('Scanning folder and subfolders recursively...');
      const folderName = decodeURIComponent(targetUri.split('%3A').pop() || 'Storage Folder');
      const files = await scanDirectoryRecursive(targetUri, folderName);

      // Merge results avoiding duplicate file IDs
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
      setToastMessage('Failed to scan selected folder.');
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
   * Import selected books from an inspected ZIP container
   */
  const handleImportZipEntries = async (selected: ZipBookEntry[]) => {
    if (!inspectingZipUri || selected.length === 0) return;
    setIsExtractingZip(true);
    setZipExtractProgress({ current: 0, total: selected.length, fileName: '' });

    try {
      const importedBooks = await ZipInspectionService.importSelectedEntries(
        inspectingZipUri,
        selected,
        (current: number, total: number, fileName: string) => {
          setZipExtractProgress({ current, total, fileName });
        }
      );

      await loadLibrary();
      setZipModalVisible(false);
      setToastMessage(
        `Successfully imported ${importedBooks.length} book${importedBooks.length === 1 ? '' : 's'} from ZIP.`
      );
    } catch (err: any) {
      logger.error(TAG, 'Failed extracting from ZIP', err);
      setToastMessage('Failed to import books from ZIP archive.');
    } finally {
      setIsExtractingZip(false);
      setZipExtractProgress(null);
    }
  };

  /**
   * Action: Open a discovered file directly in Lirune's internal reader, or inspect if ZIP
   */
  const handleOpenFileOrInspect = async (item: DiscoveredFile) => {
    if (item.format === 'zip') {
      await handleInspectZip(item.uri, item.name);
      return;
    }

    // 1. If already in library, find book and navigate straight to internal reader
    const cleanItemName = item.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
    const existingBook = books.find(
      (b) =>
        b.format === item.format &&
        (b.title.toLowerCase().trim() === cleanItemName ||
          b.filePath.toLowerCase().endsWith(item.name.toLowerCase()))
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
   * Action 2: Pick individual or multiple files directly
   */
  const handlePickFiles = async () => {
    if (ImportService.isBusy()) {
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/epub+zip',
          'application/pdf',
          'text/plain',
          'text/html',
          'application/x-fictionbook+xml',
          'application/vnd.comicbook+zip',
          'application/zip',
          '*/*',
        ],
        multiple: true,
        copyToCacheDirectory: true,
        base64: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      // If single file and it's a ZIP, directly open ZIP inspection modal
      if (result.assets.length === 1 && result.assets[0].name.toLowerCase().endsWith('.zip')) {
        await handleInspectZip(result.assets[0].uri, result.assets[0].name);
        return;
      }

      const newDiscovered: DiscoveredFile[] = [];
      for (const asset of result.assets) {
        if (asset.name.toLowerCase().endsWith('.zip')) {
          // Add ZIP container to discovery list
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
    if (selectedFormat !== 'all' && f.format !== selectedFormat) return false;
    if (
      q &&
      !f.name.toLowerCase().includes(q) &&
      !f.folderName.toLowerCase().includes(q) &&
      !f.format.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

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
          {discoveredFiles.length} found
        </Text>
      </View>

      {/* Primary Actions: Scan Storage Folder & Pick Files */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
          onPress={handleScanStorageFolder}
          disabled={isScanning || !!importProgress}
          activeOpacity={0.8}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color={colors.accentForeground} style={{ marginRight: 8 }} />
          ) : (
            <Ionicons name="folder-open" size={20} color={colors.accentForeground} style={{ marginRight: 8 }} />
          )}
          <Text style={[styles.primaryActionText, { color: colors.accentForeground }]}>
            {isScanning ? 'Scanning Storage...' : 'Scan Storage Folder'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryActionBtn,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
          ]}
          onPress={handlePickFiles}
          disabled={isScanning || !!importProgress}
          activeOpacity={0.7}
        >
          <Ionicons name="document-attach-outline" size={19} color={colors.text} style={{ marginRight: 6 }} />
          <Text style={[styles.secondaryActionText, { color: colors.text }]}>Pick Files</Text>
        </TouchableOpacity>
      </View>

      {/* Scoped Storage Guidance Note */}
      <View style={[styles.guidanceBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.accent} style={{ marginRight: 8, marginTop: 1 }} />
        <Text style={[styles.guidanceText, { color: colors.textSecondary }]}>
          Modern Android Scoped Storage: Tap &ldquo;Scan Storage Folder&rdquo; to authorize and scan your device&rsquo;s Books, Downloads, or SD card directory recursively.
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
                {item.format === 'zip' ? (
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
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    <View style={[styles.formatTag, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.formatTagText, { color: colors.accent }]}>
                        {item.format.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.fileSizeText, { color: colors.textMuted }]}>
                      {formatBytes(item.size)}
                    </Text>
                    <Text style={[styles.folderNameText, { color: colors.textSecondary }]} numberOfLines={1}>
                      📁 {item.folderName}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.fileCardRight}>
                {item.format === 'zip' ? (
                  <TouchableOpacity
                    style={[styles.singleImportBtn, { backgroundColor: colors.accentSoft }]}
                    onPress={() => handleInspectZip(item.uri, item.name)}
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
                <Ionicons name="folder-open-outline" size={36} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Discovered Books Yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Tap &ldquo;Scan Storage Folder&rdquo; to select a folder on your device, or &ldquo;Pick Files&rdquo; to select individual ebooks directly.
              </Text>
            </View>
          ) : null
        }
      />

      {/* ZIP Container Inspection Modal */}
      <ZipInspectionModal
        visible={zipModalVisible}
        zipName={zipName}
        entries={zipEntries}
        isExtracting={isExtractingZip}
        extractProgress={zipExtractProgress}
        onClose={() => setZipModalVisible(false)}
        onImportSelected={handleImportZipEntries}
      />

      {/* Lirune Toast */}
      {toastMessage && (
        <LiruneToast
          visible={!!toastMessage}
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
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
    gap: 10,
  },
  primaryActionBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
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