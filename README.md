# MUSIC OS – Your Personal Music Lounge 🌌

A modern, high-performance dark glassmorphism music web application built with vanilla JavaScript (ES Modules), HTML5, and CSS3. MUSIC OS features official YouTube IFrame playback, local HTML5 audio streaming, synchronized click-to-seek lyrics, full playlist management, photographic theme landscapes, a 5-band audio equalizer, real-time listening analytics, and a multi-view global search engine.

---

## 🚀 Quick Start & How to Run

MUSIC OS runs entirely in standard modern web browsers without any build steps, bundlers, or heavy framework dependencies.

### 1. Launch with a Local HTTP Server

Because the application uses native ES Modules (`import`/`export`) and fetches local assets, it must be served over an HTTP/HTTPS server:

```bash
# Option A: Node.js (via npx http-server)
npx -y http-server . -p 8080 -c-1

# Option B: Python 3
python -m http.server 8080

# Option C: VS Code Live Server extension
# Right-click 'index.html' and select 'Open with Live Server'
```

Open **`http://localhost:8080`** in your browser.

---

### 2. Environment Configuration (YouTube Search API)

The curated YouTube catalog plays immediately via the embedded YouTube IFrame API without requiring an API key. To enable live YouTube catalog search across millions of tracks:

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Add your Google Cloud YouTube Data API v3 key:
   ```env
   YOUTUBE_API_KEY=your_actual_api_key_here
   ```

*The application automatically loads keys from `.env.local`, `.env`, `localStorage`, or `window.__ENV__` via `js/config.js`.*

---

## 📁 Project Architecture & File Tree

```
my_music_webApp/
├── .env                          # Default environment variable configuration
├── .env.example                  # Template environment file
├── .env.local                    # Local environment overrides (git-ignored)
├── .gitignore                    # Git ignore file
├── index.html                    # Main application HTML5 shell and glass layout
├── assets/
│   └── backgrounds/              # High-resolution photographic theme wallpapers
│       ├── aurora.jpg            # Aurora mountain reflection wallpaper
│       ├── forest.jpg            # Bamboo forest canopy wallpaper
│       ├── ocean.jpg             # Deep abyssal aqua ocean wallpaper
│       └── sunset.jpg            # Golden glowing sunset landscape wallpaper
├── css/
│   ├── base.css                  # Layout resets, wallpaper layers, and canvas filters
│   ├── hero.css                  # Time-aware greeting, filter chips & continue listening banner
│   ├── player-bar.css            # Bottom audio bar, seek track, volume & mini-controls
│   ├── playlists.css             # Playlist grid, detail views, and Add Songs modal
│   ├── recently-played.css       # Track cards, quick play badges & track list styles
│   ├── responsive.css            # Responsive layout adjustments and mobile slide-over drawers
│   ├── right-panel.css           # Theme Studio, Audio Equalizer & Lyrics/Queue tabs
│   ├── sidebar.css               # Left navigation, library routes & playlist shortcuts
│   ├── stats.css                 # Real-time statistics cards & genre breakdown bars
│   ├── topbar.css                # Global search input, source selector pills & theme tags
│   └── variables.css             # Design tokens, color palettes, glass borders & typography
├── js/
│   ├── config.js                 # Environment config loader (.env, .env.local, localStorage)
│   ├── data.js                   # In-memory data store, default tracks, playlist CRUD, and persistence
│   ├── main.js                   # Application bootstrap, global events, and keyboard shortcuts
│   ├── player.js                 # Unified audio controller (HTML5 + YouTube + Web Audio Equalizer)
│   ├── search.js                 # Multi-view search engine, local filtering & debounced YouTube API
│   ├── sidebar.js                # Sidebar navigation, dynamic playlist rendering, and route triggers
│   ├── themes.js                 # Theme engine, wallpaper switcher, opacity & blur sliders
│   ├── ui.js                     # Main DOM renderer, view router, modals & lyrics synchronizer
│   └── youtube-player.js         # Official YouTube IFrame Player API wrapper and state bridge
└── README.md                     # Project documentation
```

---

## ✨ Core Features & Technical Highlights

### 1. Dual Audio Playback Architecture
- **Official YouTube IFrame Player API**: Streams official YouTube video audio directly with synchronized playback state (`PLAYING`, `PAUSED`, `ENDED`, `BUFFERING`), progress polling (~250ms), and volume control.
- **HTML5 Audio Engine**: Plays local and remote audio files (Blob URLs, MP3, WAV, AAC, FLAC, OGG).
- **Web Audio Fallback Synthesizer**: Built-in oscillator synthesized audio fallback guarantees playback even if remote third-party stream URLs are unreachable.
- **Unified Controls**: Interactive seekbars, volume sliders, mute toggle, shuffle mode, and repeat modes (*Off*, *Repeat All*, *Repeat One*).

### 2. 5-Band Graphic Equalizer
- **Web Audio API Biquad Filters**: 5 frequency bands: **60Hz**, **230Hz**, **910Hz**, **3.6kHz**, and **14kHz** with a range of -12dB to +12dB.
- **Sound Presets**: One-click switching between *Flat, Bass Boost, Vocal, Lo-Fi, EDM,* and *Treble*.
- **Persistence**: Equalizer settings persist automatically across browser sessions.

### 3. Synchronized Lyrics with Click-to-Seek
- **Precision Time Synchronization**: Real-time binary search algorithm identifies the active timestamped lyric line based on current playback time.
- **Auto-Scroll**: Smoothly scrolls the lyrics container to keep the current lyric line centered in view.
- **Click-to-Seek**: Clicking any lyric line instantly seeks audio playback to that exact second across both YouTube and local audio streams.
- **Multiple Display Modes**: View lyrics inside the Right Panel tab or open the draggable, minimizable **Floating Lyrics Window**.
- **Graceful Fallback**: Displays `"Lyrics unavailable"` when timestamped lyrics are not present.

### 4. Complete Playlist Management
- **Create Custom Playlists**: Create new playlists with custom titles via a modal dialog.
- **"+ Add Songs" Modal**: Multi-select track picker with live search across your library to add songs to any playlist.
- **Duplicate Prevention**: Tracks already in the playlist are clearly marked with `"✓ In Playlist"` to prevent accidental duplicates.
- **Safe Track Removal**: Removing a track from a playlist removes it only from that playlist without modifying or deleting the track from the main library.
- **Favorite Playlists**: Mark playlists with `"♡ Favorite"` / `"♥ Favorited"`; favorited playlists are highlighted in the sidebar and catalog.
- **Reactive Synchronization**: Custom `playlistschange` events keep the sidebar, playlist cards, and detail pages in sync automatically.

### 5. Unified Multi-View Global Search
- **Persistent Across All Main Views**: The top search bar is fully operational across **Home**, **Playlists**, **Albums**, **Search**, and **Library**.
- **Instant In-Memory Search**: Zero-latency local filtering across titles, artists, albums, and genres.
- **Debounced YouTube API Queries (~320ms)**: Minimizes API consumption and prevents UI stutters while typing.
- **Stale Request Cancellation**: Combines `AbortController` signal cancellation and monotonic request IDs (`latestRequestId`) to guarantee older network responses never overwrite newer search queries.
- **Source Filtering**: Filter results by source (*All*, *YouTube*, *Local*, *Spotify*, *Amazon*).

### 6. Dynamic Theme Studio & Photographic Wallpapers
- **High-Resolution Wallpapers**: Dedicated photographic landscape wallpapers (`aurora.jpg`, `ocean.jpg`, `sunset.jpg`, `forest.jpg`) in `assets/backgrounds/`.
- **8 Visual Themes**: *Aurora*, *Ocean*, *Sunset*, *Forest*, *Cyberpunk*, *Space*, *AMOLED*, and *Minimal*.
- **Live Background Customization**: Adjust **Background Opacity** (10%–100%) and **Background Blur** (0px–40px) sliders with immediate visual feedback.
- **Custom Wallpaper URLs**: Apply any custom image URL as a background wallpaper.

### 7. Music Importer
- **Import Local Files**: Add audio files directly from your computer via File API (`Blob` URL generation).
- **Import YouTube Videos**: Add tracks by pasting YouTube URLs or video IDs with automatic thumbnail generation.

### 8. Analytics & Real-Time IST Greeting
- **Time-Aware Greeting**: Automatically calculates morning, afternoon, evening, and night greetings in Indian Standard Time (`Asia/Kolkata`).
- **Live Listening Stats**: Tracks and displays listening minutes in real time, total track count, total playlists, and liked tracks.
- **Genre Distribution**: Calculates and visualizes percentage distributions across Chill, Focus, Workout, Telugu, and YouTube tracks.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Toggle Play / Pause |
| `Arrow Right` | Next Track |
| `Arrow Left` | Previous Track |
| `Arrow Up` | Increase Volume (+5%) |
| `Arrow Down` | Decrease Volume (-5%) |
| `L` | Toggle Favorite / Like on Current Track |
| `M` | Toggle Mute / Unmute |

---

## 🔒 Storage & State Persistence

All user preferences, imported tracks, playlists, and playback settings are automatically saved in the browser's `localStorage`:

| Storage Key | Description |
| :--- | :--- |
| `music_os_songs` | Imported and curated track library |
| `music_os_playlists` | User playlists, track associations, and favorite flags |
| `music_os_queue` | Current active playback queue |
| `music_os_theme` | Selected theme identifier |
| `music_os_bg_opacity` | Custom background opacity level |
| `music_os_bg_blur` | Custom background blur radius |
| `music_os_listening_seconds` | Cumulative listening time counter |
| `music_os_eq_preset` | Active equalizer preset name |

---

## 🌐 Browser Compatibility

Tested and compatible with modern evergreen browsers supporting ES Modules and the Web Audio API:
- Google Chrome / Chromium (Edge, Brave, Opera, Vivaldi)
- Mozilla Firefox
- Apple Safari
