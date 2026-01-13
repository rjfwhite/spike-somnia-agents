import { encodeAbiParameters, decodeAbiParameters, encodeFunctionData, type Hex } from 'viem';
import type { AbiParameter, MethodDefinition } from './types';

/**
 * Encode a full function call (selector + ABI-encoded parameters) using viem
 */
export function encodeFunctionCall(method: MethodDefinition, values: any[]): Hex {
    const abi = [{
        type: 'function' as const,
        name: method.name,
        inputs: method.inputs.map(p => ({
            type: p.type,
            name: p.name,
            ...(p.components && { components: p.components }),
        })),
        outputs: method.outputs.map(p => ({
            type: p.type,
            name: p.name,
            ...(p.components && { components: p.components }),
        })),
    }];

    return encodeFunctionData({
        abi,
        functionName: method.name,
        args: values,
    });
}

/**
 * Encode values according to ABI parameters
 */
export function encodeAbi(params: AbiParameter[], values: any[]): Hex {
    if (params.length !== values.length) {
        throw new Error(`Parameter count mismatch: expected ${params.length}, got ${values.length}`);
    }

    // Convert our AbiParameter type to viem's format
    const viemParams = params.map(p => ({
        type: p.type,
        name: p.name,
        ...(p.components && { components: p.components }),
    }));

    return encodeAbiParameters(viemParams as any, values);
}

/**
 * Decode hex data according to ABI parameters
 */
export function decodeAbi(params: AbiParameter[], data: Hex): any[] {
    if (!data || data === '0x') {
        return [];
    }

    // Convert our AbiParameter type to viem's format
    const viemParams = params.map(p => ({
        type: p.type,
        name: p.name,
        ...(p.components && { components: p.components }),
    }));

    try {
        const result = decodeAbiParameters(viemParams as any, data);
        return Array.from(result); // Convert readonly to mutable array
    } catch (error) {
        console.error('Failed to decode ABI data:', error);
        throw error;
    }
}

/**
 * Format a decoded value for display
 */
export function formatDecodedValue(value: any, type: string): string {
    if (value === null || value === undefined) {
        return 'null';
    }

    // Handle bigint
    if (typeof value === 'bigint') {
        return value.toString();
    }

    // Handle arrays
    if (Array.isArray(value)) {
        return `[${value.map((v, i) => {
            // For tuple arrays, recursively format
            if (type.startsWith('tuple')) {
                return formatDecodedValue(v, type);
            }
            return formatDecodedValue(v, type.replace('[]', ''));
        }).join(', ')}]`;
    }

    // Handle objects (tuples)
    if (typeof value === 'object') {
        const entries = Object.entries(value)
            .filter(([key]) => isNaN(Number(key))) // Filter out numeric indices
            .map(([key, val]) => `${key}: ${formatDecodedValue(val, 'unknown')}`)
            .join(', ');
        return `{${entries}}`;
    }

    // Handle bytes
    if (type.startsWith('bytes') && typeof value === 'string') {
        // Show first 10 chars + ... if long
        if (value.length > 20) {
            return `${value.slice(0, 20)}...`;
        }
        return value;
    }

    // Handle boolean
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    // Default: convert to string
    return String(value);
}

/**
 * Parse user input value based on ABI type
 */
export function parseInputValue(value: string, type: string): any {
    const trimmed = value.trim();

    // Handle uint/int types
    if (type.startsWith('uint') || type.startsWith('int')) {
        return BigInt(trimmed);
    }

    // Handle bool
    if (type === 'bool') {
        return trimmed.toLowerCase() === 'true' || trimmed === '1';
    }

    // Handle address
    if (type === 'address') {
        if (!trimmed.startsWith('0x')) {
            return `0x${trimmed}`;
        }
        return trimmed;
    }

    // Handle bytes
    if (type.startsWith('bytes')) {
        if (!trimmed.startsWith('0x')) {
            // Convert string to hex
            return `0x${Buffer.from(trimmed).toString('hex')}`;
        }
        return trimmed;
    }

    // Handle arrays
    if (type.endsWith('[]')) {
        const elementType = type.slice(0, -2);

        // Try JSON parsing first (supports nested arrays, strings with commas, etc.)
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.map(item => parseInputValue(String(item), elementType));
            }
        } catch (e) {
            // Ignore JSON error and try fallback
        }

        // Fallback: Split by comma
        // This is a simple split and won't handle commas inside strings gracefully,
        // but it covers the 80% case of simple lists of IDs, addresses, or numbers.
        if (trimmed.length > 0) {
            return trimmed.split(',').map(item => parseInputValue(item.trim(), elementType));
        }

        return [];
    }

    // Handle string (default)
    return trimmed;
}
