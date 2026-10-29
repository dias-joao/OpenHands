/**
 * The size ceilings applied to chat attachments (images and files), in MiB.
 *
 * The limits have to be adjustable because the right value depends on the
 * deployment: the agent-server imposes no size limit of its own, so these
 * frontend checks are the only thing standing between a user and a
 * multi-hundred-megabyte upload over a slow link.
 *
 * Sources, in order — mirroring `getAgentCanvasBasePath` in `base-path.ts`:
 *   1. `VITE_MAX_ATTACHMENT_FILE_MB` / `VITE_MAX_ATTACHMENT_TOTAL_MB` (or the
 *      combined `VITE_MAX_ATTACHMENT_SIZE_MB`) — baked in at build time, for
 *      deployments that build their own bundle.
 *   2. `window.__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__` /
 *      `window.__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__` — injected into
 *      index.html at serve time by `scripts/static-server.mjs`, so the Docker
 *      image and the published binary can be retuned without a rebuild.
 *
 * A value that is missing, non-numeric, or not positive falls back to the
 * default rather than disabling the check, so a typo in a deployment's
 * configuration cannot silently remove the limit.
 */

const MAX_ATTACHMENT_FILE_MB_WINDOW_KEY =
  "__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__";
const MAX_ATTACHMENT_TOTAL_MB_WINDOW_KEY =
  "__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__";
const MAX_ATTACHMENT_SIZE_MB_WINDOW_KEY =
  "__AGENT_CANVAS_MAX_ATTACHMENT_SIZE_MB__";

/** Default ceiling for a single attachment. */
export const DEFAULT_MAX_ATTACHMENT_FILE_MB = 200;

/** Default ceiling for a selection of attachments combined. */
export const DEFAULT_MAX_ATTACHMENT_TOTAL_MB = 200;

/**
 * Ceiling for an image that is embedded in the message rather than uploaded
 * as a workspace file.
 *
 * Embedded images are base64-encoded and sent as a WebSocket frame, which the
 * SDK caps at 4 MiB (`MAX_FRAME_BYTES`). Base64 inflates by ~4/3, so a 3 MiB
 * image becomes ~4.1 MiB and would be dropped in flight. This cap is
 * therefore fixed and independent of the configurable upload ceilings.
 */
export const MAX_EMBEDDED_IMAGE_SIZE_MB = 3;

const BYTES_PER_MB = 1024 * 1024;

/**
 * Parse a configured MiB value into a byte ceiling.
 *
 * Returns `null` for anything that is not a positive finite number, which
 * leaves the default in place.
 */
function parseSizeMb(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

/**
 * Read a MiB value from the runtime global injected by the static server.
 */
function readWindowMb(windowKey: string): number | null {
  if (typeof window === "undefined") return null;

  const injected = (window as unknown as Record<string, unknown>)[windowKey];
  return parseSizeMb(injected);
}

/**
 * The configured per-file ceiling in MiB, or `null` when unset or invalid.
 *
 * Build-time values win over runtime ones, and within each source the
 * per-file setting wins over the shared one, so an operator can narrow one
 * limit without restating the other.
 */
export function getConfiguredMaxAttachmentFileMb(): number | null {
  const buildTime =
    parseSizeMb(import.meta.env.VITE_MAX_ATTACHMENT_FILE_MB) ??
    parseSizeMb(import.meta.env.VITE_MAX_ATTACHMENT_SIZE_MB);
  if (buildTime !== null) return buildTime;

  return (
    readWindowMb(MAX_ATTACHMENT_FILE_MB_WINDOW_KEY) ??
    readWindowMb(MAX_ATTACHMENT_SIZE_MB_WINDOW_KEY)
  );
}

/**
 * The configured combined-selection ceiling in MiB, or `null` when unset or
 * invalid.
 */
export function getConfiguredMaxAttachmentTotalMb(): number | null {
  const buildTime =
    parseSizeMb(import.meta.env.VITE_MAX_ATTACHMENT_TOTAL_MB) ??
    parseSizeMb(import.meta.env.VITE_MAX_ATTACHMENT_SIZE_MB);
  if (buildTime !== null) return buildTime;

  return (
    readWindowMb(MAX_ATTACHMENT_TOTAL_MB_WINDOW_KEY) ??
    readWindowMb(MAX_ATTACHMENT_SIZE_MB_WINDOW_KEY)
  );
}

/**
 * The per-file attachment ceiling in bytes.
 */
export function getMaxAttachmentFileSizeBytes(): number {
  const sizeMb =
    getConfiguredMaxAttachmentFileMb() ?? DEFAULT_MAX_ATTACHMENT_FILE_MB;
  return Math.floor(sizeMb * BYTES_PER_MB);
}

/**
 * The combined-selection attachment ceiling in bytes.
 */
export function getMaxAttachmentTotalSizeBytes(): number {
  const sizeMb =
    getConfiguredMaxAttachmentTotalMb() ?? DEFAULT_MAX_ATTACHMENT_TOTAL_MB;
  return Math.floor(sizeMb * BYTES_PER_MB);
}

/**
 * The embedded-image ceiling in bytes.
 */
export function getMaxEmbeddedImageSizeBytes(): number {
  return Math.floor(MAX_EMBEDDED_IMAGE_SIZE_MB * BYTES_PER_MB);
}
