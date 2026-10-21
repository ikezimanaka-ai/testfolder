import { extensionForFileName } from "./file-icons.js";

const IMAGE_EXTENSIONS = new Set([
  "apng", "avif", "bmp", "gif", "ico", "jfif", "jpe", "jpeg", "jpg", "png",
  "svg", "tif", "tiff", "webp",
]);
const AUDIO_EXTENSIONS = new Set([
  "aac", "aif", "aiff", "flac", "m4a", "mid", "midi", "mp3", "oga", "ogg",
  "opus", "wav", "weba", "wma",
]);
const VIDEO_EXTENSIONS = new Set([
  "3gp", "avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm",
  "wmv",
]);
const BINARY_EXTENSIONS = new Set([
  "7z", "apk", "bin", "class", "dll", "dmg", "exe", "gz", "jar", "pdf",
  "rar", "so", "tar", "wasm", "zip",
]);
const TEXT_APPLICATION_MIMES = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/sql",
  "application/typescript",
  "application/xml",
  "application/x-httpd-php",
  "application/x-sh",
  "application/x-yaml",
  "application/xhtml+xml",
]);

export function classifyFile(file, name) {
  const extension = extensionForFileName(name);
  const mimeType = (file.type || "").toLowerCase().split(";")[0];
  if (IMAGE_EXTENSIONS.has(extension) || mimeType.startsWith("image/")) return "image";
  if (AUDIO_EXTENSIONS.has(extension) || mimeType.startsWith("audio/")) return "audio";
  if (VIDEO_EXTENSIONS.has(extension) || mimeType.startsWith("video/")) return "video";
  if (
    BINARY_EXTENSIONS.has(extension) ||
    mimeType === "application/octet-stream" ||
    (mimeType.startsWith("application/") && !TEXT_APPLICATION_MIMES.has(mimeType))
  ) {
    return "binary";
  }
  return "text";
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new TypeError("File size must be a non-negative number.");
  }
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1000;
    unitIndex += 1;
  } while (value >= 1000 && unitIndex < units.length - 1);
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${units[unitIndex]}`;
}

export function formatAspectRatio(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError("Image dimensions must be positive integers.");
  }
  let left = width;
  let right = height;
  while (right) [left, right] = [right, left % right];
  return `${width / left}:${height / left}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours
    ? `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`
    : `${minutes}:${pad(remainingSeconds)}`;
}
