/**
 * Ethereum ABI parameter type (conforms to Solidity ABI spec)
 * https://docs.soliditylang.org/en/latest/abi-spec.html
 */
export interface AbiParameter {
  /** Parameter name */
  name: string;
  /** ABI type (e.g., uint256, address, bytes, tuple) */
  type: string;
  /** Internal Solidity type (e.g., "contract IERC20", "struct MyStruct") */
  internalType?: string;
  /** For tuple types: the component parameters */
  components?: AbiParameter[];
  /** For event parameters: whether the parameter is indexed */
  indexed?: boolean;
}

/**
 * Ethereum ABI function item (conforms to Solidity ABI spec)
 */
export interface AbiFunctionItem {
  /** Always "function" for functions */
  type: 'function';
  /** Function name */
  name: string;
  /** Input parameters */
  inputs: AbiParameter[];
  /** Output parameters */
  outputs: AbiParameter[];
  /** State mutability: pure, view, nonpayable, payable */
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
}

/**
 * Ethereum ABI event item
 */
export interface AbiEventItem {
  type: 'event';
  name: string;
  inputs: AbiParameter[];
  anonymous?: boolean;
}

/**
 * Ethereum ABI error item
 */
export interface AbiErrorItem {
  type: 'error';
  name: string;
  inputs: AbiParameter[];
}

/**
 * Union of all ABI item types
 */
export type AbiItem = AbiFunctionItem | AbiEventItem | AbiErrorItem;

/**
 * Method definition for agent - wraps standard ABI function format
 * with additional metadata
 */
export interface MethodDefinition {
  /** Method name (must match the HTTP endpoint) */
  name: string;
  /** Optional description of what this method does */
  description?: string;
  /** 
   * ABI for the request (input) - standard Ethereum ABI parameters
   * These define how callData should be encoded
   */
  inputs: AbiParameter[];
  /** 
   * ABI for the response (output) - standard Ethereum ABI parameters
   * These define how responseData should be encoded
   */
  outputs: AbiParameter[];
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
  methods: MethodDefinition[];
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
  // Unsigned integers
  uint8: 'uint8',
  uint16: 'uint16',
  uint32: 'uint32',
  uint64: 'uint64',
  uint128: 'uint128',
  uint256: 'uint256',
  
  // Signed integers
  int8: 'int8',
  int16: 'int16',
  int32: 'int32',
  int64: 'int64',
  int128: 'int128',
  int256: 'int256',
  
  // Other basic types
  address: 'address',
  bool: 'bool',
  bytes: 'bytes',
  string: 'string',
  
  // Fixed-size bytes
  bytes1: 'bytes1',
  bytes4: 'bytes4',
  bytes8: 'bytes8',
  bytes16: 'bytes16',
  bytes32: 'bytes32',
  
  // Array types (append [] to basic types)
  'uint256[]': 'uint256[]',
  'address[]': 'address[]',
  'bytes[]': 'bytes[]',
  'string[]': 'string[]',
  'bytes32[]': 'bytes32[]',
  'bool[]': 'bool[]',
  
  // Tuple marker (components should be specified)
  tuple: 'tuple',
  'tuple[]': 'tuple[]',
} as const;

/**
 * Helper to create an ABI parameter (standard Ethereum ABI format)
 */
export function param(
  name: string, 
  type: string, 
  options?: { 
    internalType?: string; 
    components?: AbiParameter[];
    indexed?: boolean;
  }
): AbiParameter {
  const p: AbiParameter = { name, type };
  if (options?.internalType) {
    p.internalType = options.internalType;
  }
  if (options?.components) {
    p.components = options.components;
  }
  if (options?.indexed !== undefined) {
    p.indexed = options.indexed;
  }
  return p;
}

/**
 * Helper to create a tuple parameter with components
 */
export function tupleParam(
  name: string, 
  components: AbiParameter[],
  options?: { internalType?: string; isArray?: boolean }
): AbiParameter {
  return {
    name,
    type: options?.isArray ? 'tuple[]' : 'tuple',
    internalType: options?.internalType,
    components,
  };
}

/**
 * Helper to create a method definition
 */
export function method(
  name: string,
  inputs: AbiParameter[],
  outputs: AbiParameter[],
  description?: string
): MethodDefinition {
  return { name, inputs, outputs, description };
}

/**
 * Convert a MethodDefinition to a standard ABI function item
 */
export function methodToAbiFunction(
  method: MethodDefinition, 
  stateMutability: AbiFunctionItem['stateMutability'] = 'nonpayable'
): AbiFunctionItem {
  return {
    type: 'function',
    name: method.name,
    inputs: method.inputs,
    outputs: method.outputs,
    stateMutability,
  };
}

/**
 * Generate a complete ABI array from agent methods
 */
export function generateAbiFromMethods(methods: MethodDefinition[]): AbiFunctionItem[] {
  return methods.map(m => methodToAbiFunction(m));
}
