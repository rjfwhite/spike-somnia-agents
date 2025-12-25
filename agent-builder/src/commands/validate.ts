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

// Valid Solidity/ABI types
const VALID_BASE_TYPES = [
  'uint8', 'uint16', 'uint32', 'uint64', 'uint128', 'uint256',
  'int8', 'int16', 'int32', 'int64', 'int128', 'int256',
  'address', 'bool', 'string', 'bytes',
  'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
  'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16',
  'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23', 'bytes24',
  'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 'bytes30', 'bytes31', 'bytes32',
  'tuple',
];

export async function validateCommand(directory: string = '.'): Promise<void> {
  const targetDir = path.resolve(directory);
  
  console.log(chalk.blue('🔍 Validating agent configuration...\\n'));

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

      // Validate method name format
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(method.name)) {
        result.errors.push(`Invalid method name: ${method.name} (must start with letter, alphanumeric only)`);
        result.valid = false;
      }

      // Validate ABIs
      const requestErrors = validateAbiParams(method.requestAbi, `${method.name}.request`);
      const responseErrors = validateAbiParams(method.responseAbi, `${method.name}.response`);
      
      result.errors.push(...requestErrors.errors);
      result.warnings.push(...requestErrors.warnings);
      result.errors.push(...responseErrors.errors);
      result.warnings.push(...responseErrors.warnings);
      
      if (requestErrors.errors.length > 0 || responseErrors.errors.length > 0) {
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
}

function validateAbiParams(params: AbiParameter[], context: string): { errors: string[], warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const paramNames = new Set<string>();

  for (const param of params) {
    // Check for duplicate param names
    if (paramNames.has(param.name)) {
      errors.push(`${context}: Duplicate parameter name "${param.name}"`);
    }
    paramNames.add(param.name);

    // Validate type
    const baseType = param.type.replace(/\[\]$/, ''); // Remove array suffix
    
    if (!VALID_BASE_TYPES.includes(baseType)) {
      errors.push(`${context}: Invalid type "${param.type}" for parameter "${param.name}"`);
    }

    // Validate tuple has components
    if (baseType === 'tuple' && (!param.components || param.components.length === 0)) {
      errors.push(`${context}: Tuple parameter "${param.name}" must have components`);
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
    console.log(chalk.green('✓ Configuration is valid!'));
  } else {
    console.log(chalk.red('✗ Configuration has errors. Please fix them before building.'));
    process.exit(1);
  }
}
