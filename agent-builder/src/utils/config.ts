import { readFile, writeFile, access } from 'fs/promises';
import path from 'path';
import type { AgentConfig, AgentSpec, BuildConfig } from '../types.js';

const CONFIG_FILE = 'agent.config.json';
const SPEC_FILE = 'agent.spec.json';

/**
 * Get the default agent configuration
 */
export function getDefaultConfig(): AgentConfig {
  return {
    spec: {
      name: 'my-agent',
      version: '1.0.0',
      description: 'A Somnia agent',
      methods: [],
    },
    build: {
      dockerfile: 'Dockerfile',
      context: '.',
      tag: 'agent:latest',
    },
  };
}

/**
 * Load agent configuration from file
 */
export async function loadConfig(directory: string = '.'): Promise<AgentConfig> {
  const configPath = path.join(directory, CONFIG_FILE);
  
  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as AgentConfig;
  } catch (error) {
    // Try loading just the spec file
    const specPath = path.join(directory, SPEC_FILE);
    try {
      const specContent = await readFile(specPath, 'utf-8');
      const spec = JSON.parse(specContent) as AgentSpec;
      return {
        spec,
        build: getDefaultConfig().build,
      };
    } catch {
      throw new Error(`No agent configuration found. Run 'agent-builder init' first.`);
    }
  }
}

/**
 * Save agent configuration to file
 */
export async function saveConfig(config: AgentConfig, directory: string = '.'): Promise<void> {
  const configPath = path.join(directory, CONFIG_FILE);
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Load agent spec from file
 */
export async function loadSpec(directory: string = '.'): Promise<AgentSpec> {
  const specPath = path.join(directory, SPEC_FILE);
  
  try {
    const content = await readFile(specPath, 'utf-8');
    return JSON.parse(content) as AgentSpec;
  } catch {
    // Fall back to config file
    const config = await loadConfig(directory);
    return config.spec;
  }
}

/**
 * Save agent spec to file
 */
export async function saveSpec(spec: AgentSpec, directory: string = '.'): Promise<void> {
  const specPath = path.join(directory, SPEC_FILE);
  await writeFile(specPath, JSON.stringify(spec, null, 2));
}

/**
 * Check if agent config exists
 */
export async function configExists(directory: string = '.'): Promise<boolean> {
  const configPath = path.join(directory, CONFIG_FILE);
  const specPath = path.join(directory, SPEC_FILE);
  
  try {
    await access(configPath);
    return true;
  } catch {
    try {
      await access(specPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Load environment variables for IPFS credentials
 */
export function loadIpfsCredentials(): { pinataApiKey?: string; pinataSecretKey?: string } {
  return {
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretKey: process.env.PINATA_SECRET_KEY,
  };
}
