import Docker from 'dockerode';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import crypto from 'crypto';

const docker = new Docker();

const CACHE_DIR = './image-cache';

// Track running containers by version hash (derived from HEAD response)
const runningContainers = new Map<string, { container: Docker.Container; port: number; url: string }>();

// Port allocation - start from 10000 to avoid conflicts
let nextPort = 10000;

/**
 * Fetch HEAD from URL and create a version hash from the response headers.
 * Uses ETag if available, otherwise Last-Modified, otherwise Content-Length.
 */
async function getVersionHash(url: string): Promise<string> {
  const response = await fetch(url, { method: 'HEAD' });

  if (!response.ok) {
    throw new Error(`HEAD request failed: ${response.status} ${response.statusText}`);
  }

  // Build version string from available headers (prefer ETag > Last-Modified > Content-Length)
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  const contentLength = response.headers.get('content-length');

  let versionString: string;
  if (etag) {
    versionString = `etag:${etag}`;
  } else if (lastModified) {
    versionString = `modified:${lastModified}`;
  } else if (contentLength) {
    versionString = `size:${contentLength}`;
  } else {
    // Fallback to URL hash if no version headers available
    versionString = `url:${url}`;
  }

  console.log(`Version identifier for ${url}: ${versionString}`);

  return crypto.createHash('sha256').update(versionString).digest('hex').slice(0, 16);
}

/**
 * Download a container image from a URL
 */
async function downloadImage(url: string, versionHash: string): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });

  const filePath = path.join(CACHE_DIR, `${versionHash}.tar`);

  console.log(`Downloading image from: ${url}`);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/x-tar, application/octet-stream, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const fileStream = createWriteStream(filePath);
  // @ts-ignore - Node.js fetch body is compatible with Readable.fromWeb
  await pipeline(Readable.fromWeb(response.body as any), fileStream);

  console.log(`Downloaded to ${filePath}`);
  return filePath;
}

/**
 * Load a Docker image from a tar file
 */
async function loadImage(tarPath: string): Promise<string> {
  console.log(`Loading Docker image from ${tarPath}...`);

  const stream = createReadStream(tarPath);
  const loadStream = await docker.loadImage(stream);

  return new Promise((resolve, reject) => {
    docker.modem.followProgress(loadStream, (err: Error | null, output: any[]) => {
      if (err) {
        reject(err);
        return;
      }

      // output is an array of all streamed JSON objects
      for (const item of output) {
        if (item.stream) {
          const match = item.stream.match(/Loaded image[: ]+([^\s\n]+)/i);
          if (match) {
            resolve(match[1]);
            return;
          }
        }
      }

      reject(new Error(`Could not parse image name from output: ${JSON.stringify(output)}`));
    });
  });
}

/**
 * Wait for a container to be ready to accept requests
 */
async function waitForContainerReady(port: number, maxAttempts = 30, delayMs = 1000): Promise<void> {
  console.log(`Waiting for container to be ready on port ${port}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      // Any response means the server is up
      console.log(`Container ready after ${attempt} attempt(s)`);
      return;
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(`Container did not become ready after ${maxAttempts} attempts`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Stop and remove a container by version hash
 */
async function stopContainer(versionHash: string): Promise<void> {
  const info = runningContainers.get(versionHash);
  if (!info) return;

  try {
    console.log(`Stopping container for version ${versionHash}...`);
    await info.container.stop();
    await info.container.remove();
    runningContainers.delete(versionHash);
    console.log(`Removed container ${versionHash}`);
  } catch (error: any) {
    console.error(`Failed to stop container ${versionHash}: ${error.message}`);
    runningContainers.delete(versionHash);
  }
}

/**
 * Ensure a container is running for the given agent URL and version.
 * Downloads and starts if not already running the correct version.
 */
export async function ensureAgentRunning(agentUrl: string): Promise<{ port: number; justStarted: boolean }> {
  const versionHash = await getVersionHash(agentUrl);

  // Check if already running this exact version
  if (runningContainers.has(versionHash)) {
    const info = runningContainers.get(versionHash)!;
    try {
      const containerInfo = await info.container.inspect();
      if (containerInfo.State.Running) {
        console.log(`Container for version ${versionHash} already running on port ${info.port}`);
        return { port: info.port, justStarted: false };
      }
    } catch {
      // Container gone, cleanup
      runningContainers.delete(versionHash);
    }
  }

  // Check if there's an old version running for this URL and stop it
  for (const [hash, info] of runningContainers) {
    if (info.url === agentUrl && hash !== versionHash) {
      console.log(`Found outdated container for ${agentUrl}, stopping...`);
      await stopContainer(hash);
    }
  }

  // Download and load the image
  const tarPath = await downloadImage(agentUrl, versionHash);
  const imageName = await loadImage(tarPath);
  console.log(`Loaded image: ${imageName}`);

  // Allocate port
  const hostPort = nextPort++;
  const containerName = `agent-${versionHash}`;

  // Cleanup orphaned container if exists
  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.inspect();
    console.log(`Found orphaned container ${containerName}, removing...`);
    await existingContainer.remove({ force: true });
  } catch (error: any) {
    if (error.statusCode !== 404) {
      console.warn(`Warning checking for orphan container: ${error.message}`);
    }
  }

  // Create and start container
  console.log(`Starting container for ${agentUrl} (version ${versionHash}) on port ${hostPort}...`);

  const container = await docker.createContainer({
    Image: imageName,
    name: containerName,
    ExposedPorts: {
      '80/tcp': {},
    },
    HostConfig: {
      PortBindings: {
        '80/tcp': [{ HostPort: hostPort.toString() }],
      },
      AutoRemove: false,
    },
    Labels: {
      'agent-host.version-hash': versionHash,
      'agent-host.url': agentUrl,
    },
  });

  await container.start();
  runningContainers.set(versionHash, { container, port: hostPort, url: agentUrl });

  console.log(`Container started at http://localhost:${hostPort}`);

  // Wait for ready
  await waitForContainerReady(hostPort);

  return { port: hostPort, justStarted: true };
}

/**
 * Forward a request to an agent container using JSON-in-JSON-out protocol.
 * Request: { requestId: string, request: hex-encoded string }
 * Response: { steps?: array, result: hex-encoded string }
 */
export async function forwardToAgent(
  agentUrl: string,
  body: Buffer,
  headers: Record<string, string>
): Promise<{ status: number; body: Buffer; receipt: object | null }> {
  const { port } = await ensureAgentRunning(agentUrl);

  const url = `http://localhost:${port}/`;

  // Convert binary body to hex-encoded string and build JSON request
  const requestHex = '0x' + body.toString('hex');
  const requestId = headers['X-Request-Id'] || '';

  const jsonRequest = JSON.stringify({
    requestId,
    request: requestHex,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: jsonRequest,
  });

  // Parse JSON response
  const responseText = await response.text();
  let responseBody: Buffer;
  let receipt: object | null = null;

  try {
    const jsonResponse = JSON.parse(responseText);

    // Extract result and convert from hex to binary
    if (jsonResponse.result) {
      const resultHex = jsonResponse.result.startsWith('0x')
        ? jsonResponse.result.slice(2)
        : jsonResponse.result;
      responseBody = Buffer.from(resultHex, 'hex');
    } else {
      responseBody = Buffer.from(responseText);
    }

    // The full JSON response IS the receipt
    if (jsonResponse.steps) {
      receipt = jsonResponse;
    }
  } catch {
    // If response is not JSON, treat as raw text/error
    responseBody = Buffer.from(responseText);
  }

  return {
    status: response.status,
    body: responseBody,
    receipt,
  };
}

/**
 * Cleanup all running containers
 */
export async function cleanupContainers(): Promise<void> {
  console.log('Cleaning up containers...');
  for (const [versionHash, info] of runningContainers) {
    try {
      await info.container.stop();
      await info.container.remove();
      console.log(`Removed container ${versionHash}`);
    } catch (error: any) {
      console.error(`Failed to remove container ${versionHash}: ${error.message}`);
    }
  }
  runningContainers.clear();
}
