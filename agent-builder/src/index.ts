#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import 'dotenv/config';

import { initCommand } from './commands/init.js';
import { buildCommand } from './commands/build.js';
import { uploadCommand } from './commands/upload.js';
import { specCommand, showFullSpec } from './commands/spec.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('agent-builder')
  .description('CLI tool to build and upload Somnia agent containers')
  .version('1.0.0');

// Init command
program
  .command('init [directory]')
  .description('Initialize a new agent project')
  .option('-n, --name <name>', 'Agent name')
  .option('-t, --template <template>', 'Project template to use')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (directory, options) => {
    try {
      await initCommand(directory, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Build command
program
  .command('build [directory]')
  .description('Build the agent Docker container')
  .option('-d, --dockerfile <path>', 'Path to Dockerfile')
  .option('-t, --tag <tag>', 'Image tag')
  .option('-p, --platform <platform>', 'Target platform (e.g., linux/amd64)')
  .option('-e, --export <path>', 'Export tar file path')
  .option('--no-export', 'Skip exporting to tar file')
  .action(async (directory, options) => {
    try {
      await buildCommand(directory, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Upload command
program
  .command('upload [directory]')
  .description('Upload the agent container and metadata to IPFS')
  .option('-f, --file <path>', 'Path to container tar file')
  .option('--pinata', 'Use Pinata for IPFS upload')
  .option('--local', 'Use local IPFS node')
  .option('--ipfs-api <url>', 'Custom IPFS API URL')
  .option('--verify', 'Verify upload via public gateways')
  .option('--metadata-only', 'Only upload metadata (image must already be uploaded)')
  .action(async (directory, options) => {
    try {
      await uploadCommand(directory, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Spec command
program
  .command('spec [directory]')
  .description('Manage agent specification and method ABIs')
  .option('-a, --add', 'Add a new method')
  .option('-r, --remove <name>', 'Remove a method')
  .option('-l, --list', 'List all methods')
  .option('-s, --show <name>', 'Show details of a specific method')
  .option('--json', 'Output as JSON')
  .option('--abi', 'Output method as standard Ethereum ABI format')
  .action(async (directory, options) => {
    try {
      if (options.json && !options.show) {
        await showFullSpec(directory);
      } else {
        await specCommand(directory, options);
      }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate [directory]')
  .description('Validate agent configuration and ABIs')
  .action(async (directory) => {
    try {
      await validateCommand(directory);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Info command
program
  .command('info [directory]')
  .description('Show agent information')
  .option('--json', 'Output as JSON')
  .action(async (directory, options) => {
    try {
      const targetDir = directory || '.';
      const { loadConfig, loadSpec } = await import('./utils/config.js');
      
      const config = await loadConfig(targetDir);
      const spec = config.spec;

      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log(chalk.blue(`Agent: ${spec.name}`));
        console.log(chalk.white(`Version: ${spec.version}`));
        console.log(chalk.white(`Description: ${spec.description}`));
        if (spec.author) console.log(chalk.white(`Author: ${spec.author}`));
        if (spec.image) console.log(chalk.cyan(`Image CID: ${spec.image}`));
        console.log(chalk.white(`Methods: ${spec.methods.length}`));
        for (const method of spec.methods) {
          console.log(chalk.gray(`  - ${method.name}`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
