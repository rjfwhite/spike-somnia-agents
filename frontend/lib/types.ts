/**
 * Ethereum ABI parameter type
 */
export interface AbiParameter {
    name: string;
    type: string;
    internalType?: string;
    components?: AbiParameter[];
    indexed?: boolean;
}

/**
 * Method definition for agent - includes ABI for inputs/outputs
 */
export interface MethodDefinition {
    name: string;
    description?: string;
    inputs: AbiParameter[];
    outputs: AbiParameter[];
}

/**
 * Agent specification metadata
 */
export interface AgentSpec {
    name: string;
    version: string;
    description: string;
    author?: string;
    image: string; // Container image URI (required)
    methods: MethodDefinition[];
    tags?: string[];
    homepage?: string;
    repository?: string;
}

/**
 * Token metadata format (for NFT tokenURI)
 * Supports both nested (agent_spec) and flat (ERC721-style) structures
 */
export interface TokenMetadata {
    name: string;
    description: string;
    image?: string; // Display image (optional)
    external_url?: string;
    attributes?: Array<{
        trait_type: string;
        value: string | number;
    }>;
    // Nested structure (optional) - full agent-builder format
    agent_spec?: AgentSpec;
    // Flat structure fields (optional) - ERC721 style with added fields
    version?: string;
    author?: string;
    methods?: MethodDefinition[];
    tags?: string[];
    homepage?: string;
    repository?: string;
}
