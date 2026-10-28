// Persistence boundary. The app only talks to this interface, so a server or
// sync backend can replace localStorage later without touching UI or core logic.
import { emptyState, normalizeState } from './core.js';

const KEY = 'finance-hub.v1';

export const store = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalizeState(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};
