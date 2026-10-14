import { AuthManager } from "../auth/authManager.js";
import { AuthState } from "../auth/authState.js";
import { catalogAddonBaseUrl } from "../reco/recoBackend.js";
import { httpRequest } from "../network/httpClient.js";

const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Mirrors com.nuvio.tv.core.debrid.SharedTorboxKeyService on Android: fetches and
 * caches the shared TorBox API key from our own catalog-addon backend
 * (`GET {catalogAddonBaseUrl}torbox-key`), so an authenticated account can resolve
 * our backend's clientResolve-tagged streams without configuring any debrid key of
 * its own. The user's own TorBox key (if ever set) always takes priority — this is
 * purely a fallback, consulted only when that field is blank.
 */
class SharedTorboxKeyServiceClass {
  constructor() {
    this.cachedKey = null;
    this.cachedAtMs = 0;
    this.inFlight = null;

    AuthManager.subscribe((state) => {
      if (state === AuthState.AUTHENTICATED) {
        void this.getKey().catch(() => null);
      } else {
        this.invalidate();
      }
    });
  }

  isConfigured() {
    return Boolean(catalogAddonBaseUrl);
  }

  /** Synchronous read of the last successfully fetched key, or null if stale/absent. */
  getCachedKeySync() {
    if (!this.cachedKey) {
      return null;
    }
    const age = Date.now() - this.cachedAtMs;
    return age >= 0 && age <= CACHE_TTL_MS ? this.cachedKey : null;
  }

  invalidate() {
    this.cachedKey = null;
    this.cachedAtMs = 0;
  }

  /** Fetches (or returns the cached) shared key. Null if unavailable. Safe to call repeatedly. */
  async getKey() {
    const cached = this.getCachedKeySync();
    if (cached) {
      return cached;
    }
    if (!this.isConfigured() || !AuthManager.isAuthenticated) {
      return null;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = (async () => {
      try {
        const result = await httpRequest(`${catalogAddonBaseUrl}torbox-key`, { method: "GET" });
        const key = String(result?.key || "").trim();
        if (!key) {
          return null;
        }
        this.cachedKey = key;
        this.cachedAtMs = Date.now();
        return key;
      } catch (error) {
        console.warn("[SharedTorboxKeyService] fetch failed", error);
        return null;
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }
}

export const SharedTorboxKeyService = new SharedTorboxKeyServiceClass();
