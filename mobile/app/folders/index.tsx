/**
 * Lirune Reader Mobile — Folders Custom In-App Browser
 * Two-Layer Design:
 * Layer 1: Locations (Storage Volumes, Persisted SAF Grants, Add Location / Add Files)
 * Layer 2: In-App Directory Browser (DocumentsContract tree traversal, breadcrumbs, multi-select, sort/filter)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
  BackHandler,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeContext } from '@/theme/ThemeContext';
import {
  nativeStorage,
  StorageVolume,
  NativeDirEntry,
  ArchiveEntry,
} from '@/services/storage/NativeStorageBridge';
import { SUPPORTED_DOCUMENT_MIMES } from '@/models/Book';
import { getDatabase } from '@/services/database/Database';
import { useImportQueueStore } from '@/state/importQueueStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { BreadcrumbBar, BreadcrumbSegment } from '@/components/folders/BreadcrumbBar';
import { BookDetailSheet } from '@/components/folders/BookDetailSheet';
import { ArchivePasswordModal } from '@/components/modals/ArchivePasswordModal';
import { ErrorReportModal } from '@/components/modals/ErrorReportModal';
import { LiruneDialog } from '@/components/LiruneDialog';
import { LiruneToast } from '@/components/LiruneToast';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { logger } from '@/utils/logger';

const TAG = 'FoldersScreen';

interface SafSourceRow {
  id: number;
  tree_uri: string;
  label: string;
  volume_id: string | null;
  status: string | null;
  last_scan_at: number | null;
  grant_valid: number;
  import_mode: string;
}

type SortCriterion = 'name' | 'mtime' | 'size' | 'type';
type ViewMode = 'list' | 'grid';

export default function FoldersScreen() {
  const router = useRouter();
  const { colors } = useThemeContext();
  const { books, loadLibrary } = useLibraryStore();
  const { enqueue } = useImportQueueStore();

  // Navigation layers: Layer 1 (Locations) vs Layer 2 (Active Location Directory Browser)
  const [activeSource, setActiveSource] = useState<SafSourceRow | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbSegment[]>([]);

  // Layer 1 data
  const [volumes, setVolumes] = useState<StorageVolume[]>([]);
  const [sources, setSources] = useState<SafSourceRow[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);

  // Layer 2 data
  const [entries, setEntries] = useState<NativeDirEntry[]>([]);
  const [isLoadingDir, setIsLoadingDir] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [booksOnly, setBooksOnly] = useState(true);
  const [sortBy, setSortBy] = useState<SortCriterion>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [foldersFirst, setFoldersFirst] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bottom sheet preview
  const [selectedBook, setSelectedBook] = useState<NativeDirEntry | null>(null);

  // Dialogs & Toasts
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [infoDialog, setInfoDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  const { archiveUri, archiveName } = useLocalSearchParams<{ archiveUri?: string; archiveName?: string }>();

  // Layer 2A: Archive Browsing State
  const [archiveSession, setArchiveSession] = useState<{
    handleId: string;
    uri: string;
    name: string;
    encoding: string;
    needsPassword: boolean;
    entryCount: number;
  } | null>(null);
  const [archiveBreadcrumbs, setArchiveBreadcrumbs] = useState<{ name: string; path: string }[]>([]);
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [passwordModal, setPasswordModal] = useState<{
    visible: boolean;
    uri: string;
    name: string;
    attempts: number;
    error?: string | null;
  }>({
    visible: false,
    uri: '',
    name: '',
    attempts: 0,
    error: null,
  });
  const [errorReport, setErrorReport] = useState<{
    visible: boolean;
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  // LRU Directory Cache (docId -> entries)
  const dirCache = useRef<Map<string, NativeDirEntry[]>>(new Map());
  const activeRequestId = useRef<string | null>(null);

  // Set of known library file paths and names for "In library" chip
  const librarySet = useMemo(() => {
    const set = new Set<string>();
    for (const b of books) {
      set.add(b.title.toLowerCase());
      if (b.uri) set.add(b.uri);
      if (b.filePath) set.add(b.filePath);
    }
    return set;
  }, [books]);

  // Load Layer 1 locations
  const loadLocations = useCallback(async () => {
    setIsLoadingLocations(true);
    try {
      const vols = await nativeStorage.getStorageVolumes();
      setVolumes(vols);

      const db = await getDatabase();
      if (db) {
        const rows = await db.getAllAsync<SafSourceRow>('SELECT * FROM sources ORDER BY id DESC');
        if (rows.length > 0) {
          const uris = rows.map((r) => r.tree_uri).filter(Boolean);
          const valRes = await nativeStorage.validatePersistedGrants(uris);
          const revokedSet = new Set(valRes.revokedUris);
          const updated = rows.map((r) => ({
            ...r,
            grant_valid: revokedSet.has(r.tree_uri) ? 0 : 1,
          }));
          setSources(updated);
        } else {
          setSources([]);
        }
      }
    } catch (err) {
      logger.error(TAG, 'Failed loading storage locations', err);
    } finally {
      setIsLoadingLocations(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
    loadLibrary();
  }, [loadLocations, loadLibrary]);


  // Query directory contents in streaming batches
  const fetchDirectory = useCallback(
    async (treeUri: string, docId?: string, forceRefresh = false) => {
      const cacheKey = `${treeUri}:${docId || 'root'}`;
      if (!forceRefresh && dirCache.current.has(cacheKey)) {
        setEntries(dirCache.current.get(cacheKey) || []);
        return;
      }

      // Cancel previous listing if still active
      if (activeRequestId.current) {
        await nativeStorage.cancelListing(activeRequestId.current);
        activeRequestId.current = null;
      }

      setIsLoadingDir(true);
      const accumulated: NativeDirEntry[] = [];

      const unsubs: (() => void)[] = [];

      unsubs.push(
        nativeStorage.onDirBatch(({ requestId, entries: batch }) => {
          if (activeRequestId.current !== requestId) return;
          accumulated.push(...batch);
          setEntries([...accumulated]);
        })
      );

      unsubs.push(
        nativeStorage.onDirDone(({ requestId }) => {
          if (activeRequestId.current !== requestId) return;
          setIsLoadingDir(false);
          setIsRefreshing(false);
          // Store in LRU cache (cap at 50)
          if (dirCache.current.size >= 50) {
            const firstKey = dirCache.current.keys().next().value;
            if (firstKey) dirCache.current.delete(firstKey);
          }
          dirCache.current.set(cacheKey, accumulated);
          unsubs.forEach((u) => u());
        })
      );

      unsubs.push(
        nativeStorage.onDirError(({ requestId, error }) => {
          if (activeRequestId.current !== requestId) return;
          logger.warn(TAG, `Directory listing error for ${cacheKey}`, error);
          setIsLoadingDir(false);
          setIsRefreshing(false);
          unsubs.forEach((u) => u());
        })
      );

      try {
        const { requestId } = await nativeStorage.listDirectory(treeUri, docId, { batchSize: 100 });
        activeRequestId.current = requestId;
      } catch (err) {
        logger.error(TAG, 'listDirectory invocation failed', err);
        setIsLoadingDir(false);
        setIsRefreshing(false);
        unsubs.forEach((u) => u());
      }
    },
    []
  );

  // Enter a location source
  const openLocation = useCallback(
    async (source: SafSourceRow) => {
      if (source.grant_valid === 0) {
        setInfoDialog({
          visible: true,
          title: 'Permission Lost',
          message: 'Android system settings have revoked access to this location. Please re-authorize it to browse.',
        });
        return;
      }

      setActiveSource(source);
      setIsMultiSelect(false);
      setSelectedIds(new Set());
      setSearchQuery('');

      const rootSegment: BreadcrumbSegment = {
        docId: '',
        name: source.label || 'Root',
      };
      setBreadcrumbs([rootSegment]);
      await fetchDirectory(source.tree_uri);
    },
    [fetchDirectory]
  );

  // Navigate to child folder
  const navigateToChild = useCallback(
    async (folder: NativeDirEntry) => {
      if (!activeSource) return;
      setIsMultiSelect(false);
      setSelectedIds(new Set());
      setSearchQuery('');

      const newSegment: BreadcrumbSegment = {
        docId: folder.docId,
        name: folder.name,
      };
      setBreadcrumbs((prev) => [...prev, newSegment]);
      await fetchDirectory(activeSource.tree_uri, folder.docId);
    },
    [activeSource, fetchDirectory]
  );

  // Exit back to Layer 1 Locations
  const exitToLocations = useCallback(() => {
    setActiveSource(null);
    setBreadcrumbs([]);
    setEntries([]);
    setIsMultiSelect(false);
    setSelectedIds(new Set());
    loadLocations();
  }, [loadLocations]);

  // Navigate up one level
  const goUpOneLevel = useCallback(async () => {
    if (!activeSource || breadcrumbs.length <= 1) {
      exitToLocations();
      return;
    }
    const newBreadcrumbs = breadcrumbs.slice(0, breadcrumbs.length - 1);
    setBreadcrumbs(newBreadcrumbs);
    const targetDocId = newBreadcrumbs[newBreadcrumbs.length - 1].docId;
    await fetchDirectory(activeSource.tree_uri, targetDocId);
  }, [activeSource, breadcrumbs, exitToLocations, fetchDirectory]);

  // Jump to specific breadcrumb index
  const jumpToSegment = useCallback(
    async (index: number) => {
      if (!activeSource || index >= breadcrumbs.length - 1) return;
      const targetCrumbs = breadcrumbs.slice(0, index + 1);
      setBreadcrumbs(targetCrumbs);
      const targetDocId = targetCrumbs[targetCrumbs.length - 1].docId;
      await fetchDirectory(activeSource.tree_uri, targetDocId);
    },
    [activeSource, breadcrumbs, fetchDirectory]
  );

  // Lazy format sniffing inside archive
  const lazySniffEntries = useCallback(async (handleId: string, items: ArchiveEntry[]) => {
    const unsniffed = items.filter((e) => !e.isDirectory && !e.sniffFormat && e.kind !== 'blocked').slice(0, 8);
    for (const item of unsniffed) {
      try {
        const sniff = await nativeStorage.sniffArchiveEntry(handleId, item.path);
        if (sniff.kind === 'book') {
          setArchiveEntries((prev) =>
            prev.map((e) => (e.path === item.path ? { ...e, sniffFormat: sniff.format, kind: 'book' } : e))
          );
        }
      } catch {}
    }
  }, []);

  // Open archive container
  const openArchiveContainer = useCallback(
    async (uri: string, name: string, password?: string, encoding?: string) => {
      setIsLoadingArchive(true);
      try {
        const info = await nativeStorage.openArchive(uri, password, encoding);
        if (info.needsPassword && !password) {
          setPasswordModal({
            visible: true,
            uri,
            name,
            attempts: 0,
            error: null,
          });
          setIsLoadingArchive(false);
          return;
        }

        setArchiveSession({
          handleId: info.handleId,
          uri,
          name,
          encoding: info.encoding,
          needsPassword: info.needsPassword,
          entryCount: info.entryCount,
        });
        setArchiveBreadcrumbs([{ name, path: '' }]);

        const entriesList = await nativeStorage.listArchive(info.handleId, '', 0, 500);
        setArchiveEntries(entriesList);

        // Single-book archive shortcut: exactly one supported book in root
        const nonDir = entriesList.filter((e) => !e.isDirectory);
        if (nonDir.length === 1 && nonDir[0].kind === 'book') {
          const single = nonDir[0];
          setSelectedBook({
            docId: single.path,
            name: single.name,
            isDirectory: false,
            size: single.size,
            mtime: single.mtime,
            mimeType: null,
            format: single.sniffFormat || single.name.split('.').pop() || 'epub',
            uri,
          });
        }

        void lazySniffEntries(info.handleId, entriesList);
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        logger.error(TAG, 'Failed to open archive', err);
        let title = 'Cannot Open Archive';
        let message = 'An error occurred while reading the archive file.';
        if (msg.includes('Corrupt: central directory not found')) {
          title = 'Corrupted Archive';
          message = 'The central directory was not found. The file may be incomplete or corrupted.';
        } else if (msg.includes('Unsupported compression')) {
          title = 'Unsupported Compression';
          message = 'The archive uses a compression method not currently supported.';
        } else if (msg.includes('suspicious') || msg.includes('limit')) {
          title = 'Suspicious Archive';
          message = 'The archive entry size or compression ratio exceeds security limits.';
        } else if (msg.includes('Password required') || msg.includes('needs password')) {
          setPasswordModal((prev) => ({
            visible: true,
            uri,
            name,
            attempts: prev.attempts + 1,
            error: 'Incorrect password',
          }));
          return;
        }
        setErrorReport({
          visible: true,
          title,
          message,
          details: msg,
        });
      } finally {
        setIsLoadingArchive(false);
      }
    },
    [lazySniffEntries]
  );

  // Navigate back inside archive or exit
  const handleArchiveBack = useCallback(async () => {
    if (!archiveSession) return;
    if (archiveBreadcrumbs.length > 1) {
      const updated = [...archiveBreadcrumbs];
      updated.pop();
      const parentSegment = updated[updated.length - 1];
      setArchiveBreadcrumbs(updated);
      setIsLoadingArchive(true);
      try {
        const list = await nativeStorage.listArchive(archiveSession.handleId, parentSegment.path, 0, 500);
        setArchiveEntries(list);
        void lazySniffEntries(archiveSession.handleId, list);
      } finally {
        setIsLoadingArchive(false);
      }
    } else {
      await nativeStorage.closeArchive(archiveSession.handleId);
      setArchiveSession(null);
      setArchiveBreadcrumbs([]);
      setArchiveEntries([]);
      setSelectedIds(new Set());
      setIsMultiSelect(false);
    }
  }, [archiveSession, archiveBreadcrumbs, lazySniffEntries]);

  // Handle auto-open if passed via query params
  useEffect(() => {
    if (archiveUri) {
      openArchiveContainer(archiveUri, archiveName || 'Archive');
    }
  }, [archiveUri, archiveName, openArchiveContainer]);

  // Handle hardware Back button to navigate up breadcrumbs or back to locations
  useEffect(() => {
    const onBackPress = () => {
      if (isMultiSelect) {
        setIsMultiSelect(false);
        setSelectedIds(new Set());
        return true;
      }
      if (archiveSession) {
        void handleArchiveBack();
        return true;
      }
      if (activeSource) {
        if (breadcrumbs.length > 1) {
          goUpOneLevel();
          return true;
        } else {
          exitToLocations();
          return true;
        }
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [activeSource, archiveSession, breadcrumbs.length, exitToLocations, goUpOneLevel, handleArchiveBack, isMultiSelect]);

  // Add location via SAF tree picker
  const handleAddLocation = async () => {
    try {
      // In mobile Expo environment, DocumentPicker or custom SAF intent handles tree picking
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOCUMENT_MIMES,
        copyToCacheDirectory: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const uri = asset.uri;

      // Persist SAF grant if content URI
      if (uri.startsWith('content://')) {
        await nativeStorage.takePersistableGrant(uri);
      }

      const label = asset.name || 'Selected Storage';

      const db = await getDatabase();
      if (db) {
        await db.runAsync(
          `INSERT INTO sources (tree_uri, label, volume_id, status, last_scan_at, grant_valid, import_mode)
           VALUES (?, ?, ?, 'active', ?, 1, 'managed')
           ON CONFLICT(tree_uri) DO UPDATE SET
             label = excluded.label,
             grant_valid = 1;`,
          [uri, label, 'primary', Date.now()]
        );
      }
      setToastMessage(`Added location: ${label}`);
      loadLocations();
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('forbidden') || msg.includes('access denied')) {
        setInfoDialog({
          visible: true,
          title: 'Restricted Folder',
          message: 'Android does not allow selecting the root of storage or Downloads directly. Pick a subfolder like Documents or Books.',
        });
      } else {
        logger.error(TAG, 'Error adding location', err);
      }
    }
  };

  // Add individual files
  const handleAddFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOCUMENT_MIMES,
        multiple: true,
        copyToCacheDirectory: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const toEnqueue = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        format: a.name.split('.').pop()?.toLowerCase() || 'epub',
      }));

      await enqueue(toEnqueue);
      setToastMessage(`Queued ${toEnqueue.length} file(s) for import`);
    } catch (err) {
      logger.error(TAG, 'Failed to pick individual files', err);
    }
  };

  // Re-authorize a revoked source
  const handleReauthorizeSource = async (source: SafSourceRow) => {
    try {
      await nativeStorage.takePersistableGrant(source.tree_uri);
      const db = await getDatabase();
      if (db) {
        await db.runAsync('UPDATE sources SET grant_valid = 1 WHERE id = ?', [source.id]);
      }
      setToastMessage('Location re-authorized successfully');
      loadLocations();
    } catch {
      setInfoDialog({
        visible: true,
        title: 'Re-authorization Required',
        message: 'Please re-add this location using the folder picker.',
      });
    }
  };

  // Filtered and sorted entries
  const displayedEntries = useMemo(() => {
    let result = entries;

    if (booksOnly) {
      result = result.filter((e) => e.isDirectory || Boolean(e.format));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (foldersFirst && a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
          break;
        case 'mtime':
          cmp = (a.mtime || 0) - (b.mtime || 0);
          break;
        case 'size':
          cmp = (a.size || 0) - (b.size || 0);
          break;
        case 'type':
          cmp = (a.format || '').localeCompare(b.format || '');
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [entries, booksOnly, searchQuery, sortBy, sortAsc, foldersFirst]);

  // Filtered and sorted archive entries
  const displayedArchiveEntries = useMemo(() => {
    let result = archiveEntries;

    if (booksOnly) {
      result = result.filter((e) => e.isDirectory || e.kind === 'book');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (foldersFirst && a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
          break;
        case 'mtime':
          cmp = (a.mtime || 0) - (b.mtime || 0);
          break;
        case 'size':
          cmp = (a.size || 0) - (b.size || 0);
          break;
        case 'type':
          cmp = (a.sniffFormat || '').localeCompare(b.sniffFormat || '');
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [archiveEntries, booksOnly, searchQuery, sortBy, sortAsc, foldersFirst]);

  // Multi-select toggle
  const toggleSelect = (docIdOrPath: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docIdOrPath)) next.delete(docIdOrPath);
      else next.add(docIdOrPath);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (archiveSession) {
      const selectable = displayedArchiveEntries.filter((e) => !e.isDirectory && e.kind === 'book');
      if (selectedIds.size === selectable.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(selectable.map((e) => e.path)));
      }
      return;
    }

    if (selectedIds.size === displayedEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedEntries.map((e) => e.docId)));
    }
  };

  // Import selected items
  const handleImportSelected = async () => {
    if (archiveSession) {
      const toImport = archiveEntries.filter((e) => selectedIds.has(e.path) && e.kind === 'book');
      if (toImport.length === 0) {
        setToastMessage('No valid books selected');
        return;
      }
      await enqueue(
        toImport.map((e) => ({
          uri: archiveSession.uri,
          name: e.name,
          format: e.sniffFormat || e.name.split('.').pop() || 'epub',
          mode: 'managed' as const,
          archiveHandleId: archiveSession.handleId,
          archiveEntryPath: e.path,
          sourceKind: 'archive' as const,
        }))
      );
      setToastMessage(`Queued ${toImport.length} book(s) from ${archiveSession.name}`);
      setIsMultiSelect(false);
      setSelectedIds(new Set());
      return;
    }

    const selectedEntries = entries.filter((e) => selectedIds.has(e.docId) && !e.isDirectory);
    if (selectedEntries.length === 0) {
      setToastMessage('No book files selected');
      return;
    }
    const toEnqueue = selectedEntries.map((e) => ({
      uri: e.uri,
      name: e.name,
      format: e.format || 'epub',
    }));
    await enqueue(toEnqueue);
    setToastMessage(`Queued ${toEnqueue.length} item(s) for import`);
    setIsMultiSelect(false);
    setSelectedIds(new Set());
  };

  // Import all books in current archive folder
  const handleImportAllInFolder = async () => {
    if (!archiveSession) return;
    const bookEntries = archiveEntries.filter((e) => !e.isDirectory && e.kind === 'book');
    if (bookEntries.length === 0) {
      setToastMessage('No supported book files found in this folder');
      return;
    }
    await enqueue(
      bookEntries.map((e) => ({
        uri: archiveSession.uri,
        name: e.name,
        format: e.sniffFormat || e.name.split('.').pop() || 'epub',
        mode: 'managed' as const,
        archiveHandleId: archiveSession.handleId,
        archiveEntryPath: e.path,
        sourceKind: 'archive' as const,
      }))
    );
    setToastMessage(`Queued all ${bookEntries.length} book(s) from folder for import`);
  };

  // Open book item
  const handleOpenBook = async (item: NativeDirEntry) => {
    // Check if in library
    const existing = books.find((b) => b.title.toLowerCase() === item.name.toLowerCase() || b.uri === item.uri);
    if (existing) {
      await useReaderStore.getState().openBook(existing);
      router.push({ pathname: '/reader', params: { bookId: existing.id } });
      return;
    }

    // Ingest first then open
    if (archiveSession) {
      await enqueue([
        {
          uri: archiveSession.uri,
          name: item.name,
          format: item.format || 'epub',
          mode: 'managed',
          archiveHandleId: archiveSession.handleId,
          archiveEntryPath: item.docId,
          sourceKind: 'archive',
        },
      ]);
    } else {
      await enqueue([{ uri: item.uri, name: item.name, format: item.format || 'epub' }]);
    }
    setToastMessage('Importing book to open...');
  };

  // ==========================================
  // RENDER: Layer 2A (Archive Container Browser)
  // ==========================================
  if (archiveSession) {
    const currentCrumbName = archiveBreadcrumbs[archiveBreadcrumbs.length - 1]?.name || archiveSession.name;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {/* Top Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleArchiveBack} style={styles.backBtn} accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Ionicons name="archive" size={20} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {currentCrumbName}
            </Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => {
                const encodings = ['UTF-8', 'IBM437', 'CP866', 'GBK', 'Shift_JIS', 'Big5'];
                const nextEnc = encodings[(encodings.indexOf(archiveSession.encoding) + 1) % encodings.length];
                openArchiveContainer(archiveSession.uri, archiveSession.name, undefined, nextEnc);
                setToastMessage(`Encoding: ${nextEnc}`);
              }}
              style={styles.iconBtn}
              accessibilityLabel="Change filename encoding"
            >
              <Ionicons name="text-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              style={styles.iconBtn}
              accessibilityLabel="Toggle view mode"
            >
              <Ionicons
                name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setBooksOnly(!booksOnly)}
              style={[
                styles.filterChip,
                booksOnly && { backgroundColor: colors.accent + '22', borderColor: colors.accent },
              ]}
              accessibilityLabel="Filter books only"
            >
              <Ionicons
                name="book"
                size={14}
                color={booksOnly ? colors.accent : colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: booksOnly ? colors.accent : colors.textSecondary },
                ]}
              >
                Books
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search inside archive..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Archive Breadcrumb Bar */}
        <View style={[styles.archiveBreadcrumbRow, { borderBottomColor: colors.borderSubtle }]}>
          <Ionicons name="archive-outline" size={16} color={colors.accent} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbScroll}>
            {archiveBreadcrumbs.map((crumb, idx) => {
              const isLast = idx === archiveBreadcrumbs.length - 1;
              return (
                <View key={idx} style={styles.breadcrumbItem}>
                  <TouchableOpacity
                    disabled={isLast}
                    onPress={async () => {
                      const updated = archiveBreadcrumbs.slice(0, idx + 1);
                      setArchiveBreadcrumbs(updated);
                      setIsLoadingArchive(true);
                      try {
                        const list = await nativeStorage.listArchive(archiveSession.handleId, crumb.path, 0, 500);
                        setArchiveEntries(list);
                        void lazySniffEntries(archiveSession.handleId, list);
                      } finally {
                        setIsLoadingArchive(false);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.breadcrumbText,
                        { color: isLast ? colors.text : colors.accent, fontWeight: isLast ? '700' : '500' },
                      ]}
                      numberOfLines={1}
                    >
                      {crumb.name}
                    </Text>
                  </TouchableOpacity>
                  {!isLast && <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginHorizontal: 4 }} />}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Content */}
        {isLoadingArchive ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Reading archive contents...</Text>
          </View>
        ) : (
          <FlatList
            data={displayedArchiveEntries}
            keyExtractor={(item) => item.path}
            numColumns={viewMode === 'grid' ? 3 : 1}
            key={viewMode}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.path);
              const isBlocked = item.kind === 'blocked';
              const inLibrary = !item.isDirectory && librarySet.has(item.name.toLowerCase());

              const handleItemPress = () => {
                if (isBlocked) {
                  setToastMessage('Blocked application package or unsupported format');
                  return;
                }
                if (isMultiSelect) {
                  toggleSelect(item.path);
                  return;
                }
                if (item.isDirectory) {
                  const updated = [...archiveBreadcrumbs, { name: item.name, path: item.path }];
                  setArchiveBreadcrumbs(updated);
                  setIsLoadingArchive(true);
                  nativeStorage.listArchive(archiveSession.handleId, item.path, 0, 500)
                    .then((list) => {
                      setArchiveEntries(list);
                      void lazySniffEntries(archiveSession.handleId, list);
                    })
                    .finally(() => setIsLoadingArchive(false));
                } else {
                  setSelectedBook({
                    docId: item.path,
                    name: item.name,
                    isDirectory: false,
                    size: item.size,
                    mtime: item.mtime,
                    mimeType: null,
                    format: item.sniffFormat || item.name.split('.').pop() || 'epub',
                    uri: archiveSession.uri,
                  });
                }
              };

              if (viewMode === 'grid') {
                return (
                  <TouchableOpacity
                    style={[
                      styles.gridItem,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isSelected ? colors.accent : colors.borderSubtle,
                        opacity: isBlocked ? 0.45 : 1,
                      },
                    ]}
                    disabled={isBlocked}
                    onPress={handleItemPress}
                    onLongPress={() => {
                      if (!isBlocked && !isMultiSelect) {
                        setIsMultiSelect(true);
                        setSelectedIds(new Set([item.path]));
                      }
                    }}
                  >
                    <View style={styles.gridIcon}>
                      <Ionicons
                        name={item.isDirectory ? 'folder' : isBlocked ? 'ban-outline' : 'document-text'}
                        size={36}
                        color={item.isDirectory ? colors.accent : isBlocked ? colors.blocked : colors.textSecondary}
                      />
                      {isMultiSelect && !isBlocked && (
                        <Ionicons
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={isSelected ? colors.accent : colors.textMuted}
                          style={styles.gridCheckbox}
                        />
                      )}
                    </View>
                    <Text style={[styles.gridName, { color: colors.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.sniffFormat ? (
                      <View style={[styles.badgeSmall, { backgroundColor: colors.accent + '22' }]}>
                        <Text style={[styles.badgeTextSmall, { color: colors.accent }]}>
                          {item.sniffFormat.toUpperCase()}
                        </Text>
                      </View>
                    ) : isBlocked ? (
                      <View style={[styles.badgeSmall, { backgroundColor: colors.blockedSoft }]}>
                        <Text style={[styles.badgeTextSmall, { color: colors.blocked }]}>BLOCKED</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }

              // List Item inside archive
              return (
                <TouchableOpacity
                  style={[
                    styles.listItem,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isSelected ? colors.accent : colors.borderSubtle,
                      opacity: isBlocked ? 0.45 : 1,
                    },
                  ]}
                  disabled={isBlocked}
                  onPress={handleItemPress}
                  onLongPress={() => {
                    if (!isBlocked && !isMultiSelect) {
                      setIsMultiSelect(true);
                      setSelectedIds(new Set([item.path]));
                    }
                  }}
                >
                  {isMultiSelect && !isBlocked && (
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? colors.accent : colors.textMuted}
                      style={{ marginRight: 12 }}
                    />
                  )}

                  <View
                    style={[
                      styles.listIconBox,
                      {
                        backgroundColor: item.isDirectory
                          ? colors.accent + '15'
                          : isBlocked
                          ? colors.blockedSoft
                          : colors.surfaceElevated,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.isDirectory ? 'folder' : isBlocked ? 'ban-outline' : 'document-text-outline'}
                      size={22}
                      color={item.isDirectory ? colors.accent : isBlocked ? colors.blocked : colors.textSecondary}
                    />
                  </View>

                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.listSubRow}>
                      {!item.isDirectory && (
                        <Text style={[styles.listSub, { color: colors.textSecondary }]}>
                          {item.size > 0 ? (item.size / 1024 / 1024).toFixed(1) + ' MB' : ''} •{' '}
                        </Text>
                      )}
                      <Text style={[styles.listSub, { color: colors.textMuted }]}>
                        {isBlocked ? 'Blocked app package' : item.mtime > 0 ? new Date(item.mtime).toLocaleDateString() : ''}
                      </Text>
                    </View>
                  </View>

                  {item.sniffFormat ? (
                    <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
                      <Text style={[styles.badgeText, { color: colors.accent }]}>
                        {item.sniffFormat.toUpperCase()}
                      </Text>
                    </View>
                  ) : isBlocked ? (
                    <View style={[styles.badge, { backgroundColor: colors.blockedSoft }]}>
                      <Text style={[styles.badgeTextSmall, { color: colors.blocked }]}>BLOCKED</Text>
                    </View>
                  ) : null}

                  {inLibrary && (
                    <View style={[styles.chipInLibrary, { backgroundColor: colors.success + '22' }]}>
                      <Text style={[styles.chipTextInLibrary, { color: colors.success }]}>In Library</Text>
                    </View>
                  )}

                  {item.isDirectory ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  ) : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Books Inside</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  {booksOnly ? 'No supported book files found in this archive folder.' : 'This archive folder is empty.'}
                </Text>
              </View>
            }
          />
        )}

        {/* Bottom Bar: Multi-Select or Import All */}
        <View style={[styles.bottomActionBar, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}>
          {isMultiSelect ? (
            <>
              <View style={styles.actionCountRow}>
                <Text style={[styles.actionCountText, { color: colors.text }]}>
                  {selectedIds.size} selected
                </Text>
                <TouchableOpacity onPress={() => { setIsMultiSelect(false); setSelectedIds(new Set()); }}>
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.importBtn, { backgroundColor: colors.accent, flex: 1 }]}
                  onPress={handleImportSelected}
                  accessibilityRole="button"
                  accessibilityLabel="Import selected books"
                >
                  <Ionicons name="download-outline" size={18} color={colors.accentForeground} />
                  <Text style={[styles.importBtnText, { color: colors.accentForeground }]}>
                    Import ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.importBtn, { backgroundColor: colors.accent, flex: 1 }]}
                onPress={handleImportAllInFolder}
                accessibilityRole="button"
                accessibilityLabel="Import all books in this folder"
              >
                <Ionicons name="library-outline" size={18} color={colors.accentForeground} />
                <Text style={[styles.importBtnText, { color: colors.accentForeground }]}>
                  Import All Books in This Folder
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Modals */}
        <BookDetailSheet
          visible={!!selectedBook}
          item={selectedBook}
          isInLibrary={selectedBook ? librarySet.has(selectedBook.name.toLowerCase()) : false}
          isContainer={false}
          onClose={() => setSelectedBook(null)}
          onOpen={() => selectedBook && handleOpenBook(selectedBook)}
          onImport={() => {
            if (selectedBook && archiveSession) {
              enqueue([
                {
                  uri: archiveSession.uri,
                  name: selectedBook.name,
                  format: selectedBook.format || 'epub',
                  mode: 'managed',
                  archiveHandleId: archiveSession.handleId,
                  archiveEntryPath: selectedBook.docId,
                  sourceKind: 'archive',
                },
              ]);
              setToastMessage(`Queued ${selectedBook.name} for import`);
            }
          }}
        />

        <ArchivePasswordModal
          visible={passwordModal.visible}
          archiveName={passwordModal.name}
          attempts={passwordModal.attempts}
          errorMessage={passwordModal.error}
          onSubmit={(pass) => {
            const nextAttempts = passwordModal.attempts + 1;
            if (nextAttempts >= 5) {
              setPasswordModal({ visible: false, uri: '', name: '', attempts: 0 });
              setToastMessage('Maximum password attempts exceeded.');
              return;
            }
            openArchiveContainer(passwordModal.uri, passwordModal.name, pass);
          }}
          onCancel={() => {
            setPasswordModal({ visible: false, uri: '', name: '', attempts: 0 });
          }}
        />

        <ErrorReportModal
          visible={!!errorReport}
          title={errorReport?.title || 'Archive Error'}
          message={errorReport?.message || ''}
          details={errorReport?.details}
          onDismiss={() => setErrorReport(null)}
        />

        {toastMessage && (
          <LiruneToast visible={!!toastMessage} message={toastMessage} onDismiss={() => setToastMessage(null)} />
        )}
      </SafeAreaView>
    );
  }

  // ==========================================
  // RENDER: Layer 1 (Locations)
  // ==========================================
  if (!activeSource) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
          <View style={styles.headerLeft}>
            <LiruneNavButton />
            <Text style={[styles.headerTitle, { color: colors.text }]}>Folders</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.headerBtn, { borderColor: colors.borderSubtle }]}
              onPress={handleAddFiles}
              accessibilityRole="button"
              accessibilityLabel="Add individual files"
            >
              <Ionicons name="document-attach-outline" size={18} color={colors.accent} />
              <Text style={[styles.headerBtnText, { color: colors.accent }]}>Add Files</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={sources}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingLocations}
              onRefresh={loadLocations}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={styles.locationsList}
          ListHeaderComponent={
            <>
              {/* Storage Volumes */}
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Storage Volumes</Text>
              <View style={styles.volumesRow}>
                {volumes.map((v, idx) => {
                  const usedPct = v.totalBytes > 0 ? (1 - v.freeBytes / v.totalBytes) * 100 : 0;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.volumeCard,
                        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                      ]}
                    >
                      <View style={styles.volumeHeader}>
                        <Ionicons
                          name={v.isRemovable ? 'card-outline' : 'phone-portrait-outline'}
                          size={20}
                          color={colors.accent}
                        />
                        <Text style={[styles.volumeLabel, { color: colors.text }]} numberOfLines={1}>
                          {v.label}
                        </Text>
                      </View>
                      <View style={[styles.storageBarBg, { backgroundColor: colors.surfaceElevated }]}>
                        <View
                          style={[
                            styles.storageBarFill,
                            {
                              width: `${Math.min(usedPct, 100)}%`,
                              backgroundColor: usedPct > 90 ? colors.error : colors.accent,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.volumeStats, { color: colors.textSecondary }]}>
                        {(v.freeBytes / 1024 / 1024 / 1024).toFixed(1)} GB free of{' '}
                        {(v.totalBytes / 1024 / 1024 / 1024).toFixed(1)} GB
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Add Location Card */}
              <TouchableOpacity
                style={[
                  styles.addLocationCard,
                  { backgroundColor: colors.surface, borderColor: colors.accent },
                ]}
                onPress={handleAddLocation}
                accessibilityRole="button"
                accessibilityLabel="Add folder location"
              >
                <View style={[styles.addIconCircle, { backgroundColor: colors.accent + '22' }]}>
                  <Ionicons name="folder-open-outline" size={24} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.addTitle, { color: colors.text }]}>Add Folder Location</Text>
                  <Text style={[styles.addSub, { color: colors.textSecondary }]}>
                    Grant in-app access to Documents, Books, or SD Card once
                  </Text>
                </View>
                <Ionicons name="add-circle" size={24} color={colors.accent} />
              </TouchableOpacity>

              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                Authorized Locations ({sources.length})
              </Text>
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.sourceCard,
                { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
              ]}
              onPress={() => openLocation(item)}
              accessibilityRole="button"
              accessibilityLabel={`Location ${item.label}`}
            >
              <View style={[styles.sourceIconBox, { backgroundColor: colors.accent + '15' }]}>
                <Ionicons
                  name={item.grant_valid ? 'folder' : 'warning-outline'}
                  size={24}
                  color={item.grant_valid ? colors.accent : colors.error}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sourceLabel, { color: colors.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[styles.sourceUri, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.tree_uri}
                </Text>
              </View>

              {item.grant_valid === 0 ? (
                <TouchableOpacity
                  style={[styles.reauthBtn, { backgroundColor: colors.error + '22' }]}
                  onPress={() => handleReauthorizeSource(item)}
                >
                  <Text style={[styles.reauthText, { color: colors.error }]}>Re-authorize</Text>
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Locations Added</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Tap &ldquo;Add Folder Location&rdquo; above to select your book folders.
              </Text>
            </View>
          }
        />

        {/* Info Dialog */}
        <LiruneDialog
          visible={infoDialog.visible}
          title={infoDialog.title}
          message={infoDialog.message}
          onConfirm={() => setInfoDialog((d) => ({ ...d, visible: false }))}
        />

        {toastMessage && (
          <LiruneToast visible={!!toastMessage} message={toastMessage} onDismiss={() => setToastMessage(null)} />
        )}
      </SafeAreaView>
    );
  }

  // ==========================================
  // RENDER: Layer 2 (In-App Directory Browser)
  // ==========================================
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={goUpOneLevel} style={styles.backBtn} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {breadcrumbs[breadcrumbs.length - 1]?.name || activeSource.label}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {isMultiSelect ? (
            <TouchableOpacity onPress={handleSelectAll} style={styles.iconBtn}>
              <Ionicons
                name={selectedIds.size === displayedEntries.length ? 'checkbox' : 'checkbox-outline'}
                size={22}
                color={colors.accent}
              />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => {
                  const cycle: SortCriterion[] = ['name', 'mtime', 'size', 'type'];
                  const next = cycle[(cycle.indexOf(sortBy) + 1) % cycle.length];
                  setSortBy(next);
                  setToastMessage(`Sorted by ${next}`);
                }}
                style={styles.iconBtn}
                accessibilityLabel="Sort by"
              >
                <Ionicons name="swap-vertical" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSortAsc(!sortAsc)}
                style={styles.iconBtn}
                accessibilityLabel="Toggle sort direction"
              >
                <Ionicons
                  name={sortAsc ? 'arrow-up' : 'arrow-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFoldersFirst(!foldersFirst)}
                style={styles.iconBtn}
                accessibilityLabel="Toggle folders first"
              >
                <Ionicons
                  name={foldersFirst ? 'folder' : 'folder-outline'}
                  size={16}
                  color={foldersFirst ? colors.accent : colors.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                style={styles.iconBtn}
                accessibilityLabel="Toggle view mode"
              >
                <Ionicons
                  name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setBooksOnly(!booksOnly)}
                style={[
                  styles.filterChip,
                  booksOnly && { backgroundColor: colors.accent + '22', borderColor: colors.accent },
                ]}
                accessibilityLabel="Filter books only"
              >
                <Ionicons
                  name="book"
                  size={14}
                  color={booksOnly ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: booksOnly ? colors.accent : colors.textSecondary },
                  ]}
                >
                  Books
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Breadcrumb Navigation Bar */}
      <BreadcrumbBar
        segments={breadcrumbs}
        onSelectSegment={jumpToSegment}
        onGoHome={exitToLocations}
      />

      {/* Search Input Bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Filter this folder..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Directory Content List */}
      {isLoadingDir && entries.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading folder...</Text>
        </View>
      ) : (
        <FlatList
          data={displayedEntries}
          keyExtractor={(item) => item.docId}
          numColumns={viewMode === 'grid' ? 3 : 1}
          key={viewMode}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                const currentDoc = breadcrumbs[breadcrumbs.length - 1]?.docId;
                fetchDirectory(activeSource.tree_uri, currentDoc, true);
              }}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.docId);
            const inLibrary = !item.isDirectory && librarySet.has(item.name.toLowerCase());

            const isZip = item.format === 'zip' || item.name.toLowerCase().endsWith('.zip');

            if (viewMode === 'grid') {
              return (
                <TouchableOpacity
                  style={[
                    styles.gridItem,
                    { backgroundColor: colors.surface, borderColor: isSelected ? colors.accent : colors.borderSubtle },
                  ]}
                  onPress={() => {
                    if (isMultiSelect) toggleSelect(item.docId);
                    else if (isZip) openArchiveContainer(item.uri, item.name);
                    else if (item.isDirectory) navigateToChild(item);
                    else setSelectedBook(item);
                  }}
                  onLongPress={() => {
                    if (!isMultiSelect) {
                      setIsMultiSelect(true);
                      setSelectedIds(new Set([item.docId]));
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.isDirectory ? 'Folder' : isZip ? 'Archive' : 'File'} ${item.name}`}
                >
                  <View style={styles.gridIcon}>
                    <Ionicons
                      name={item.isDirectory ? 'folder' : isZip ? 'archive' : 'document-text'}
                      size={36}
                      color={item.isDirectory ? colors.accent : isZip ? colors.accent : colors.textSecondary}
                    />
                    {isMultiSelect && (
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={isSelected ? colors.accent : colors.textMuted}
                        style={styles.gridCheckbox}
                      />
                    )}
                  </View>
                  <Text style={[styles.gridName, { color: colors.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {isZip ? (
                    <View style={[styles.badgeSmall, { backgroundColor: colors.accent + '22' }]}>
                      <Text style={[styles.badgeTextSmall, { color: colors.accent }]}>
                        ZIP · ARCHIVE
                      </Text>
                    </View>
                  ) : item.format ? (
                    <View style={[styles.badgeSmall, { backgroundColor: colors.accent + '22' }]}>
                      <Text style={[styles.badgeTextSmall, { color: colors.accent }]}>
                        {item.format.toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            }

            // List Item
            return (
              <TouchableOpacity
                style={[
                  styles.listItem,
                  { backgroundColor: colors.surface, borderColor: isSelected ? colors.accent : colors.borderSubtle },
                ]}
                onPress={() => {
                  if (isMultiSelect) toggleSelect(item.docId);
                  else if (isZip) openArchiveContainer(item.uri, item.name);
                  else if (item.isDirectory) navigateToChild(item);
                  else setSelectedBook(item);
                }}
                onLongPress={() => {
                  if (!isMultiSelect) {
                    setIsMultiSelect(true);
                    setSelectedIds(new Set([item.docId]));
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.isDirectory ? 'Folder' : isZip ? 'Archive' : 'File'} ${item.name}`}
              >
                {isMultiSelect && (
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={isSelected ? colors.accent : colors.textMuted}
                    style={{ marginRight: 12 }}
                  />
                )}

                <View
                  style={[
                    styles.listIconBox,
                    { backgroundColor: item.isDirectory || isZip ? colors.accent + '15' : colors.surfaceElevated },
                  ]}
                >
                  <Ionicons
                    name={item.isDirectory ? 'folder' : isZip ? 'archive-outline' : 'document-text-outline'}
                    size={22}
                    color={item.isDirectory || isZip ? colors.accent : colors.textSecondary}
                  />
                </View>

                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.listSubRow}>
                    {!item.isDirectory && (
                      <Text style={[styles.listSub, { color: colors.textSecondary }]}>
                        {item.size > 0 ? (item.size / 1024 / 1024).toFixed(1) + ' MB' : ''} •{' '}
                      </Text>
                    )}
                    <Text style={[styles.listSub, { color: colors.textMuted }]}>
                      {isZip ? 'Archive Container' : item.mtime > 0 ? new Date(item.mtime).toLocaleDateString() : ''}
                    </Text>
                  </View>
                </View>

                {isZip ? (
                  <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
                    <Text style={[styles.badgeText, { color: colors.accent }]}>
                      ZIP · ARCHIVE
                    </Text>
                  </View>
                ) : item.format ? (
                  <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
                    <Text style={[styles.badgeText, { color: colors.accent }]}>
                      {item.format.toUpperCase()}
                    </Text>
                  </View>
                ) : null}

                {inLibrary && (
                  <View style={[styles.chipInLibrary, { backgroundColor: colors.success + '22' }]}>
                    <Text style={[styles.chipTextInLibrary, { color: colors.success }]}>In Library</Text>
                  </View>
                )}

                {item.isDirectory || isZip ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={44} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Folder Empty</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {booksOnly ? 'No supported book files found in this folder.' : 'No items found.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Multi-Select Action Bar */}
      {isMultiSelect && (
        <View style={[styles.bottomActionBar, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}>
          <View style={styles.actionCountRow}>
            <Text style={[styles.actionCountText, { color: colors.text }]}>
              {selectedIds.size} selected
            </Text>
            <TouchableOpacity onPress={() => setIsMultiSelect(false)}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.importBtn, { backgroundColor: colors.accent }]}
              onPress={handleImportSelected}
              accessibilityRole="button"
              accessibilityLabel="Import selected files"
            >
              <Ionicons name="download-outline" size={18} color={colors.accentForeground} />
              <Text style={[styles.importBtnText, { color: colors.accentForeground }]}>
                Import ({selectedIds.size})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Book Detail Sheet */}
      <BookDetailSheet
        visible={!!selectedBook}
        item={selectedBook}
        isInLibrary={selectedBook ? librarySet.has(selectedBook.name.toLowerCase()) : false}
        isContainer={selectedBook?.format === 'zip' || Boolean(selectedBook?.name.toLowerCase().endsWith('.zip'))}
        onClose={() => setSelectedBook(null)}
        onBrowseArchive={() => {
          if (selectedBook) {
            openArchiveContainer(selectedBook.uri, selectedBook.name);
          }
        }}
        onOpen={() => selectedBook && handleOpenBook(selectedBook)}
        onImport={() => {
          if (selectedBook) {
            enqueue([{ uri: selectedBook.uri, name: selectedBook.name, format: selectedBook.format || 'epub' }]);
            setToastMessage(`Queued ${selectedBook.name} for import`);
          }
        }}
      />

      {/* Archive Password Prompt Modal */}
      <ArchivePasswordModal
        visible={passwordModal.visible}
        archiveName={passwordModal.name}
        attempts={passwordModal.attempts}
        errorMessage={passwordModal.error}
        onSubmit={(pass) => {
          const nextAttempts = passwordModal.attempts + 1;
          if (nextAttempts >= 5) {
            setPasswordModal({ visible: false, uri: '', name: '', attempts: 0 });
            setToastMessage('Maximum password attempts exceeded.');
            return;
          }
          openArchiveContainer(passwordModal.uri, passwordModal.name, pass);
        }}
        onCancel={() => {
          setPasswordModal({ visible: false, uri: '', name: '', attempts: 0 });
        }}
      />

      {/* Archive Error Report Modal */}
      <ErrorReportModal
        visible={!!errorReport}
        title={errorReport?.title || 'Archive Error'}
        message={errorReport?.message || ''}
        details={errorReport?.details}
        onDismiss={() => setErrorReport(null)}
      />

      {/* Toast */}
      {toastMessage && (
        <LiruneToast visible={!!toastMessage} message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backBtn: {
    padding: 6,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  locationsList: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
    marginLeft: 4,
  },
  volumesRow: {
    gap: 8,
    marginBottom: 12,
  },
  volumeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  volumeLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  storageBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  volumeStats: {
    fontSize: 12,
  },
  addLocationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginBottom: 12,
    minHeight: 56,
  },
  addIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  addSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 56,
  },
  sourceIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  sourceUri: {
    fontSize: 12,
    marginTop: 2,
  },
  reauthBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  reauthText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContainer: {
    padding: 12,
    gap: 6,
    paddingBottom: 80,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 48,
    gap: 8,
  },
  listIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listName: {
    fontSize: 14,
    fontWeight: '500',
  },
  listSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  listSub: {
    fontSize: 11,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chipInLibrary: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipTextInLibrary: {
    fontSize: 10,
    fontWeight: '600',
  },
  gridItem: {
    flex: 1 / 3,
    margin: 4,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'space-between',
  },
  gridIcon: {
    position: 'relative',
    alignItems: 'center',
    marginVertical: 4,
  },
  gridCheckbox: {
    position: 'absolute',
    top: -4,
    right: -12,
  },
  gridName: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  badgeSmall: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginTop: 4,
  },
  badgeTextSmall: {
    fontSize: 9,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  actionCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionCountText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  importBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 48,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  archiveBreadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  breadcrumbScroll: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbText: {
    fontSize: 13,
  },
});
