/**
 * Ethereum ABI parameter type
 */
export interface AbiParameter {
  name: string;
  type: string;
  components?: AbiParameter[]; // For tuple types
  indexed?: boolean; // For event parameters
}

/**
 * Method ABI definition for agent request/response
 */
export interface MethodAbi {
  /** Name of the method */
  name: string;
  /** ABI parameters for the request (input) */
  requestAbi: AbiParameter[];
  /** ABI parameters for the response (output) */
  responseAbi: AbiParameter[];
  /** Optional description of what this method does */
  description?: string;
}

/**
 * Agent specification metadata
 */
export interface AgentSpec {
  /** Name of the agent */
  name: string;
  /** Version of the agent */
  version: string;
  /** Description of what this agent does */
  description: string;
  /** Author/creator of the agent */
  author?: string;
  /** IPFS CID of the container image */
  image?: string;
  /** Methods exposed by this agent with their ABIs */
  methods: MethodAbi[];
  /** Optional tags for categorization */
  tags?: string[];
  /** Optional homepage/documentation URL */
  homepage?: string;
  /** Optional repository URL */
  repository?: string;
}

/**
 * Token metadata format (for NFT tokenURI)
 */
export interface TokenMetadata {
  /** Name of the agent */
  name: string;
  /** Description of the agent */
  description: string;
  /** Optional image URL for the agent */
  image?: string;
  /** External URL for more info */
  external_url?: string;
  /** Agent-specific attributes */
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  /** The full agent specification */
  agent_spec: AgentSpec;
}

/**
 * Configuration for building an agent container
 */
export interface BuildConfig {
  /** Path to the Dockerfile (default: ./Dockerfile) */
  dockerfile?: string;
  /** Build context path (default: .) */
  context?: string;
  /** Image tag (default: agent:latest) */
  tag?: string;
  /** Build arguments */
  buildArgs?: Record<string, string>;
  /** Platform to build for */
  platform?: string;
}

/**
 * Agent project configuration (stored in agent.config.json)
 */
export interface AgentConfig {
  /** Agent specification */
  spec: AgentSpec;
  /** Build configuration */
  build: BuildConfig;
}

/**
 * Common Ethereum ABI types for convenience
 */
export const AbiTypes = {
  // Basic types
  uint256: 'uint256',
  uint128: 'uint128',
  uint64: 'uint64',
  uint32: 'uint32',
  uint16: 'uint16',
  uint8: 'uint8',
  int256: 'int256',
  int128: 'int128',
  int64: 'int64',
  int32: 'int32',
  int16: 'int16',
  int8: 'int8',
  address: 'address',
  bool: 'bool',
  bytes: 'bytes',
  bytes32: 'bytes32',
  bytes4: 'bytes4',
  string: 'string',
  
  // Array types (append [] to basic types)
  uint256Array: 'uint256[]',
  addressArray: 'address[]',
  bytesArray: 'bytes[]',
  stringArray: 'string[]',
  
  // Tuple marker (components should be specified)
  tuple: 'tuple',
  tupleArray: 'tuple[]',
} as const;

/**
 * Helper to create an ABI parameter
 */
export function param(name: string, type: string, components?: AbiParameter[]): AbiParameter {
  const p: AbiParameter = { name, type };
  if (components) {
    p.components = components;
  }
  return p;
}

/**
 * Helper to create a method definition
 */
export function method(
  name: string,
  requestAbi: AbiParameter[],
  responseAbi: AbiParameter[],
  description?: string
): MethodAbi {
  return { name, requestAbi, responseAbi, description };
}
