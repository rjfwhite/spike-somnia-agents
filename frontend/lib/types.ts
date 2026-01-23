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
 * ABI function definition (matches agent.json abi format)
 */
export interface AbiFunction {
    type: "function";
    name: string;
    description?: string;
    inputs: AbiParameter[];
    outputs: AbiParameter[];
}

/**
 * Agent metadata format (matches agent.json from somnia-agent CLI)
 */
export interface AgentMetadata {
    name: string;
    description: string;
    version: string;
    author?: string;
    abi: AbiFunction[];
    tags?: string[];
}

/**
 * Token metadata format (for NFT tokenURI)
 * Wraps AgentMetadata with optional NFT-specific fields
 */
export interface TokenMetadata extends AgentMetadata {
    image?: string;
    external_url?: string;
    attributes?: Array<{
        trait_type: string;
        value: string | number;
    }>;
}

// Alias for backwards compatibility
export type MethodDefinition = AbiFunction;

/**
 * Helper function to get functions from ABI
 */
export function getAbiFunctions(metadata: AgentMetadata | TokenMetadata | null): AbiFunction[] {
    if (!metadata) return [];
    return metadata.abi?.filter(item => item.type === 'function') || [];
}
