/* ==========================================================================
   MUSIC OS - Supabase Authentication Controller
   Manages user sign-up, sign-in, sign-out, session lifecycle, and auth state.
   ========================================================================== */

import { getSupabase, supabase } from './supabase.js';

class MusicOSAuth {
  constructor() {
    this.state = {
      session: null,
      user: null,
      isAuthenticated: false,
      isInitialized: false
    };
    this.listeners = new Set();
  }

  /**
   * Initializes Supabase Auth, retrieves existing persisted session,
   * and sets up the onAuthStateChange subscription.
   */
  async init() {
    const client = getSupabase();
    if (!client) {
      console.warn('⚠️ [Auth] Supabase client is not available. Running in offline/guest mode.');
      this.state.isInitialized = true;
      this.notifyListeners();
      return this.state;
    }

    try {
      // 1. Fetch current persisted session
      const { data: { session }, error } = await client.auth.getSession();
      if (error) {
        console.warn('⚠️ [Auth] Error retrieving initial session:', error.message);
      }

      this.updateState(session);

      // 2. Subscribe to Supabase auth state transitions
      client.auth.onAuthStateChange((event, session) => {
        console.log(`🔐 [Auth] State transition event: "${event}"`);
        this.updateState(session);
      });
    } catch (err) {
      console.error('❌ [Auth] Unexpected initialization error:', err);
    } finally {
      this.state.isInitialized = true;
      this.notifyListeners();
    }

    return this.state;
  }

  /**
   * Internal helper to update memory state and trigger listeners.
   */
  updateState(session) {
    this.state.session = session || null;
    this.state.user = session?.user || null;
    this.state.isAuthenticated = !!(session && session.user);
    this.notifyListeners();
  }

  /**
   * Register a callback for authentication state changes.
   * Immediately calls the callback with the current state.
   * @param {Function} callback 
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      // Immediately pass current state
      callback(this.getAuthState());
    }
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    const currentState = this.getAuthState();
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[Auth] Listener callback error:', err);
      }
    }
  }

  /**
   * Returns a snapshot of the current authenticated state.
   */
  getAuthState() {
    return {
      session: this.state.session,
      user: this.state.user,
      isAuthenticated: this.state.isAuthenticated,
      isInitialized: this.state.isInitialized,
      email: this.state.user?.email || null,
      userId: this.state.user?.id || null
    };
  }

  getCurrentSession() {
    return this.state.session;
  }

  getCurrentUser() {
    return this.state.user;
  }

  isAuthenticated() {
    return this.state.isAuthenticated;
  }

  /**
   * Signs up a user with email and password.
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<{success: boolean, user?: any, session?: any, requiresConfirmation?: boolean, error?: string}>}
   */
  async signUp(email, password) {
    const client = getSupabase();
    if (!client) {
      return { success: false, error: 'Supabase client is not configured.' };
    }

    // Input Validation
    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    try {
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Check if session was created or email confirmation is pending
      const requiresConfirmation = !data.session && !!data.user;
      return {
        success: true,
        user: data.user,
        session: data.session,
        requiresConfirmation,
        message: requiresConfirmation
          ? 'Account created! Please check your email to confirm your registration.'
          : 'Account created and signed in successfully!'
      };
    } catch (err) {
      return { success: false, error: err.message || 'An unexpected error occurred during sign up.' };
    }
  }

  /**
   * Signs in a user with email and password.
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<{success: boolean, user?: any, session?: any, error?: string}>}
   */
  async signIn(email, password) {
    const client = getSupabase();
    if (!client) {
      return { success: false, error: 'Supabase client is not configured.' };
    }

    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      this.updateState(data.session);

      return {
        success: true,
        user: data.user,
        session: data.session
      };
    } catch (err) {
      return { success: false, error: err.message || 'An unexpected error occurred during sign in.' };
    }
  }

  /**
   * Signs out the current user and clears Supabase session.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async signOut() {
    const client = getSupabase();
    if (!client) {
      this.updateState(null);
      return { success: true };
    }

    try {
      const { error } = await client.auth.signOut();
      if (error) {
        console.warn('⚠️ [Auth] Sign-out warning:', error.message);
      }
      this.updateState(null);
      return { success: true };
    } catch (err) {
      this.updateState(null);
      return { success: false, error: err.message };
    }
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

export const authManager = new MusicOSAuth();
export const signUp = (email, password) => authManager.signUp(email, password);
export const signIn = (email, password) => authManager.signIn(email, password);
export const signOut = () => authManager.signOut();
export const getCurrentSession = () => authManager.getCurrentSession();
export const getCurrentUser = () => authManager.getCurrentUser();
export const getAuthState = () => authManager.getAuthState();
export const onAuthStateChange = (cb) => authManager.onAuthStateChange(cb);

// Expose on window for diagnostics
if (typeof window !== 'undefined') {
  window.authManager = authManager;
}
