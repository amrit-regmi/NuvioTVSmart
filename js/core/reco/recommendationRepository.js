import { baseUrl as recoBaseUrl } from "./recoBackend.js";
import { SessionStore } from "../storage/sessionStore.js";
import { ProfileManager } from "../profile/profileManager.js";
import { buildCatalogOrderKey, buildCatalogDisableKey } from "../addons/homeCatalogs.js";

/**
 * Mirrors com.nuvio.tv.ui.screens.home.HomeViewModelRecoPipeline /
 * core.reco.RecommendationRepository on Android (NuvioTV): fetches
 * GET {RECO_API_BASE_URL}/reco/for/{userId} and shapes each returned row into a
 * Home-row-compatible object (same shape fetchCatalogRows() produces for addon
 * catalogs), so the Home screen can merge it into `this.rows` like any other row.
 *
 * No `limit_per_row` query param — confirmed against the live backend handler
 * that it is ignored; row size/composition is entirely server-side config.
 */

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

function normalizeString(value) {
  return String(value ?? "").trim();
}

function resolveImagePath(path) {
  const trimmed = normalizeString(path);
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return recoBaseUrl ? `${recoBaseUrl}/image${trimmed}` : null;
}

function recoContentType(row = {}) {
  const declared = normalizeString(row.content_type).toLowerCase();
  if (declared === "movie" || declared === "movies") {
    return "movie";
  }
  if (declared === "series" || declared === "tv" || declared === "show" || declared === "shows") {
    return "series";
  }
  const counts = new Map();
  (row.items || []).forEach((item) => {
    const kind = normalizeString(item.kind).toLowerCase() || "movie";
    counts.set(kind, (counts.get(kind) || 0) + 1);
  });
  let dominant = "movie";
  let max = -1;
  counts.forEach((count, kind) => {
    if (count > max) {
      max = count;
      dominant = kind;
    }
  });
  return dominant === "series" || dominant === "tv" ? "series" : "movie";
}

function toMetaPreview(item = {}) {
  const type = normalizeString(item.kind).toLowerCase() === "series" ? "series" : "movie";
  const imdbId = normalizeString(item.imdb_id);
  const score = Number(item.score);
  return {
    id: imdbId || `tmdb:${item.tmdb_id}`,
    type,
    poster: item.poster || resolveImagePath(item.poster_path),
    background: item.backdrop || null,
    logo: resolveImagePath(item.logo_path),
    name: item.title || "Untitled",
    description: item.overview || "",
    releaseInfo: item.year != null ? String(item.year) : "",
    runtime: null,
    genres: Array.isArray(item.genres) ? item.genres : [],
    imdbRating:
      item.vote_average != null
        ? item.vote_average
        : Number.isFinite(score) && score > 0
          ? score
          : null
  };
}

function toHomeRow(row = {}, index = 0) {
  const contentType = recoContentType(row);
  const reasonType = normalizeString(row.reason_type) || "reco";
  const catalogId = `${reasonType}_${index}`;
  const cleanLabel =
    normalizeString(row.label)
      .replace(/\s*[—–-]\s*(Movies|Series)\s*$/i, "")
      .trim() ||
    normalizeString(row.label) ||
    "For You";
  return {
    addonId: "reco_engine",
    addonName: "For You",
    addonBaseUrl: recoBaseUrl,
    catalogId,
    catalogName: cleanLabel,
    type: contentType,
    apiType: contentType,
    supportsSkip: false,
    skipStep: 0,
    homeCatalogKey: buildCatalogOrderKey("reco_engine", contentType, catalogId),
    homeCatalogDisableKey: buildCatalogDisableKey(recoBaseUrl, contentType, catalogId, cleanLabel),
    result: {
      status: "success",
      data: {
        items: (row.items || []).map(toMetaPreview),
        hasMore: false
      }
    },
    loadingItems: null
  };
}

async function fetchRawRows(userId, token, profileId) {
  if (!recoBaseUrl || !token || !userId) {
    return [];
  }
  try {
    const headers = { Authorization: `Bearer ${token}` };
    if (profileId != null && profileId !== "") {
      headers["X-Profile-Id"] = String(profileId);
    }
    const response = await fetch(`${recoBaseUrl}/reco/for/${encodeURIComponent(userId)}`, {
      headers
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return Array.isArray(data?.rows) ? data.rows : [];
  } catch (error) {
    console.warn("[RecommendationRepository] fetchRows failed", error);
    return [];
  }
}

export const RecommendationRepository = {
  /** Fetches the account's recommendation rows, already shaped as Home rows. */
  async fetchHomeRows() {
    const token = SessionStore.accessToken;
    const userId = decodeJwtPayload(token)?.sub;
    if (!token || !userId) {
      return [];
    }
    const profileId = ProfileManager.getActiveProfileId();
    const rawRows = await fetchRawRows(userId, token, profileId);
    return rawRows.map((row, index) => toHomeRow(row, index));
  }
};
