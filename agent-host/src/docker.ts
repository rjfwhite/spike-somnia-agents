import Docker from 'dockerode';
import { createReadStream } from 'fs';
import { downloadFile } from './uri.js';

const docker = new Docker();

// Track running containers by agentId
const runningContainers = new Map<string, Docker.Container>();

// Port allocation - start from 10000 to avoid conflicts
let nextPort = 10000;
const agentPorts = new Map<string, number>();

/**
 * Get or allocate a port for an agent
 */
function getPortForAgent(agentId: string): number {
  if (agentPorts.has(agentId)) {
    return agentPorts.get(agentId)!;
  }
  const port = nextPort++;
  agentPorts.set(agentId, port);
  return port;
}

/**
 * Load a Docker image from a tar file
 */
async function loadImage(tarPath: string): Promise<string> {
  console.log(`🐳 Loading Docker image from ${tarPath}...`);

  const stream = createReadStream(tarPath);
  const loadStream = await docker.loadImage(stream);

  return new Promise((resolve, reject) => {
    let output = '';
    loadStream.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    loadStream.on('end', () => {
      console.log(`   Load output: ${output.trim()}`);
      // Parse the output to get the image name
      // Output format: {"stream":"Loaded image: imagename:tag\n"}
      const match = output.match(/Loaded image[: ]+([^\s"\\]+)/i);
      if (match) {
        resolve(match[1]);
      } else {
        // Try to parse as JSON array
        try {
          const lines = output.trim().split('\n');
          for (const line of lines) {
            const json = JSON.parse(line);
            if (json.stream) {
              const streamMatch = json.stream.match(/Loaded image[: ]+([^\s\n]+)/i);
              if (streamMatch) {
                resolve(streamMatch[1]);
                return;
              }
            }
          }
        } catch { }
        reject(new Error(`Could not parse image name from: ${output}`));
      }
    });
    loadStream.on('error', reject);
  });
}

/**
 * Start a container for an agent
 * @param agentId The agent ID (numeric ID from contract) - used for naming/tracking
 * @param containerImage The container image URL or IPFS CID - used for downloading
 * @param env Environment variables to set in the container (key=value)
 * @returns Object with port and whether container was just started
 */
export async function startAgentContainer(
  agentId: string,
  containerImage: string,
  env: string[] = []
): Promise<{ port: number; justStarted: boolean }> {
  // Check if container is already running
  if (runningContainers.has(agentId)) {
    const container = runningContainers.get(agentId)!;
    try {
      const info = await container.inspect();
      if (info.State.Running) {
        // console.log(`🐳 Container for agent ${agentId} already running`);
        return { port: getPortForAgent(agentId), justStarted: false };
      }
    } catch (e) {
      // Container mapped but not found/inspectable, plain cleanup
      runningContainers.delete(agentId);
    }
  }

  // Fetch the image from URI (IPFS or URL)
  const tarPath = await downloadFile(containerImage);

  // Load the image into Docker
  const imageName = await loadImage(tarPath);
  console.log(`   ✅ Loaded image: ${imageName}`);

  // Allocate a port for this agent
  const hostPort = getPortForAgent(agentId);

  // Define container name
  const containerName = `agent-${agentId}`;

  // Cleanup orphaned container if it exists (e.g. from previous run)
  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.inspect();
    // If we reach here, the container exists but wasn't in our valid running map
    console.log(`   Found orphaned container ${containerName}, removing...`);
    await existingContainer.remove({ force: true });
  } catch (error: any) {
    // 404 means not found, which is what we want
    if (error.statusCode !== 404) {
      console.warn(`   Warning: checking for orphan container failed: ${error.message}`);
    }
  }

  // Create and start the container
  console.log(`🐳 Starting container for agent ${agentId} on port ${hostPort}...`);
  console.log(`   Container name: ${containerName}`);
  console.log(`   Environment: ${env.join(', ')}`);

  const container = await docker.createContainer({
    Image: imageName,
    name: containerName,
    Env: env,
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
      'somnia.agent.id': agentId,
    },
  });

  await container.start();
  runningContainers.set(agentId, container);

  console.log(`   ✅ Container started, accessible at http://localhost:${hostPort}`);

  return { port: hostPort, justStarted: true };
}

/**
 * Wait for a container to be ready to accept requests
 * @param port The port the container is listening on
 * @param maxAttempts Maximum number of attempts (default 30)
 * @param delayMs Delay between attempts in milliseconds (default 1000)
 */
async function waitForContainerReady(port: number, maxAttempts = 30, delayMs = 1000): Promise<void> {
  console.log(`   ⏳ Waiting for container to be ready on port ${port}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Try to connect to the container (using a HEAD or GET to root)
      const response = await fetch(`http://localhost:${port}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // 2 second timeout per request
      });

      // Any response (even 404) means the server is up
      console.log(`   ✅ Container ready after ${attempt} attempt(s)`);
      return;
    } catch (error: any) {
      if (attempt === maxAttempts) {
        throw new Error(`Container did not become ready after ${maxAttempts} attempts`);
      }
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Stop and remove a container for an agent
 */
export async function stopAgentContainer(agentId: string): Promise<void> {
  const container = runningContainers.get(agentId);
  if (!container) {
    console.log(`🐳 No running container for agent ${agentId}`);
    return;
  }

  console.log(`🐳 Stopping container for agent ${agentId}...`);
  await container.stop();
  await container.remove();
  runningContainers.delete(agentId);
  console.log(`   ✅ Container stopped and removed`);
}

/**
 * Send a request to an agent's container
 * @param agentId The agent ID (numeric ID from contract) - used for naming/tracking
 * @param containerImage The container image URL or IPFS CID - used for downloading
 * @param method The HTTP method/endpoint
 * @param callData The request data
 * @param headers Optional headers to pass to the container
 * @param env Optional environment variables to set in the container (only used if starting new)
 * @returns The response from the container
 */
export async function callAgentContainer(
  agentId: string,
  containerImage: string,
  method: string,
  callData: string,
  headers: Record<string, string> = {},
  env: string[] = []
): Promise<string> {
  // Ensure container is running
  const { port, justStarted } = await startAgentContainer(agentId, containerImage, env);

  // Wait for container to be ready if it was just started
  if (justStarted) {
    await waitForContainerReady(port);
  }

  // Make HTTP request to the container
  const url = `http://localhost:${port}/${method}`;
  console.log(`📤 Calling agent container: ${url}`);
  console.log(`   Call data (hex): ${callData.substring(0, 200)}${callData.length > 200 ? '...' : ''}`);

  // Convert hex string to binary
  const callDataHex = callData.startsWith('0x') ? callData.slice(2) : callData;
  const callDataBytes = Buffer.from(callDataHex, 'hex');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...headers,
      },
      body: callDataBytes,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent returned error ${response.status}: ${errorText}`);
    }

    // Read response as bytes
    const responseBytes = await response.arrayBuffer();
    const responseHex = '0x' + Buffer.from(responseBytes).toString('hex');

    console.log(`📥 Response status: ${response.status}`);
    console.log(`📥 Response (hex): ${responseHex.substring(0, 200)}${responseHex.length > 200 ? '...' : ''}`);

    return responseHex;
  } catch (error: any) {
    console.error(`❌ Failed to call agent: ${error.message}`);
    throw error;
  }
}

/**
 * Cleanup all running containers
 */
export async function cleanupContainers(): Promise<void> {
  console.log('🧹 Cleaning up containers...');
  for (const [agentId, container] of runningContainers) {
    try {
      await container.stop();
      await container.remove();
      console.log(`   Removed container for agent ${agentId}`);
    } catch (error: any) {
      console.error(`   Failed to remove container for agent ${agentId}: ${error.message}`);
    }
  }
  runningContainers.clear();
}
