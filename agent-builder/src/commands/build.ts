import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, saveConfig } from '../utils/config.js';
import { buildImage, exportImage, getImageInfo } from '../utils/docker.js';

interface BuildOptions {
  dockerfile?: string;
  tag?: string;
  platform?: string;
  export?: string;
  noExport?: boolean;
}

export async function buildCommand(directory: string = '.', options: BuildOptions = {}): Promise<void> {
  const targetDir = path.resolve(directory);
  
  console.log(chalk.blue('🐳 Building agent container...\\n'));

  // Load config
  let config;
  try {
    config = await loadConfig(targetDir);
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }

  // Override build options from CLI
  const buildConfig = {
    ...config.build,
    context: targetDir,
    dockerfile: options.dockerfile || config.build.dockerfile,
    tag: options.tag || config.build.tag || `${config.spec.name}:${config.spec.version}`,
    platform: options.platform || config.build.platform,
  };

  const spinner = ora('Building Docker image...').start();

  try {
    // Build the image
    const imageId = await buildImage(buildConfig, (msg) => {
      spinner.text = msg;
    });
    
    spinner.succeed(`Built image: ${buildConfig.tag}`);

    // Get image info
    const imageInfo = await getImageInfo(buildConfig.tag!);
    const sizeMB = (imageInfo.Size / (1024 * 1024)).toFixed(2);
    console.log(chalk.gray(`   Image ID: ${imageId.substring(0, 12)}`));
    console.log(chalk.gray(`   Size: ${sizeMB} MB`));

    // Export if requested
    if (!options.noExport) {
      const exportPath = options.export || path.join(targetDir, `${config.spec.name}.tar`);
      
      const exportSpinner = ora('Exporting image to tar...').start();
      await exportImage(buildConfig.tag!, exportPath, (msg) => {
        exportSpinner.text = msg;
      });
      exportSpinner.succeed(`Exported to: ${exportPath}`);
      
      // Update config with export path
      config.build.tag = buildConfig.tag;
      await saveConfig(config, targetDir);
    }

    console.log(chalk.blue('\\n✨ Build complete!'));
    
    if (!options.noExport) {
      console.log(chalk.white('\\nNext step:'));
      console.log(chalk.gray('  Run: agent-builder upload'));
    }
    
  } catch (error: any) {
    spinner.fail(`Build failed: ${error.message}`);
    process.exit(1);
  }
}
