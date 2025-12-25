import Docker from 'dockerode';
import { createWriteStream, createReadStream } from 'fs';
import { stat, unlink, readdir, readFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { BuildConfig } from '../types.js';

const docker = new Docker();

/**
 * Build a Docker image from a Dockerfile
 */
export async function buildImage(
  config: BuildConfig,
  onProgress?: (message: string) => void
): Promise<string> {
  const {
    dockerfile = 'Dockerfile',
    context = '.',
    tag = 'agent:latest',
    buildArgs = {},
    platform,
  } = config;

  const contextPath = path.resolve(context);
  
  onProgress?.(`Building image from ${contextPath}...`);
  
  // Check if Dockerfile exists
  const dockerfilePath = path.join(contextPath, dockerfile);
  try {
    await stat(dockerfilePath);
  } catch {
    throw new Error(`Dockerfile not found at ${dockerfilePath}`);
  }

  // Build options
  const buildOptions: Docker.ImageBuildOptions = {
    t: tag,
    dockerfile,
    buildargs: buildArgs,
  };

  if (platform) {
    buildOptions.platform = platform;
  }

  // Build the image
  const stream = await docker.buildImage(
    { context: contextPath, src: ['.'] },
    buildOptions
  );

  // Process build output
  return new Promise((resolve, reject) => {
    let lastMessage = '';
    
    docker.modem.followProgress(
      stream,
      (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Find the image ID from the build output
        const successLine = res?.find((r: any) => r.aux?.ID);
        if (successLine?.aux?.ID) {
          resolve(successLine.aux.ID);
        } else {
          resolve(tag);
        }
      },
      (event) => {
        if (event.stream) {
          const msg = event.stream.trim();
          if (msg && msg !== lastMessage) {
            lastMessage = msg;
            onProgress?.(msg);
          }
        }
        if (event.error) {
          onProgress?.(`Error: ${event.error}`);
        }
      }
    );
  });
}

/**
 * Export a Docker image to a tar file
 */
export async function exportImage(
  imageTag: string,
  outputPath: string,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.(`Exporting image ${imageTag} to ${outputPath}...`);

  const image = docker.getImage(imageTag);
  const tarStream = await image.get();
  
  const outputStream = createWriteStream(outputPath);
  await pipeline(tarStream, outputStream);
  
  const stats = await stat(outputPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  onProgress?.(`Exported ${sizeMB} MB to ${outputPath}`);
  
  return outputPath;
}

/**
 * Get image information
 */
export async function getImageInfo(imageTag: string): Promise<Docker.ImageInspectInfo> {
  const image = docker.getImage(imageTag);
  return await image.inspect();
}

/**
 * Check if an image exists locally
 */
export async function imageExists(imageTag: string): Promise<boolean> {
  try {
    const image = docker.getImage(imageTag);
    await image.inspect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove an image
 */
export async function removeImage(imageTag: string): Promise<void> {
  const image = docker.getImage(imageTag);
  await image.remove();
}

/**
 * Load an image from a tar file
 */
export async function loadImage(tarPath: string): Promise<string> {
  const stream = createReadStream(tarPath);
  const loadStream = await docker.loadImage(stream);

  return new Promise((resolve, reject) => {
    let output = '';
    loadStream.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    loadStream.on('end', () => {
      // Parse the output to get the image name
      const match = output.match(/Loaded image[: ]+([^\s"\\]+)/i);
      if (match) {
        resolve(match[1]);
      } else {
        // Try to parse as JSON
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
 * Run a container and get output
 */
export async function runContainer(
  imageTag: string,
  cmd?: string[],
  timeout = 30000
): Promise<string> {
  const container = await docker.createContainer({
    Image: imageTag,
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  await container.start();

  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(async () => {
      try {
        await container.stop();
        await container.remove();
      } catch {}
      reject(new Error('Container execution timed out'));
    }, timeout);

    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
      });

      let output = '';
      logs.on('data', (chunk: Buffer) => {
        // Docker logs have 8-byte header per chunk
        output += chunk.slice(8).toString();
      });

      const waitResult = await container.wait();
      clearTimeout(timeoutId);
      
      await container.remove();
      
      if (waitResult.StatusCode !== 0) {
        reject(new Error(`Container exited with code ${waitResult.StatusCode}: ${output}`));
      } else {
        resolve(output);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      try {
        await container.stop();
        await container.remove();
      } catch {}
      reject(error);
    }
  });
}
