import { createReadStream, statSync } from 'fs';
import { stat, readFile, writeFile } from 'fs/promises';
import path from 'path';

// IPFS API endpoints
const IPFS_API_ENDPOINTS = [
  'https://api.pinata.cloud/pinning/pinFileToIPFS',
  // Add more endpoints as needed
];

// Public IPFS gateways for verification
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
];

export interface UploadOptions {
  /** Pinata API key (for pinata uploads) */
  pinataApiKey?: string;
  /** Pinata secret key */
  pinataSecretKey?: string;
  /** Custom IPFS API URL */
  ipfsApiUrl?: string;
  /** Name for the pinned content */
  name?: string;
}

export interface UploadResult {
  cid: string;
  size: number;
  gateway: string;
}

/**
 * Upload a file to IPFS via Pinata
 */
export async function uploadToPinata(
  filePath: string,
  options: UploadOptions,
  onProgress?: (message: string) => void
): Promise<UploadResult> {
  const { pinataApiKey, pinataSecretKey, name } = options;

  if (!pinataApiKey || !pinataSecretKey) {
    throw new Error('Pinata API key and secret are required');
  }

  const stats = await stat(filePath);
  const fileName = name || path.basename(filePath);
  
  onProgress?.(`Uploading ${fileName} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)...`);

  // Create form data manually for fetch
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const fileContent = await readFile(filePath);
  
  const metadata = JSON.stringify({
    name: fileName,
  });

  // Build multipart form body
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`),
    Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="pinataMetadata"\r\n`),
    Buffer.from(`Content-Type: application/json\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'pinata_api_key': pinataApiKey,
      'pinata_secret_api_key': pinataSecretKey,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
  }

  const result = await response.json() as { IpfsHash: string; PinSize: number };
  
  onProgress?.(`Uploaded to IPFS: ${result.IpfsHash}`);

  return {
    cid: result.IpfsHash,
    size: result.PinSize,
    gateway: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
  };
}

/**
 * Upload JSON data to IPFS via Pinata
 */
export async function uploadJsonToPinata(
  data: object,
  options: UploadOptions,
  onProgress?: (message: string) => void
): Promise<UploadResult> {
  const { pinataApiKey, pinataSecretKey, name } = options;

  if (!pinataApiKey || !pinataSecretKey) {
    throw new Error('Pinata API key and secret are required');
  }

  onProgress?.(`Uploading JSON metadata...`);

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'pinata_api_key': pinataApiKey,
      'pinata_secret_api_key': pinataSecretKey,
    },
    body: JSON.stringify({
      pinataContent: data,
      pinataMetadata: {
        name: name || 'agent-metadata.json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
  }

  const result = await response.json() as { IpfsHash: string; PinSize: number };
  
  onProgress?.(`Uploaded to IPFS: ${result.IpfsHash}`);

  return {
    cid: result.IpfsHash,
    size: result.PinSize,
    gateway: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
  };
}

/**
 * Upload to local IPFS node
 */
export async function uploadToLocalIpfs(
  filePath: string,
  options: UploadOptions,
  onProgress?: (message: string) => void
): Promise<UploadResult> {
  const apiUrl = options.ipfsApiUrl || 'http://localhost:5001';
  
  const stats = await stat(filePath);
  const fileName = options.name || path.basename(filePath);
  
  onProgress?.(`Uploading ${fileName} to local IPFS node...`);

  const fileContent = await readFile(filePath);
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`),
    Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch(`${apiUrl}/api/v0/add`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`IPFS upload failed: ${response.status} ${errorText}`);
  }

  const result = await response.json() as { Hash: string; Size: string };
  
  onProgress?.(`Uploaded to IPFS: ${result.Hash}`);

  return {
    cid: result.Hash,
    size: parseInt(result.Size),
    gateway: `https://ipfs.io/ipfs/${result.Hash}`,
  };
}

/**
 * Verify a CID is accessible via public gateways
 */
export async function verifyCid(
  cid: string,
  onProgress?: (message: string) => void
): Promise<boolean> {
  for (const gateway of IPFS_GATEWAYS) {
    const url = `${gateway}${cid}`;
    onProgress?.(`Checking ${gateway}...`);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      });
      
      if (response.ok) {
        onProgress?.(`✓ Available at ${url}`);
        return true;
      }
    } catch {
      // Try next gateway
    }
  }
  
  return false;
}

/**
 * Get gateway URLs for a CID
 */
export function getGatewayUrls(cid: string): string[] {
  return IPFS_GATEWAYS.map(gateway => `${gateway}${cid}`);
}
