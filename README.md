# MUSIC OS – Your Personal Music Lounge 🌌

A premium, responsive dark glassmorphism music lounge web application with an aurora-borealis dynamic theme, smooth micro-interactions, drag-to-seek audio playback, synced lyrics, real-time IST greetings, live statistics, and YouTube Data API search integration.

---

## 🚀 Quick Start & How to Run

No build tools, bundlers, or package installations are required!

### Option 1: Direct Browser Launch
Simply open `index.html` in your favorite web browser (Chrome, Edge, Firefox, Safari).

### Option 2: Live Server (Recommended for ES Modules)
If running via a local server (e.g. VS Code Live Server, Python HTTP server, or `npx serve`):
```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .
```
Then visit `http://localhost:8000` in your browser.

---

## 📁 Project Structure

```
my_music_webApp/
├── .env                        # Environment variables (YouTube API Key)
├── .env.local                  # Local overrides (git-ignored)
├── .env.example                # Template for environment configuration
├── .gitignore                  # Protection preventing .env from being committed
├── index.html                  # Master HTML5 document & glass layout structure
├── css/
│   ├── variables.css           # Design tokens, fonts, and 8 color themes
│   ├── base.css                # Resets, CSS grid, and dynamic Aurora SVG landscape
│   ├── sidebar.css             # Left navigation, playlist shortcuts & user profile card
│   ├── topbar.css              # Search box, source pills & quick theme toggle
│   ├── hero.css                # Realtime IST greeting & continue listening card
│   ├── stats.css               # Live calculated stats cards (listening mins, counts)
│   ├── playlists.css           # Playlists cards grid with hover-lift & play triggers
│   ├── recently-played.css     # Track cards, mini-equalizers & like toggles
│   ├── right-panel.css         # 2x4 Themes Studio & tabbed Queue/Lyrics container
│   ├── player-bar.css          # Bottom fixed audio bar, drag-to-seek & volume controls
│   └── responsive.css          # Tablet & mobile responsive slide-over drawers
├── js/
│   ├── config.js               # Environment config loader (.env / localStorage / server)
│   ├── main.js                 # App init, global keyboard shortcuts & wiring
│   ├── data.js                 # State store, songs, playlists, stats & store helpers
│   ├── player.js               # Audio engine, Web Audio fallback synth, seek & volume
│   ├── ui.js                   # DOM rendering, realtime IST greeting, lyrics sync & toasts
│   ├── themes.js               # Theme engine (8 themes) with dynamic background swapper
│   ├── search.js               # Live local filtering & YouTube Data API v3 integration
│   └── sidebar.js              # Nav routing & mobile drawer controllers
└── README.md                   # Project documentation & usage instructions
```

---

## ✨ Key Features

1. **Aurora-Borealis Glassmorphism Interface**
   - Pure CSS & SVG layered background featuring cosmic aurora glow, stars, drifting streaks, and mountain silhouettes.
   - Glassmorphism panels with `backdrop-filter: blur(18px)`, soft purple glow shadows, and 1px translucent borders.

2. **8 Switchable Themes**
   - **Aurora** (Default mystic purple & emerald glow)
   - **Ocean** (Deep abyssal aqua & bioluminescence)
   - **Sunset** (Warm coral & dusky violet)
   - **Cyberpunk** (High-voltage neon pink & cyan)
   - **Forest** (Emerald mist & pine canopy)
   - **Space** (Deep cosmic void & nebula)
   - **AMOLED** (True deep black)
   - **Minimal** (Sleek titanium monochrome glass)

3. **Real-time India Standard Time (IST) Greeting**
   - Greeting dynamically evaluates the current hour in IST (`Asia/Kolkata`):
     - `Good Morning` (04:00 – 11:59)
     - `Good Afternoon` (12:00 – 16:59)
     - `Good Evening` (17:00 – 20:59)
     - `Good Night` (21:00 – 03:59)

4. **Guaranteed Audible Audio & Drag-to-Seek Controls**
   - HTML5 Audio playback with Web Audio Synthesizer fallback ensures sound is always audible even if external URLs are unreachable.
   - Forward or rewind by smoothly dragging or clicking anywhere on the progress bar.
   - Animated mini-equalizer bars on currently playing songs.

5. **Live Calculated Stats (Not Hardcoded)**
   - Real-time tracking of total listening minutes (increments live as songs play).
   - Dynamic counts of total library tracks, playlists, and favorite songs.

6. **YouTube Data API Integration**
   - Search songs directly via YouTube API
   - Source pills for YouTube, Spotify, Local, and Amazon.

7. **Synchronized Scrolling Lyrics**
   - Live lyrics highlighted and smoothly auto-scrolled in sync with track playback.

8. **Keyboard Shortcuts**
   - `Space`: Play / Pause
   - `Arrow Left` / `Arrow Right`: Previous / Next track
   - `Arrow Up` / `Arrow Down`: Volume up / down
   - `L`: Toggle Like / Favorite
   - `M`: Toggle Mute

9. **Fully Responsive Layout**
   - Desktop 3-column CSS Grid (`240px | 1fr | 330px`).
   - Below `1200px`: Right panel converts to a smooth slide-over drawer.
   - Below `800px`: Left sidebar collapses into a mobile slide drawer with hamburger toggle.
