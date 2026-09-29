/**
 * core/store.js — Lightweight reactive state store (pub/sub pattern)
 *
 * Usage:
 *   import { store } from './store.js';
 *
 *   // Set state and notify all subscribers
 *   store.set('balance', { total: 196000, withdrawable: 196000 });
 *
 *   // Subscribe to state changes
 *   const unsub = store.subscribe('balance', (data) => renderBalance(data));
 *
 *   // Get current state without subscribing
 *   const current = store.get('balance');
 *
 *   // Unsubscribe when page unloads
 *   unsub();
 */

class Store {
  #state = new Map();
  #subscribers = new Map();

  set(key, value) {
    this.#state.set(key, value);
    const subs = this.#subscribers.get(key) || [];
    subs.forEach(cb => {
      try { cb(value); }
      catch (e) { console.error(`[Store] Subscriber error for key "${key}":`, e); }
    });
  }

  get(key) {
    return this.#state.get(key);
  }

  /**
   * Subscribe to state changes for a given key.
   * @returns {Function} unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.#subscribers.has(key)) {
      this.#subscribers.set(key, []);
    }
    this.#subscribers.get(key).push(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.#subscribers.get(key) || [];
      const idx = subs.indexOf(callback);
      if (idx !== -1) subs.splice(idx, 1);
    };
  }

  /** Reset all state (call on logout) */
  clear() {
    this.#state.clear();
    // Don't clear subscribers — page modules may stay subscribed
  }
}

export const store = new Store();
