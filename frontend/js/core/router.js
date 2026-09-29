/**
 * core/router.js — Simple hash-based SPA router with role guards.
 *
 * Usage:
 *   import { router } from './router.js';
 *
 *   router.register('#/dashboard', renderDashboard, ['admin', 'employee']);
 *   router.register('#/queue',     renderQueue,     ['admin', 'employee']);
 *   router.register('#/clients',   renderClients,   ['admin']);
 *   router.start();
 *
 * Navigation:
 *   router.navigate('#/queue');
 *   // or just: window.location.hash = '#/queue';
 */

import { getCurrentUser } from './auth.js';
import { toast } from './ui.js';

class Router {
  #routes = new Map();   // hash → { handler, allowedRoles }
  #currentHash = null;

  /**
   * Register a route.
   * @param {string}   hash         — e.g. '#/dashboard'
   * @param {Function} handler      — called with no args when route activates
   * @param {string[]} allowedRoles — which roles can access this route
   */
  register(hash, handler, allowedRoles = []) {
    this.#routes.set(hash, { handler, allowedRoles });
  }

  navigate(hash) {
    window.location.hash = hash;
  }

  start(defaultHash = null) {
    window.addEventListener('hashchange', () => this.#resolve());
    this.#resolve(defaultHash);
  }

  #resolve(fallback = null) {
    const hash = window.location.hash || fallback;
    const user  = getCurrentUser();

    // Not logged in → go to login
    if (!user) {
      window.location.href = '/index.html';
      return;
    }

    // Force password change before accessing anything else
    if (user.force_pw_change && hash !== '#/change-password') {
      window.location.hash = '#/change-password';
      return;
    }

    const route = this.#routes.get(hash);

    if (!route) {
      // Unknown route → use first registered route as default
      const firstHash = this.#routes.keys().next().value;
      if (firstHash) this.navigate(firstHash);
      return;
    }

    // Role check
    if (route.allowedRoles.length > 0 && !route.allowedRoles.includes(user.role)) {
      toast.error('You do not have access to this section.');
      const firstHash = this.#routes.keys().next().value;
      if (firstHash) this.navigate(firstHash);
      return;
    }

    this.#currentHash = hash;
    this.#updateActiveNav(hash);
    route.handler();
  }

  #updateActiveNav(hash) {
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === hash);
    });
  }
}

export const router = new Router();
