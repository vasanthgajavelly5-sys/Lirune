# Lirune Reader — Android Architecture

## Overview

This document describes the architecture of the Android version of Lirune Reader, an experimental/future mobile development branch.

**Important:** This Android branch is intentionally separate from the Windows desktop release branch (`lirune-store-home`). The Android app is experimental/future mobile development and is not part of the current Windows Store release.

## Current State

The Android app is built with:
- **Framework**: Expo 57 / React Native 0.86 / React 19 / TypeScript
- **Navigation**: expo-router (file-based routing)
- **State Management**: React hooks + custom repository pattern
- **UI**: React Native components with custom design system
- **Storage**: expo-file-system (app-private files) + expo-sqlite (SQLite, WAL) via a repository abstraction

## Project Structure

```
mobile/
├── app/                    # expo-router pages (file-based routing)
│   ├── _layout.tsx         # Root stack navigator
│   ├── (tabs)/             # Tab navigation group
│   │   ├── _layout.tsx     # Tab navigator
│   │   ├── library.tsx     # Library/Home screen
│   │   ├── collections.tsx # Collections screen
│   │   ├── search.tsx      # Search screen
│   │   ├── settings.tsx    # Settings screen
│   │   └── about.tsx       # About screen
│   ├── reader.tsx          # Reader screen (full-screen modal)
│   └── _layout.tsx         # Root stack
├── components/             # Reusable UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── EmptyState.tsx
│   ├── Styles.ts
│   └── index.ts
├── hooks/                  # Custom React hooks
│   ├── useBooks.ts
│   └── index.ts
├── models/                 # Domain models (TypeScript interfaces)
│   └── Book.ts
├── repositories/           # Data layer abstraction
│   ├── BookRepository.ts   # Repository interface
│   ├── SQLiteBookRepository.ts  # SQLite persistence implementation
│   └── index.ts
├── theme/                  # Design system
│   ├── Colors.ts           # Color tokens (dark/light)
│   ├── Tokens.ts           # Spacing, typography, shadows
│   ├── Theme.ts            # Theme hook
│   ├── ThemeContext.tsx    # React context for theme
│   └── index.ts
├── types/                  # Shared type definitions
├── utils/                  # Utility functions
├── assets/                 # Static assets
├── App.tsx                 # Root component
├── index.ts                # Entry point
├── package.json
├── tsconfig.json
└── ANDROID_ARCHITECTURE.md # This file
```

## Navigation Structure

```
App (Stack)
├── (tabs) - Tab Navigation
│   ├── library      - Home/Library screen
│   ├── collections  - Collections management
│   ├── search       - Full-text search
│   ├── settings     - App settings
│   └── about        - About/credits/license
└── reader           - Full-screen reader modal
```

The reader is opened as a full-screen modal from any book interaction, not as a permanent tab.

## Domain Models

Defined in `models/Book.ts`:
- **Book** - Core book entity with metadata, progress, favorites, collections
- **Collection** - User-created book groupings
- **Bookmark** - Reading position markers
- **Highlight** - Text highlights with colors
- **Note** - User notes attached to positions
- **ReadingProgress** - Detailed progress tracking

## Repository Abstraction

`BookRepository` interface (`repositories/BookRepository.ts`) defines the data contract:
- Schema, indexes and pragmas defined in `initSchema`
- Includes data export/import for backup/restore

Hook `useBooks` (`hooks/useBooks.ts`) and `useLibraryStore` (`state/libraryStore.ts`) provide React-friendly access to the repository and library state.

## Design System

Centralized in `theme/`:
- **Colors.ts** - Dark/light color tokens (Lirune charcoal/off-white/accent palette)
- **Tokens.ts** - Spacing, border radius, typography, shadows, breakpoints
- **Theme.ts** - `useTheme()` hook for accessing tokens
- **ThemeContext.tsx** - React context for theme switching

Palette (from Windows desktop):
- Dark: `#1A1A1D` background, `#C9B8FF` accent
- Light: `#F8F8F5` background, `#7C5CFF` accent
- Reader: `#1C1C20` / `#FBFAF5` backgrounds

## Components

Reusable components in `components/`:
- **Button** - Primary, secondary, outline, ghost, destructive variants
- **Card** - Default, elevated, outlined variants with padding options
- **EmptyState** - Reusable empty states (Library, Collections, Search, etc.)
- **Styles** - Global StyleSheet utilities and theme hook
- **reader/** - Multi-format reader components (`EpubReaderView`, `PdfReaderView`, `TxtReaderView`, `HtmlReaderView`, `Fb2ReaderView`, `CbzReaderView`)

## Screens

### Library (Home)
- Grid/list view with lazy loading
- Search, filter, sort, collection filtering
- Empty state with import action
- Continue reading card

### Collections
- List/create/delete collections
- Add/remove books from collections
- Empty state

### Search
- Real-time search with debounce
- Results grid
- Empty state for no results

### Settings
- Theme selection (dark/light/system)
- Reader preferences (font, size, spacing, margins)
- Backup / restore library data (JSON export/import)
- Storage usage reporting
- Navigation link to About screen
- Danger zone (clear all data)

### About
- Version info (4.0.4)
- Description and privacy guarantee
- Feature list
- Links (GitHub, issues, privacy, licenses)
- Top bar with back navigation to Settings

### Reader
- Multi-format book viewer:
  - **EPUB**: Rendered via Foliate/epubjs WebView bridge with pagination, scrolling, and theme injection.
  - **PDF**: Rendered via embedded pdf.js in WebView.
  - **TXT**: Chunk-indexed reader with windowed virtualization for fast rendering of large files.
  - **HTML**: Rendered via sanitized WebView.
  - **FB2**: XML parsed and rendered via WebView.
  - **CBZ**: Extracted comic archives rendered natively via Image / FlatList.
- Reading progress tracking and persistent position restore.
- Highlights:
  - Supported for web-rendered formats (**EPUB**, **HTML**, **FB2**) via WebView JavaScript text selection bridge.
  - Documented limitation: Native-rendered formats (**TXT**, **PDF**, **CBZ**) do not support custom text selection highlight creation because React Native's `Text.onSelectionChange` is iOS-only.

## Data Flow

```
User Action → Zustand Store / Hooks → SQLiteBookRepository → expo-sqlite (Disk)
                                    ↓
                            React State Update
                                    ↓
                               UI Re-render
```

## Relationship to Windows Desktop

- **Windows** (`lirune-store-home`): Primary product, Electron + epub.js, NSIS/MSIX packaging
- **Android** (`android`): Mobile edition, Expo SDK 57 / React Native 0.86
- Shared concepts: domain models, repository pattern, design tokens, feature set
- Strictly offline, privacy-first, zero telemetry

## Build Configuration

- **Package**: `com.lirune.reader`
- **Version**: 4.0.4 (matches desktop release)
- **Target SDK**: Android 35 / 36 (JDK 17, NDK 27.1)
- **Architectures**: x86_64, arm64-v8a

## Testing & Quality Assurance

```bash
npm run test           # Unit & regression tests (node --test)
npm run typecheck      # TypeScript compilation check (tsc --noEmit)
npm run lint           # ESLint validation
```

## Accessibility

- Content descriptions on all icons/buttons
- Semantic roles (button, link, heading)
- Color contrast meets WCAG AA
- System font scaling supported
- Touch targets ≥ 48dp
- Screen reader labels on all interactive elements

---

*Lirune Reader Android (v4.0.4) — 100% Private, Offline-First Mobile Companion.*