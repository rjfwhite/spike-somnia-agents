import Docker from 'dockerode';
import { createReadStream } from 'fs';
import { fetchImageFromIPFS } from './ipfs.js';

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
        } catch {}
        reject(new Error(`Could not parse image name from: ${output}`));
      }
    });
    loadStream.on('error', reject);
  });
}

/**
 * Start a container for an agent
 * @param agentId The agent ID (IPFS CID of the container image)
 * @returns The host port the container is accessible on
 */
export async function startAgentContainer(agentId: string): Promise<number> {
  // Check if container is already running
  if (runningContainers.has(agentId)) {
    const container = runningContainers.get(agentId)!;
    const info = await container.inspect();
    if (info.State.Running) {
      console.log(`🐳 Container for agent ${agentId} already running`);
      return getPortForAgent(agentId);
    }
    // Container exists but not running, remove it
    await container.remove({ force: true });
    runningContainers.delete(agentId);
  }

  // Fetch the image from IPFS
  const tarPath = await fetchImageFromIPFS(agentId);

  // Load the image into Docker
  const imageName = await loadImage(tarPath);
  console.log(`   ✅ Loaded image: ${imageName}`);

  // Allocate a port for this agent
  const hostPort = getPortForAgent(agentId);

  // Create and start the container
  console.log(`🐳 Starting container for agent ${agentId} on port ${hostPort}...`);

  const container = await docker.createContainer({
    Image: imageName,
    name: `agent-${agentId.substring(0, 12)}`,
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

  return hostPort;
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
 * @param agentId The agent ID
 * @param method The HTTP method/endpoint
 * @param callData The request data
 * @returns The response from the container
 */
export async function callAgentContainer(
  agentId: string,
  method: string,
  callData: string
): Promise<string> {
  // Ensure container is running
  const port = await startAgentContainer(agentId);

  // Make HTTP request to the container
  const url = `http://localhost:${port}/${method}`;
  console.log(`📤 Calling agent container: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: callData,
    });

    const responseText = await response.text();
    console.log(`📥 Response status: ${response.status}`);
    console.log(`📥 Response body: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);

    return responseText;
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
