import { AuthManager } from "../auth/authManager.js";
import { AuthState } from "../auth/authState.js";
import { SessionStore } from "../storage/sessionStore.js";
import { baseUrl as recoBaseUrl } from "../reco/recoBackend.js";

/**
 * Feature availability keys returned by the backend `/api/me` `features` map —
 * mirrors com.nuvio.tv.core.feature.FeatureKeys on Android (NuvioTV).
 */
export const FeatureKeys = {
  PERSONALIZATION: "personalization",
  STREAM_PROVIDERS: "stream_providers",
  CATALOGS: "catalogs",
  CONNECTED_DEVICES: "connected_devices"
};

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload || typeof atob !== "function") {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Merges `features` + `feature_status` the same way Android's MeInfo.effectiveFeatures
 * does: a key is available only when its boolean flag is not false AND it is not
 * locked_by_admin. Fail-open: a key absent from both maps is available.
 */
function effectiveFeatures(me) {
  const features = me?.features && typeof me.features === "object" ? me.features : {};
  const featureStatus =
    me?.feature_status && typeof me.feature_status === "object" ? me.feature_status : {};
  const keys = new Set([...Object.keys(features), ...Object.keys(featureStatus)]);
  const result = {};
  keys.forEach((key) => {
    const flag = features[key] ?? true;
    const status = featureStatus[key];
    const statusAvailable = status ? Boolean(status.available) && !status.locked_by_admin : true;
    result[key] = Boolean(flag) && statusAvailable;
  });
  return result;
}

/**
 * Holds the per-feature AVAILABILITY map resolved from the super admin's kill switches,
 * fetched from `GET {RECO_API_BASE_URL}/api/me/{userId}` — mirrors
 * com.nuvio.tv.core.feature.FeatureAvailabilityManager on Android (NuvioTV).
 *
 * Timing: refreshes on app load (when an authenticated session appears, via
 * AuthManager.subscribe) and whenever the caller explicitly calls refresh() (e.g. on
 * profile switch, from app.js's enterWithLastProfile). No periodic polling.
 *
 * Fail-open: an empty/missing map (default state, or a failed/erroring call) means
 * every feature is available. Unknown keys are also treated as available.
 */
class FeatureAvailabilityManagerClass {
  constructor() {
    this.featuresMap = {};
    this.requireOwnTorboxKey = false;
    this.listeners = new Set();
    this.lastUserId = null;

    AuthManager.subscribe((state) => {
      if (state === AuthState.AUTHENTICATED) {
        this.lastUserId = decodeJwtPayload(SessionStore.accessToken)?.sub || null;
        this.refresh();
      } else {
        this.lastUserId = null;
        this.setFeatures({});
        this.requireOwnTorboxKey = false;
      }
    });
  }

  setFeatures(next) {
    this.featuresMap = next || {};
    this.listeners.forEach((listener) => listener(this.featuresMap));
  }

  /** Observable availability map. Empty = all available (fail-open). */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.featuresMap);
    return () => this.listeners.delete(listener);
  }

  /** Fail-open availability check: missing/unknown key → available. */
  isAvailable(key) {
    return this.featuresMap[key] ?? true;
  }

  /** Re-fetches /api/me and updates the availability map. Safe to call repeatedly. */
  async refresh() {
    const token = SessionStore.accessToken;
    const userId = this.lastUserId || decodeJwtPayload(token)?.sub;
    if (!token || !userId || !recoBaseUrl) {
      return;
    }
    try {
      const response = await fetch(`${recoBaseUrl}/api/me/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        return; // keep prior state / fail-open default
      }
      const me = await response.json();
      this.setFeatures(effectiveFeatures(me));
      this.requireOwnTorboxKey = Boolean(me?.require_own_torbox_key);
    } catch (error) {
      console.warn("[FeatureAvailability] refresh failed", error);
      // keep prior state / fail-open default
    }
  }
}

export const FeatureAvailabilityManager = new FeatureAvailabilityManagerClass();
