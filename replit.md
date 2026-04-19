# COUNT DOWN STUDIO

## Overview
A concert countdown timer app connected to MIDI (branded as "COUNT DOWN STUDIO", logo: purple rounded square with "CD"). When MIDI data is received from a connected device, the app automatically starts counting down the remaining time for each song. Designed for live concert use. Works fully offline as a PWA (Progressive Web App). UI style matches sister app "TELOP STUDIO".

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (minimal: button, toast, tooltip, select only)
- **Storage**: IndexedDB (browser-local, via `idb` library) - no server-side database needed
- **Backend**: Express.js serves static files only (no API endpoints used at runtime)
- **MIDI**: Web MIDI API (browser-based, Chrome/Edge only)
- **PWA**: Service Worker + manifest.json for offline support and installability

## Key Features
- Setlist management with song duration, START/END time range, and MIDI note mapping
- Inline editing with drag-and-drop reordering (shared SongRow component)
- Dark theme optimized for concert environments
- Fully offline PWA - installable as a standalone app
- JSON/SCD export/import for setlist backup (drag & drop import supported)
- Japanese IME composition handling for text input (3-layer guard: isComposing + keyCode 229 + compositionRef with timeout)
- Full-width/half-width character auto-conversion for time inputs
- External output window for projector/second monitor (via localStorage sync, fixed window name prevents duplicates)
- Concert Title editable on setlist page
- Tab-style navigation (ModeTabBar) with SET LIST tab + 2ND MONI ON/OFF controls
- Four item types: SONG (fuchsia, countdown), EVENT/SPECIAL (yellow, countdown), MC (sky-blue, count-up), ENCORE (green, count-up with MIDI)
- MC (emcee) items count UP instead of down, useful for tracking MC/talk time between songs
- ENCORE items count UP like MC, but support MIDI triggering and show title; abbreviated "EN" in setlist
- MC and ENCORE items are NOT counted in song numbering (numbering skips MC, EVENT, and ENCORE items)
- Add buttons display as "ADD\nSONG", "ADD\nSPECIAL", "ADD\nMC" (all caps, line break after ADD)
- EVENT is labeled "SPECIAL" in UI buttons (AddSpecialButton component)
- X-TIME mode for songs without countdown (green display)
- DOOR OPEN / SHOW TIME / REHEARSAL fields per setlist, with INFO display on external output window showing current time, concert title, rehearsal, door open, show time in stage-optimized style
- Countdown display on output window (16:9 design canvas scaled to fit)

## Key Components
- `client/src/components/countdown-display.tsx` - Main countdown display (16:9 design, scaled rendering, used by output window)
- `client/src/components/song-row.tsx` - Song table row for setlist editing
- `client/src/components/styled-input.tsx` - Reusable styled input components (StyledInput, TimeInput, StyledSelect, useIMEGuard)
- `client/src/components/mode-tab-bar.tsx` - Tab bar with SET LIST tab + 2ND MONI ON/OFF controls
- `client/src/components/event-info-display.tsx` - Event info overlay (current time, concert title, door open, show time)

## Data Layer
- All data stored in IndexedDB (`songcountdown` database)
- `client/src/lib/local-db.ts` - IndexedDB CRUD operations (includes restoreSong/restoreSetlist for undo)
- `client/src/hooks/use-local-data.ts` - React hooks wrapping IndexedDB with TanStack Query (all mutations push undo snapshots)
- `client/src/lib/undo-manager.ts` - Undo stack manager (snapshots full setlist+songs state before each mutation)
- `client/src/hooks/use-undo.ts` - Cmd+Z / Ctrl+Z keyboard listener for undo
- `client/src/lib/time-utils.ts` - Shared constants (fonts, colors, styles) and time parsing utilities
- No server API calls needed for data operations
- Undo: Cmd+Z (Mac) / Ctrl+Z (Win) reverts last edit, supports up to 30 steps, 500ms dedup for auto-propagation

## Pages
- `/` - Home page (setlist list, create/delete/duplicate setlists)
- `/manage` - Setlist and song management (main editing page, with home button in navigation)
- `/output` - External output window (standalone countdown display for projector/second monitor)

## IndexedDB Schema
- `setlists` store: id (auto), name, description, isActive, doorOpen, showTime, rehearsal
- `songs` store: id (auto), setlistId, title, nextTitle, artist, durationSeconds, orderIndex, midiNote, midiChannel, timeRange, isEvent, isMC, xTime, subTimerSeconds
  - Index: `bySetlist` on setlistId
  - `isEvent`: boolean flag for EVENT items (yellow theme, countdown)
  - `isMC`: boolean flag for MC items (sky-blue theme, count-up timer)
  - `isEncore`: boolean flag for ENCORE items (green theme, count-up timer with MIDI support)
  - `xTime`: boolean flag for X-TIME mode (no countdown, green display)
  - `subTimerSeconds`: number, secondary timer duration in seconds (e.g. costume change timer, starts with song)

## Font
- Timer: Bebas Neue (Impact-style bold)
- Titles: Noto Sans JP + Inter
- Code/Status: JetBrains Mono

## PWA
- `client/public/manifest.json` - App manifest
- `client/public/sw.js` - Service Worker (cache-first with network-first for navigation)
- Icons: icon-192.png, icon-512.png
- Version: v26

## User Preferences
- Text sizes must NEVER be changed (strictly enforced)
- Setlist page: Always use desktop/PC layout (table view). Card layout is for mobile only.
- Mobile card layout exists in MobileSongCard but `useCardLayout` must be `deviceType === "mobile"` only (not tablet)
