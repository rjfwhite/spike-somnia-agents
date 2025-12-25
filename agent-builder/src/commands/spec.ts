import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadSpec, saveSpec, configExists } from '../utils/config.js';
import type { AgentSpec, MethodAbi, AbiParameter, AbiTypes } from '../types.js';

interface SpecOptions {
  add?: boolean;
  remove?: string;
  list?: boolean;
  show?: string;
  json?: boolean;
}

const COMMON_ABI_TYPES = [
  'string',
  'uint256',
  'int256',
  'address',
  'bool',
  'bytes',
  'bytes32',
  'uint256[]',
  'address[]',
  'string[]',
  'tuple',
];

export async function specCommand(directory: string = '.', options: SpecOptions = {}): Promise<void> {
  const targetDir = path.resolve(directory);

  // Check if config exists
  if (!await configExists(targetDir)) {
    console.error(chalk.red('Error: No agent configuration found.'));
    console.error(chalk.gray('Run "agent-builder init" first.'));
    process.exit(1);
  }

  let spec: AgentSpec;
  try {
    spec = await loadSpec(targetDir);
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }

  // List methods
  if (options.list) {
    console.log(chalk.blue(`Agent: ${spec.name} v${spec.version}\\n`));
    
    if (spec.methods.length === 0) {
      console.log(chalk.gray('No methods defined.'));
      console.log(chalk.gray('Run "agent-builder spec --add" to add a method.'));
      return;
    }

    console.log(chalk.white('Methods:'));
    for (const method of spec.methods) {
      console.log(chalk.cyan(`\\n  ${method.name}`));
      if (method.description) {
        console.log(chalk.gray(`    ${method.description}`));
      }
      console.log(chalk.gray(`    Request: (${formatAbiParams(method.requestAbi)})`));
      console.log(chalk.gray(`    Response: (${formatAbiParams(method.responseAbi)})`));
    }
    return;
  }

  // Show specific method
  if (options.show) {
    const method = spec.methods.find(m => m.name === options.show);
    if (!method) {
      console.error(chalk.red(`Method "${options.show}" not found.`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(method, null, 2));
    } else {
      console.log(chalk.blue(`Method: ${method.name}\\n`));
      if (method.description) {
        console.log(chalk.white(`Description: ${method.description}\\n`));
      }
      console.log(chalk.white('Request ABI:'));
      console.log(formatAbiParamsVerbose(method.requestAbi));
      console.log(chalk.white('\\nResponse ABI:'));
      console.log(formatAbiParamsVerbose(method.responseAbi));
    }
    return;
  }

  // Remove method
  if (options.remove) {
    const methodIndex = spec.methods.findIndex(m => m.name === options.remove);
    if (methodIndex === -1) {
      console.error(chalk.red(`Method "${options.remove}" not found.`));
      process.exit(1);
    }

    spec.methods.splice(methodIndex, 1);
    await saveSpec(spec, targetDir);
    console.log(chalk.green(`✓ Removed method: ${options.remove}`));
    return;
  }

  // Add method (default or explicit)
  if (options.add || Object.keys(options).length === 0) {
    await addMethodInteractive(spec, targetDir);
  }
}

async function addMethodInteractive(spec: AgentSpec, targetDir: string): Promise<void> {
  console.log(chalk.blue('Add new method\\n'));

  const { name, description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Method name:',
      validate: (input: string) => {
        if (!input) return 'Name is required';
        if (spec.methods.find(m => m.name === input)) return 'Method already exists';
        return true;
      },
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
    },
  ]);

  // Request ABI
  console.log(chalk.white('\\nDefine request parameters (input):'));
  const requestAbi = await collectAbiParams();

  // Response ABI
  console.log(chalk.white('\\nDefine response parameters (output):'));
  const responseAbi = await collectAbiParams();

  const method: MethodAbi = {
    name,
    description: description || undefined,
    requestAbi,
    responseAbi,
  };

  spec.methods.push(method);
  await saveSpec(spec, targetDir);

  console.log(chalk.green(`\\n✓ Added method: ${name}`));
  console.log(chalk.gray(`  Request: (${formatAbiParams(requestAbi)})`));
  console.log(chalk.gray(`  Response: (${formatAbiParams(responseAbi)})`));
}

async function collectAbiParams(): Promise<AbiParameter[]> {
  const params: AbiParameter[] = [];

  while (true) {
    const { addParam } = await inquirer.prompt([{
      type: 'confirm',
      name: 'addParam',
      message: params.length === 0 ? 'Add a parameter?' : 'Add another parameter?',
      default: params.length === 0,
    }]);

    if (!addParam) break;

    const { paramName, paramType } = await inquirer.prompt([
      {
        type: 'input',
        name: 'paramName',
        message: 'Parameter name:',
        validate: (input: string) => input.length > 0 || 'Name is required',
      },
      {
        type: 'list',
        name: 'paramType',
        message: 'Parameter type:',
        choices: [...COMMON_ABI_TYPES, new inquirer.Separator(), 'Custom...'],
      },
    ]);

    let finalType = paramType;
    
    if (paramType === 'Custom...') {
      const { customType } = await inquirer.prompt([{
        type: 'input',
        name: 'customType',
        message: 'Enter custom type (e.g., uint128, bytes20):',
      }]);
      finalType = customType;
    }

    const param: AbiParameter = {
      name: paramName,
      type: finalType,
    };

    // Handle tuple components
    if (finalType === 'tuple' || finalType === 'tuple[]') {
      console.log(chalk.gray('  Define tuple components:'));
      param.components = await collectAbiParams();
    }

    params.push(param);
    console.log(chalk.green(`  Added: ${paramName} (${finalType})`));
  }

  return params;
}

function formatAbiParams(params: AbiParameter[]): string {
  if (params.length === 0) return '';
  return params.map(p => `${p.type} ${p.name}`).join(', ');
}

function formatAbiParamsVerbose(params: AbiParameter[], indent = '  '): string {
  if (params.length === 0) return `${indent}(none)`;
  
  return params.map(p => {
    let line = `${indent}${p.type} ${p.name}`;
    if (p.components) {
      line += '\\n' + formatAbiParamsVerbose(p.components, indent + '  ');
    }
    return line;
  }).join('\\n');
}

/**
 * Display the full spec as JSON
 */
export async function showFullSpec(directory: string = '.'): Promise<void> {
  const targetDir = path.resolve(directory);
  const spec = await loadSpec(targetDir);
  console.log(JSON.stringify(spec, null, 2));
}
