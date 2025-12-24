import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';

// Public IPFS gateways to try
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
];

const CACHE_DIR = './image-cache';

/**
 * Fetches a tarred container image from IPFS by CID
 * @param cid The IPFS CID of the tarred container image
 * @returns Path to the downloaded tar file
 */
export async function fetchImageFromIPFS(cid: string): Promise<string> {
  // Ensure cache directory exists
  await mkdir(CACHE_DIR, { recursive: true });

  const tarPath = path.join(CACHE_DIR, `${cid}.tar`);

  console.log(`📥 Fetching image from IPFS: ${cid}`);

  // Try each gateway until one works
  for (const gateway of IPFS_GATEWAYS) {
    const url = `${gateway}${cid}`;
    console.log(`   Trying gateway: ${gateway}`);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/x-tar, application/octet-stream, */*',
        },
      });

      if (!response.ok) {
        console.log(`   ❌ Gateway returned ${response.status}`);
        continue;
      }

      if (!response.body) {
        console.log(`   ❌ No response body`);
        continue;
      }

      // Stream the response to a file
      const fileStream = createWriteStream(tarPath);
      // @ts-ignore - Node.js fetch body is compatible with Readable.fromWeb
      await pipeline(Readable.fromWeb(response.body as any), fileStream);

      console.log(`   ✅ Downloaded to ${tarPath}`);
      return tarPath;
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
      continue;
    }
  }

  throw new Error(`Failed to fetch image ${cid} from any IPFS gateway`);
}
