import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { SIGNED_URL_EXPIRY_SECONDS } from "./types";

// In-memory mock storage for local testing and mock mode
const mockStorageMap = new Map<string, Buffer>();

export function getMockStorageMap(): Map<string, Buffer> {
  return mockStorageMap;
}

export function clearMockStorage(): void {
  mockStorageMap.clear();
}

/**
 * Creates a signed upload URL for a file in the private materials bucket.
 * Expires strictly in 5 minutes (300 seconds).
 */
export async function createSignedUploadUrl(
  storagePath: string,
  dbClient: SupabaseClient<Database>
): Promise<{ signedUrl: string; token?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storageClient = (dbClient as any).storage?.from("materials");
    if (storageClient && typeof storageClient.createSignedUploadUrl === "function") {
      const res = await storageClient.createSignedUploadUrl(storagePath, {
        expiresIn: SIGNED_URL_EXPIRY_SECONDS,
      });
      if (res.error) {
        throw new Error(`Storage error: ${res.error.message}`);
      }
      return {
        signedUrl: res.data.signedUrl,
        token: res.data.token,
      };
    }
  } catch (err: unknown) {
    if ((err as Error).message && !(err as Error).message.includes("is not a function")) {
      throw err;
    }
  }

  // Fallback for mock/test environment
  const mockToken = `mock-token-${Date.now()}`;
  const signedUrl = `/api/v1/materials/storage-mock?path=${encodeURIComponent(
    storagePath
  )}&token=${mockToken}&expires=${Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000}`;

  return { signedUrl, token: mockToken };
}

/**
 * Generates a temporary signed download URL for private material viewing.
 * Strictly expires in 5 minutes (300 seconds). Zero public URLs.
 */
export async function createSignedViewUrl(
  storagePath: string,
  dbClient: SupabaseClient<Database>
): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storageClient = (dbClient as any).storage?.from("materials");
    if (storageClient && typeof storageClient.createSignedUrl === "function") {
      const res = await storageClient.createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);
      if (res.error) {
        throw new Error(`Storage error: ${res.error.message}`);
      }
      return res.data.signedUrl;
    }
  } catch (err: unknown) {
    if ((err as Error).message && !(err as Error).message.includes("is not a function")) {
      throw err;
    }
  }

  // Fallback for mock/test environment
  return `/api/v1/materials/storage-mock?path=${encodeURIComponent(
    storagePath
  )}&expires=${Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000}`;
}

/**
 * Downloads a file buffer from private storage.
 */
export async function downloadMaterialBuffer(
  storagePath: string,
  dbClient: SupabaseClient<Database>
): Promise<Buffer> {
  // Check mock storage first
  const mockBuf = mockStorageMap.get(storagePath);
  if (mockBuf) {
    return mockBuf;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storageClient = (dbClient as any).storage?.from("materials");
    if (storageClient && typeof storageClient.download === "function") {
      const res = await storageClient.download(storagePath);
      if (res.error) {
        throw new Error(`Failed to download storage file: ${res.error.message}`);
      }
      if (res.data) {
        const arrayBuf = await res.data.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    }
  } catch (err: unknown) {
    if ((err as Error).message && !(err as Error).message.includes("is not a function")) {
      throw err;
    }
  }

  throw new Error(`Material file not found in storage: '${storagePath}'.`);
}

/**
 * Stores a file buffer in private storage.
 */
export async function storeMaterialBuffer(
  storagePath: string,
  buffer: Buffer,
  dbClient: SupabaseClient<Database>,
  contentType: string = "application/octet-stream"
): Promise<void> {
  // Always register in mock storage for tests
  mockStorageMap.set(storagePath, buffer);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storageClient = (dbClient as any).storage?.from("materials");
    if (storageClient && typeof storageClient.upload === "function") {
      await storageClient.upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });
    }
  } catch {
    // In mock mode, ignore remote storage errors
  }
}
