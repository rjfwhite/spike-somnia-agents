import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { access, stat } from 'fs/promises';
import { loadConfig, saveConfig, loadSpec, saveSpec, loadIpfsCredentials } from '../utils/config.js';
import { uploadToPinata, uploadJsonToPinata, uploadToLocalIpfs, verifyCid, getGatewayUrls } from '../utils/ipfs.js';
import type { TokenMetadata } from '../types.js';

interface UploadOptions {
  file?: string;
  pinata?: boolean;
  local?: boolean;
  ipfsApi?: string;
  verify?: boolean;
  metadataOnly?: boolean;
}

export async function uploadCommand(directory: string = '.', options: UploadOptions = {}): Promise<void> {
  const targetDir = path.resolve(directory);
  
  console.log(chalk.blue('📤 Uploading agent to IPFS...\\n'));

  // Load config and credentials
  let config;
  try {
    config = await loadConfig(targetDir);
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }

  const credentials = loadIpfsCredentials();
  
  // Determine upload method
  const usePinata = options.pinata || (!options.local && credentials.pinataApiKey);
  
  if (usePinata && !credentials.pinataApiKey) {
    console.error(chalk.red('Error: PINATA_API_KEY environment variable is required'));
    console.error(chalk.gray('Set it in .env file or export it:'));
    console.error(chalk.gray('  export PINATA_API_KEY=your_api_key'));
    console.error(chalk.gray('  export PINATA_SECRET_KEY=your_secret_key'));
    process.exit(1);
  }

  const uploadOptions = {
    pinataApiKey: credentials.pinataApiKey,
    pinataSecretKey: credentials.pinataSecretKey,
    ipfsApiUrl: options.ipfsApi,
  };

  let imageCid: string | undefined;
  let imageSize: number | undefined;

  // Upload container image (if not metadata-only)
  if (!options.metadataOnly) {
    const tarFile = options.file || path.join(targetDir, `${config.spec.name}.tar`);
    
    // Check if tar file exists
    try {
      await access(tarFile);
    } catch {
      console.error(chalk.red(`Error: Container tar file not found: ${tarFile}`));
      console.error(chalk.gray('Run "agent-builder build" first to create the container image.'));
      process.exit(1);
    }

    const tarStats = await stat(tarFile);
    console.log(chalk.white(`Container: ${tarFile}`));
    console.log(chalk.gray(`Size: ${(tarStats.size / (1024 * 1024)).toFixed(2)} MB\\n`));

    const spinner = ora('Uploading container image...').start();

    try {
      const result = usePinata
        ? await uploadToPinata(tarFile, { ...uploadOptions, name: `${config.spec.name}-container.tar` }, (msg) => {
            spinner.text = msg;
          })
        : await uploadToLocalIpfs(tarFile, uploadOptions, (msg) => {
            spinner.text = msg;
          });

      imageCid = result.cid;
      imageSize = result.size;
      spinner.succeed(`Container uploaded: ${imageCid}`);
      
      // Show gateway URLs
      console.log(chalk.gray('\\nAvailable at:'));
      for (const url of getGatewayUrls(imageCid).slice(0, 3)) {
        console.log(chalk.gray(`  ${url}`));
      }

      // Verify if requested
      if (options.verify) {
        const verifySpinner = ora('Verifying availability...').start();
        const available = await verifyCid(imageCid);
        if (available) {
          verifySpinner.succeed('Content is available via public gateways');
        } else {
          verifySpinner.warn('Content may take a few minutes to propagate');
        }
      }
    } catch (error: any) {
      spinner.fail(`Upload failed: ${error.message}`);
      process.exit(1);
    }
  } else {
    // Use existing CID from spec
    imageCid = config.spec.image;
    if (!imageCid) {
      console.error(chalk.red('Error: No image CID in spec. Run without --metadata-only first.'));
      process.exit(1);
    }
  }

  // Update spec with image CID
  config.spec.image = imageCid;
  
  // Create token metadata
  const tokenMetadata: TokenMetadata = {
    name: config.spec.name,
    description: config.spec.description,
    external_url: config.spec.homepage,
    attributes: [
      { trait_type: 'version', value: config.spec.version },
      { trait_type: 'methods', value: config.spec.methods.length },
      ...(config.spec.tags?.map(tag => ({ trait_type: 'tag', value: tag })) || []),
    ],
    agent_spec: config.spec,
  };

  console.log(chalk.white('\\nUploading metadata...'));

  const metadataSpinner = ora('Uploading agent metadata...').start();

  try {
    const metadataResult = usePinata
      ? await uploadJsonToPinata(tokenMetadata, { ...uploadOptions, name: `${config.spec.name}-metadata.json` }, (msg) => {
          metadataSpinner.text = msg;
        })
      : await uploadToLocalIpfs(
          JSON.stringify(tokenMetadata, null, 2) as any,
          uploadOptions,
          (msg) => {
            metadataSpinner.text = msg;
          }
        );

    metadataSpinner.succeed(`Metadata uploaded: ${metadataResult.cid}`);
    
    console.log(chalk.gray('\\nMetadata available at:'));
    console.log(chalk.gray(`  https://gateway.pinata.cloud/ipfs/${metadataResult.cid}`));

    // Save updated config
    await saveConfig(config, targetDir);
    await saveSpec(config.spec, targetDir);

    console.log(chalk.blue('\\n✨ Upload complete!'));
    console.log(chalk.white('\\nAgent Details:'));
    console.log(chalk.cyan(`  Image CID: ${imageCid}`));
    console.log(chalk.cyan(`  Metadata CID: ${metadataResult.cid}`));
    console.log(chalk.cyan(`  Token URI: ipfs://${metadataResult.cid}`));
    
    console.log(chalk.white('\\nTo mint this agent:'));
    console.log(chalk.gray(`  Use token URI: ipfs://${metadataResult.cid}`));
    console.log(chalk.gray(`  Or use the frontend at /mint`));

  } catch (error: any) {
    metadataSpinner.fail(`Metadata upload failed: ${error.message}`);
    process.exit(1);
  }
}
