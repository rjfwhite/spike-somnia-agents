import path from 'path';
import chalk from 'chalk';
import { loadConfig, loadSpec } from '../utils/config.js';
import { access } from 'fs/promises';
import type { AgentSpec, AbiParameter } from '../types.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Valid Solidity/ABI base types (Ethereum ABI specification)
const VALID_BASE_TYPES = [
  // Unsigned integers
  'uint8', 'uint16', 'uint24', 'uint32', 'uint40', 'uint48', 'uint56', 'uint64',
  'uint72', 'uint80', 'uint88', 'uint96', 'uint104', 'uint112', 'uint120', 'uint128',
  'uint136', 'uint144', 'uint152', 'uint160', 'uint168', 'uint176', 'uint184', 'uint192',
  'uint200', 'uint208', 'uint216', 'uint224', 'uint232', 'uint240', 'uint248', 'uint256',
  // Signed integers
  'int8', 'int16', 'int24', 'int32', 'int40', 'int48', 'int56', 'int64',
  'int72', 'int80', 'int88', 'int96', 'int104', 'int112', 'int120', 'int128',
  'int136', 'int144', 'int152', 'int160', 'int168', 'int176', 'int184', 'int192',
  'int200', 'int208', 'int216', 'int224', 'int232', 'int240', 'int248', 'int256',
  // Address and bool
  'address', 'bool',
  // Dynamic types
  'string', 'bytes',
  // Fixed-size bytes
  'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
  'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16',
  'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23', 'bytes24',
  'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 'bytes30', 'bytes31', 'bytes32',
  // Tuple (struct)
  'tuple',
];

export async function validateCommand(directory: string = '.'): Promise<void> {
  const targetDir = path.resolve(directory);
  
  console.log(chalk.blue('🔍 Validating agent configuration...\n'));

  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Load and validate config
  let config;
  let spec: AgentSpec;
  
  try {
    config = await loadConfig(targetDir);
    spec = config.spec;
  } catch (error: any) {
    result.valid = false;
    result.errors.push(`Configuration error: ${error.message}`);
    printResults(result);
    return;
  }

  // Validate spec fields
  if (!spec.name || spec.name.trim().length === 0) {
    result.errors.push('Agent name is required');
    result.valid = false;
  }

  if (!spec.version || !/^\d+\.\d+\.\d+/.test(spec.version)) {
    result.warnings.push('Version should follow semver format (e.g., 1.0.0)');
  }

  if (!spec.description || spec.description.length < 10) {
    result.warnings.push('Description is too short or missing');
  }

  // Validate methods
  if (!spec.methods || spec.methods.length === 0) {
    result.warnings.push('No methods defined. Agent will not be useful.');
  } else {
    const methodNames = new Set<string>();
    
    for (const method of spec.methods) {
      // Check for duplicate method names
      if (methodNames.has(method.name)) {
        result.errors.push(`Duplicate method name: ${method.name}`);
        result.valid = false;
      }
      methodNames.add(method.name);

      // Validate method name format (Solidity identifier rules)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(method.name)) {
        result.errors.push(`Invalid method name: ${method.name} (must be valid Solidity identifier)`);
        result.valid = false;
      }

      // Validate inputs (request ABI)
      const inputErrors = validateAbiParams(method.inputs, `${method.name}.inputs`);
      result.errors.push(...inputErrors.errors);
      result.warnings.push(...inputErrors.warnings);
      
      // Validate outputs (response ABI)
      const outputErrors = validateAbiParams(method.outputs, `${method.name}.outputs`);
      result.errors.push(...outputErrors.errors);
      result.warnings.push(...outputErrors.warnings);
      
      if (inputErrors.errors.length > 0 || outputErrors.errors.length > 0) {
        result.valid = false;
      }
    }
  }

  // Check build configuration
  if (config.build) {
    const dockerfile = path.join(targetDir, config.build.dockerfile || 'Dockerfile');
    try {
      await access(dockerfile);
    } catch {
      result.warnings.push(`Dockerfile not found at ${dockerfile}`);
    }
  }

  printResults(result);
  
  // Show ABI summary if valid
  if (result.valid && spec.methods.length > 0) {
    console.log(chalk.white('\nMethod ABI Summary:'));
    for (const method of spec.methods) {
      console.log(chalk.cyan(`  ${method.name}(`));
      if (method.inputs.length > 0) {
        console.log(chalk.gray(`    inputs: ${method.inputs.map(p => `${p.type} ${p.name}`).join(', ')}`));
      }
      if (method.outputs.length > 0) {
        console.log(chalk.gray(`    outputs: ${method.outputs.map(p => `${p.type} ${p.name}`).join(', ')}`));
      }
      console.log(chalk.cyan(`  )`));
    }
  }
}

function validateAbiParams(params: AbiParameter[], context: string): { errors: string[], warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const paramNames = new Set<string>();

  for (const param of params) {
    // Check for duplicate param names (warning only, Solidity allows this)
    if (param.name && paramNames.has(param.name)) {
      warnings.push(`${context}: Duplicate parameter name "${param.name}"`);
    }
    if (param.name) {
      paramNames.add(param.name);
    }

    // Validate type
    const typeValidation = validateAbiType(param.type);
    if (!typeValidation.valid) {
      errors.push(`${context}: ${typeValidation.error} for parameter "${param.name}"`);
    }

    // Validate tuple has components
    const baseType = param.type.replace(/\[\d*\]/g, ''); // Remove all array suffixes
    if (baseType === 'tuple' && (!param.components || param.components.length === 0)) {
      errors.push(`${context}: Tuple parameter "${param.name}" must have components`);
    }

    // Warn if internalType is missing (not required but recommended)
    if (!param.internalType && (baseType === 'tuple' || baseType === 'address')) {
      warnings.push(`${context}: Parameter "${param.name}" is missing internalType`);
    }

    // Recursively validate tuple components
    if (param.components) {
      const componentResult = validateAbiParams(param.components, `${context}.${param.name}`);
      errors.push(...componentResult.errors);
      warnings.push(...componentResult.warnings);
    }
  }

  return { errors, warnings };
}

function validateAbiType(type: string): { valid: boolean; error?: string } {
  // Handle arrays - can be multi-dimensional
  let baseType = type;
  const arrayMatches = type.match(/\[\d*\]/g);
  if (arrayMatches) {
    baseType = type.replace(/\[\d*\]/g, '');
  }
  
  // Check if base type is valid
  if (!VALID_BASE_TYPES.includes(baseType)) {
    return { 
      valid: false, 
      error: `Invalid ABI type "${type}". Base type "${baseType}" is not a valid Ethereum ABI type` 
    };
  }

  return { valid: true };
}

function printResults(result: ValidationResult): void {
  if (result.errors.length > 0) {
    console.log(chalk.red('Errors:'));
    for (const error of result.errors) {
      console.log(chalk.red(`  ✗ ${error}`));
    }
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log(chalk.yellow('Warnings:'));
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  ⚠ ${warning}`));
    }
    console.log();
  }

  if (result.valid) {
    console.log(chalk.green('✓ Configuration is valid (conforms to Ethereum ABI spec)'));
  } else {
    console.log(chalk.red('✗ Configuration has errors. Please fix them before building.'));
    process.exit(1);
  }
}
