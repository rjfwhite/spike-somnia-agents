import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';

// Public IPFS gateways to try for CIDs
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
];

const CACHE_DIR = './image-cache';

/**
 * Resolve a URI (URL or CID) to a list of potential fetch URLs
 */
function resolveUri(uri: string): string[] {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return [uri];
  }
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    return IPFS_GATEWAYS.map(g => `${g}${cid}`);
  }
  // Assume generic string is a CID
  return IPFS_GATEWAYS.map(g => `${g}${uri}`);
}

/**
 * Downloads a file from a URI (URL or CID)
 * @param uri The URI to download from
 * @param filename Optional filename (defaults to hash of URI or last part)
 * @returns Path to the downloaded file
 */
export async function downloadFile(uri: string, filename?: string): Promise<string> {
  // Ensure cache directory exists
  await mkdir(CACHE_DIR, { recursive: true });

  const name = filename || path.basename(uri).replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = path.join(CACHE_DIR, name);

  console.log(`📥 Downloading file from: ${uri}`);

  const candidates = resolveUri(uri);

  // Try each candidate until one works
  for (const url of candidates) {
    console.log(`   Trying: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/x-tar, application/octet-stream, */*',
        },
      });

      if (!response.ok) {
        console.log(`   ❌ Returned ${response.status}`);
        continue;
      }

      if (!response.body) {
        console.log(`   ❌ No response body`);
        continue;
      }

      // Stream the response to a file
      const fileStream = createWriteStream(filePath);
      // @ts-ignore - Node.js fetch body is compatible with Readable.fromWeb
      await pipeline(Readable.fromWeb(response.body as any), fileStream);

      console.log(`   ✅ Downloaded to ${filePath}`);
      return filePath;
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
      continue;
    }
  }

  throw new Error(`Failed to download file from ${uri}`);
}

/**
 * Fetches JSON content from a URI (URL or CID)
 * @param uri The URI to fetch from
 * @returns The parsed JSON object
 */
export async function fetchJson(uri: string): Promise<any> {
  console.log(`📥 Fetching JSON from: ${uri}`);

  const candidates = resolveUri(uri);

  // Try each candidate until one works
  for (const url of candidates) {
    console.log(`   Trying: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
        },
      });

      if (!response.ok) {
        console.log(`   ❌ Returned ${response.status}`);
        continue;
      }

      const json = await response.json();
      console.log(`   ✅ Fetched JSON successfully`);
      return json;
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
      continue;
    }
  }

  throw new Error(`Failed to fetch JSON from ${uri}`);
}
