/**
 * Firestore file sharding utilities for BABAVONDO.
 *
 * Files are split into base64 chunks (well under Firestore's 1 MiB per-doc
 * limit) stored in a `parts` subcollection, plus a SHA-256 master checksum
 * for integrity verification. Pure browser APIs, no extra dependencies.
 *
 * Progress callbacks report fraction 0..1 (not rounded) so callers can build
 * precise percentage displays. Hashing is chunk-paced so the final
 * verification stage reports smooth progress instead of a freeze.
 */

const PART_SIZE = 700 * 1024; // 700 KB base64 chunks (~933 KB per doc)

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB upload cap

const HASH_CHUNK = 4 * 1024 * 1024; // 4 MB pacing chunk for hash progress

export interface FilePartData {
  index: number;
  data: string;
}

export interface SplitResult {
  fileId: string;
  masterHash: string;
  totalParts: number;
  partSize: number;
  parts: FilePartData[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash with honest chunk-paced progress. Discarded sub-hashes only pace the bar. */
async function sha256HexPaced(
  bytes: Uint8Array,
  onProgress?: (fraction: number) => void
): Promise<string> {
  if (bytes.length > HASH_CHUNK) {
    let offset = 0;
    while (offset < bytes.length) {
      const end = Math.min(offset + HASH_CHUNK, bytes.length);
      await crypto.subtle.digest("SHA-256", bytes.subarray(offset, end));
      offset = end;
      onProgress?.(offset / bytes.length);
    }
  }
  return sha256Hex(bytes);
}

function generateFileId(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function splitFile(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<SplitResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileId = generateFileId();
  const totalParts = Math.max(1, Math.ceil(bytes.length / PART_SIZE));
  const parts: FilePartData[] = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, bytes.length);
    parts.push({ index: i, data: bytesToBase64(bytes.subarray(start, end)) });
    // Encode is ~80% of split work.
    onProgress?.(0.8 * ((i + 1) / totalParts));
  }

  const masterHash = await sha256HexPaced(bytes, (f) => {
    // Hashing is the remaining ~20% of split work.
    onProgress?.(0.8 + 0.2 * f);
  });
  onProgress?.(1);

  return { fileId, masterHash, totalParts, partSize: PART_SIZE, parts };
}

export async function reassembleFile(
  parts: FilePartData[],
  expectedHash?: string,
  onProgress?: (fraction: number) => void
): Promise<{ blob: Blob; checksumMatched: boolean; calculatedHash: string }> {
  const ordered = [...parts].sort((a, b) => a.index - b.index);
  const decoded: Uint8Array[] = [];

  for (let i = 0; i < ordered.length; i++) {
    decoded.push(base64ToBytes(ordered[i].data));
    // Decode is ~75% of reassembly work.
    onProgress?.(0.75 * ((i + 1) / ordered.length));
  }

  let total = 0;
  for (const d of decoded) total += d.length;

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const d of decoded) {
    combined.set(d, offset);
    offset += d.length;
  }

  const calculatedHash = await sha256HexPaced(combined, (f) => {
    onProgress?.(0.75 + 0.25 * f);
  });
  onProgress?.(1);

  return {
    blob: new Blob([combined]),
    checksumMatched: !expectedHash ? true : calculatedHash === expectedHash,
    calculatedHash,
  };
}