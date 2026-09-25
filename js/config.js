/* ==========================================================================
   MUSIC OS - Environment Configuration Loader
   Safely manages API keys and runtime variables from .env or localStorage
   ========================================================================== */

class MusicOSEnvironment {
  constructor() {
    this.env = {
      YOUTUBE_API_KEY: ""
    };
    this.loaded = false;
  }

  /**
   * Initializes environment configuration by trying multiple secure sources:
   * 1. window.__ENV__ (injected by backend server if present)
   * 2. localStorage (user custom key override)
   * 3. Asynchronously fetching local .env / .env.local file
   */
  async init() {
    // 1. Check window.__ENV__
    if (typeof window !== "undefined" && window.__ENV__) {
      Object.assign(this.env, window.__ENV__);
    }

    // 2. Check localStorage custom override
    const storedKey = localStorage.getItem("YOUTUBE_API_KEY");
    if (storedKey) {
      this.env.YOUTUBE_API_KEY = storedKey;
    }

    // 3. Attempt to fetch local .env or .env.local file (supported on local servers)
    if (!this.env.YOUTUBE_API_KEY) {
      await this.loadFromEnvFiles();
    }

    this.loaded = true;
    return this.env;
  }

  async loadFromEnvFiles() {
    const filesToTry = ['.env.local', '.env'];
    for (const file of filesToTry) {
      try {
        const response = await fetch(file);
        if (response.ok) {
          const text = await response.text();
          this.parseEnvText(text);
          if (this.env.YOUTUBE_API_KEY) {
            break;
          }
        }
      } catch {
        // Silent catch when running via raw file:// protocol or if server blocks .env
      }
    }
  }

  parseEnvText(text) {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex !== -1) {
        const key = trimmed.substring(0, equalsIndex).trim();
        let val = trimmed.substring(equalsIndex + 1).trim();
        // Remove surrounding quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key) {
          this.env[key] = val;
        }
      }
    }
  }

  get(key, defaultValue = "") {
    return this.env[key] || defaultValue;
  }

  set(key, value) {
    this.env[key] = value;
    localStorage.setItem(key, value);
  }
}

export const envConfig = new MusicOSEnvironment();
