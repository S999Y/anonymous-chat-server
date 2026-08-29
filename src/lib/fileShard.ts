/**
 * FileShard utilities for BABAVONDO.
 *
 * Splits large files into small base64-encoded chunks (under Firestore's
 * 1 MiB per-document limit), computes a master SHA-256 checksum for the whole
 * file, and reassembles/verifies the chunks back into the original file.
 *
 * Pure browser APIs only (crypto.subtle, Blob.slice, FileReader) - no extra deps.
 */

export const PART_SIZE = 700 * 1024; // 700 KB per part -> ~933KB base64, safe under 1 MiB
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB upload cap

export interface FilePart {
  index: number;
  data: string; // base64-encoded slice
}

export interface SplitFileResult {
  fileId: string;
  masterHash: string;
  totalParts: number;
  partSize: number;
  parts: FilePart[];
}

// Generate a UUID (with a non-crypto fallback).
export function generateFileId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "fshard-" + Math.random().toString(36).substring(2, 10) + "-" + Date.now().toString(36);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function sha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  let hashHex = "";
  hashArray.forEach((b) => {
    hashHex += b.toString(16).padStart(2, "0");
  });
  return hashHex;
}

/**
 * Split a File into base64 chunks. Computes the master SHA-256 over the whole
 * file and returns the parts. Optionally reports progress (0-100).
 */
export async function splitFile(
  file: File,
  onPartProgress?: (percent: number, part: number, total: number) => void
): Promise<SplitFileResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Max size is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB.`);
  }

  const masterHash = await sha256(await file.arrayBuffer());

  const totalParts = Math.max(1, Math.ceil(file.size / PART_SIZE));
  const parts: FilePart[] = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, file.size);
    const slice = file.slice(start, end);
    const buffer = await slice.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    parts.push({ index: i + 1, data: base64 });

    const percent = Math.min(100, Math.round(((i + 1) / totalParts) * 100));
    onPartProgress?.(percent, i + 1, totalParts);
  }

  return {
    fileId: generateFileId(),
    masterHash,
    totalParts,
    partSize: PART_SIZE,
    parts,
  };
}

/**
 * Reassemble base64 parts (in ascending index order) back into a Blob and
 * verify the master checksum of the reconstruction.
 */
export async function reassembleFile(
  parts: FilePart[],
  expectedHash: string,
  onPartProgress?: (percent: number, part: number, total: number) => void
): Promise<{ file: Blob | null; checksumMatched: boolean; calculatedHash: string }> {
  const sorted = [...parts].sort((a, b) => a.index - b.index);

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (let i = 0; i < sorted.length; i++) {
    const buffer = base64ToArrayBuffer(sorted[i].data);
    const bytes = new Uint8Array(buffer);
    chunks.push(bytes);
    totalBytes += bytes.length;
    const percent = Math.min(80, Math.round(((i + 1) / sorted.length) * 80));
    onPartProgress?.(percent, i + 1, sorted.length);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const calculatedHash = await sha256(merged.buffer);
  onPartProgress?.(100, sorted.length, sorted.length);

  const checksumMatched =
    !!expectedHash && calculatedHash.toLowerCase() === expectedHash.toLowerCase();

  return {
    file: checksumMatched ? new Blob([merged.buffer]) : null,
    checksumMatched,
    calculatedHash,
  };
}
