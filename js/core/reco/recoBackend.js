import { RECO_API_BASE_URL } from "../../config.js";

/**
 * Single source of truth for the reco / taste-engine backend host — mirrors
 * com.nuvio.tv.core.reco.RecoBackend on Android (NuvioTV) so this build "behaves exactly
 * like" the Android TV box: same backend, same built-in catalog-addon, same gating.
 *
 * The built-in host is `RECO_API_BASE_URL` (from local.properties, baked in at build time
 * via scripts/envProperties.mjs — see js/config.js). There is no runtime override UI here
 * (Android's "Backend URL" Advanced-settings override + BackendBaseUrlDataStore has no
 * equivalent in this build); baseUrl is fixed for the life of the installed app.
 *
 * Everything below derives from baseUrl — do not hardcode a reco host anywhere else.
 */
function normalizeBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export const baseUrl = normalizeBaseUrl(RECO_API_BASE_URL);
export const host = hostOf(baseUrl);

/** Canonical built-in catalog-addon URL served by the backend (no trailing slash). */
export const catalogAddonUrl = baseUrl ? `${baseUrl}/catalog-addon` : "";

/** Catalog-addon base WITH trailing slash — the form the manifest/stream/meta fetches expect. */
export const catalogAddonBaseUrl = baseUrl ? `${baseUrl}/catalog-addon/` : "";

/** Manifest URL for the built-in catalog-addon — what gets injected into the addon list. */
export const catalogAddonManifestUrl = catalogAddonBaseUrl
  ? `${catalogAddonBaseUrl}manifest.json`
  : "";

export const RecoBackend = {
  baseUrl,
  host,
  catalogAddonUrl,
  catalogAddonBaseUrl,
  catalogAddonManifestUrl
};
