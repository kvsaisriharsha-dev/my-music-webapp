/* ==========================================================================
   MUSIC OS - Environment Configuration Loader
   Safely manages API keys and runtime variables from .env or localStorage
   ========================================================================== */

class MusicOSEnvironment {
  constructor() {
    this.env = {
      YOUTUBE_API_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: ""
    };
    this.loaded = false;
  }

  /**
   * Initializes environment configuration by trying multiple secure sources:
   * 1. window.__ENV__ (injected by backend server if present)
   * 2. Local .env / .env.local files (supported on local web servers)
   * 3. localStorage (user custom key override)
   */
  async init() {
    // 1. Check window.__ENV__
    if (typeof window !== "undefined" && window.__ENV__) {
      Object.assign(this.env, window.__ENV__);
    }

    // 2. Fetch local .env and .env.local files (.env.local overrides .env)
    await this.loadFromEnvFiles();

    // 3. Check localStorage custom overrides (highest browser priority)
    const configKeys = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
    for (const key of configKeys) {
      const storedVal = localStorage.getItem(key);
      if (storedVal) {
        this.env[key] = storedVal;
      }
    }

    this.loaded = true;
    return this.env;
  }

  async loadFromEnvFiles() {
    const filesToTry = ['.env', '.env.local'];
    for (const file of filesToTry) {
      try {
        const response = await fetch(file);
        if (response.ok) {
          const text = await response.text();
          this.parseEnvText(text);
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
