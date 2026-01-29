#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { createServer } from 'http';
import { readFileSync, existsSync, watch, mkdirSync, writeFileSync, readdirSync, statSync, createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import crypto from 'crypto';
import { upload } from '@vercel/blob/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load and print version
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
console.log(`somnia-agent v${pkg.version}\n`);

const CONTAINER_PORT = 80;
const HOST_PORT = 9000;
const UI_PORT = 3000;

function usage() {
  console.log(`
somnia-agent - Test and build Somnia agents locally

Usage:
  somnia-agent create [folder]           Create a new agent from template
  somnia-agent dev [agent-folder]        Run agent with web UI and file watching
  somnia-agent publish [agent-folder]    Build and upload agent to hosting service

Commands:
  create   Create a new agent project from template
  dev      Start development server with hot reload (default: current directory)
  publish  Build container, upload tar and metadata to hosting service (default: current directory)

Examples:
  somnia-agent create my-agent
  somnia-agent dev
  somnia-agent publish
`);
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
if (args.length < 1 || args[0] === '-h' || args[0] === '--help') {
  usage();
}

const command = args[0];

// Validate agent folder
function validateFolder(folderPath) {
  const agentFolder = path.resolve(folderPath);

  if (!existsSync(agentFolder)) {
    console.error(`Error: Folder not found: ${agentFolder}`);
    process.exit(1);
  }

  const agentJsonPath = path.join(agentFolder, 'agent.json');
  const dockerfilePath = path.join(agentFolder, 'Dockerfile');

  if (!existsSync(agentJsonPath)) {
    console.error(`Error: agent.json not found in ${agentFolder}`);
    process.exit(1);
  }

  if (!existsSync(dockerfilePath)) {
    console.error(`Error: Dockerfile not found in ${agentFolder}`);
    process.exit(1);
  }

  return { agentFolder, agentJsonPath, dockerfilePath };
}

// ============================================================================
// CREATE COMMAND
// ============================================================================

function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Generate a random uint64 agentId (64-bit random number as string)
function generateAgentId() {
  // Generate 8 random bytes (64 bits)
  const bytes = crypto.randomBytes(8);
  // Convert to BigInt and then to string
  let hex = '0x' + bytes.toString('hex');
  return BigInt(hex).toString();
}

async function createCommand(folderArg) {
  let folderName = folderArg;

  // Prompt for folder name if not provided
  if (!folderName) {
    folderName = await prompt('Agent folder name: ');
    if (!folderName) {
      console.error('Error: Folder name is required');
      process.exit(1);
    }
  }

  const targetFolder = path.resolve(folderName);

  // Check if folder already exists
  if (existsSync(targetFolder)) {
    console.error(`Error: Folder already exists: ${targetFolder}`);
    process.exit(1);
  }

  // Prompt for agent name and description
  const defaultName = path.basename(folderName)
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const agentName = await prompt(`Agent name (${defaultName}): `) || defaultName;
  const agentDescription = await prompt('Agent description: ') || 'A Somnia agent';

  // Create slug for package.json (lowercase, hyphenated)
  const agentSlug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Generate a random uint64 agentId
  const agentId = generateAgentId();

  // Get template directory
  const templateDir = path.join(__dirname, '..', 'template');

  if (!existsSync(templateDir)) {
    console.error('Error: Template directory not found');
    process.exit(1);
  }

  console.log(`\nCreating agent: ${agentName}`);
  console.log(`Agent ID: ${agentId}`);
  console.log(`Location: ${targetFolder}\n`);

  // Create target folder
  mkdirSync(targetFolder, { recursive: true });

  // Copy and process template files
  const templateFiles = readdirSync(templateDir);

  for (const file of templateFiles) {
    const sourcePath = path.join(templateDir, file);
    const targetPath = path.join(targetFolder, file);

    let content = readFileSync(sourcePath, 'utf-8');

    // Replace placeholders
    content = content.replace(/\{\{name\}\}/g, agentName);
    content = content.replace(/\{\{slug\}\}/g, agentSlug);
    content = content.replace(/\{\{description\}\}/g, agentDescription);
    content = content.replace(/\{\{agentId\}\}/g, agentId);

    writeFileSync(targetPath, content);
    console.log(`  Created: ${file}`);
  }

  console.log(`
Done! Your agent has been created.

Agent ID: ${agentId}
This unique ID will be used to register your agent on-chain.

Next steps:
  cd ${folderName}
  npm install
  npx somnia-agents dev

Edit agent.json to define your functions, then implement them in server.js.
`);
}

// ============================================================================
// PUBLISH COMMAND
// ============================================================================

function parsePublishArgs(args) {
  const options = {
    frontend: 'https://spike-somnia-agents.vercel.app',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--frontend' && args[i + 1]) {
      options.frontend = args[i + 1];
      i++;
    }
  }

  return options;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function createProgressBar(percent, width = 30) {
  const filled = Math.round(width * percent / 100);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

async function uploadFile(frontendUrl, filePath, pathname, contentType) {
  const fileStats = statSync(filePath);
  const fileSize = fileStats.size;

  console.log(`  Uploading ${pathname} (${formatBytes(fileSize)})...`);

  // For small files (< 4MB), use simple PUT endpoint
  if (fileSize < 4 * 1024 * 1024) {
    const fileContent = readFileSync(filePath);
    const url = `${frontendUrl}/api/files/put?pathname=${encodeURIComponent(pathname)}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: fileContent,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${text}`);
    }

    console.log(`  ${createProgressBar(100)}`);
    const result = await response.json();
    return result.url;
  }

  // For large files, use chunked upload via @vercel/blob/client
  const fileContent = readFileSync(filePath);
  const blob = new Blob([fileContent], { type: contentType });

  let lastProgress = 0;
  const result = await upload(pathname, blob, {
    access: 'public',
    handleUploadUrl: `${frontendUrl}/api/files/upload`,
    onUploadProgress: (event) => {
      if (event.total) {
        const percent = Math.round((event.loaded / event.total) * 100);
        if (percent !== lastProgress) {
          lastProgress = percent;
          process.stdout.write(`\r  ${createProgressBar(percent)} ${formatBytes(event.loaded)}/${formatBytes(event.total)}`);
        }
      }
    },
  });

  console.log(''); // New line after progress bar
  return result.url;
}

async function publishCommand(agentFolderArg, restArgs) {
  const folderToUse = agentFolderArg || '.';
  const options = parsePublishArgs(restArgs);
  const { agentFolder, agentJsonPath } = validateFolder(folderToUse);
  const agentDef = JSON.parse(readFileSync(agentJsonPath, 'utf-8'));

  console.log(`\nPublishing ${agentDef.name} v${agentDef.version}`);
  console.log(`${agentDef.description}`);
  console.log(`Frontend: ${options.frontend}\n`);

  // Generate unique prefix for this publish
  const timestamp = Date.now();
  const slug = agentDef.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Step 1: Build Docker image
  console.log('Step 1: Building Docker image...');
  const imageName = `agent-publish-${slug}-${timestamp}`;

  try {
    execSync(`docker build --platform linux/amd64 -t ${imageName} ${agentFolder}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to build Docker image');
    process.exit(1);
  }

  // Step 2: Export to temporary tar file
  console.log('\nStep 2: Exporting container image...');
  const tempTarPath = path.join(agentFolder, `.agent-${timestamp}.tar`);

  try {
    execSync(`docker save ${imageName} -o ${tempTarPath}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to export image');
    process.exit(1);
  }

  // Cleanup local docker image
  try {
    execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
  } catch {}

  let containerUrl = null;
  let metadataUrl = null;
  let imageUrl = null;

  try {
    // Step 3: Upload container tar
    console.log('\nStep 3: Uploading container...');
    const containerPathname = `agents/containers/${slug}-${timestamp}.tar`;
    containerUrl = await uploadFile(options.frontend, tempTarPath, containerPathname, 'application/x-tar');
    console.log(`  Container URL: ${containerUrl}`);

    // Step 4: Check if image is a local file and upload it
    const metadata = { ...agentDef };
    if (metadata.image && !metadata.image.startsWith('http://') && !metadata.image.startsWith('https://')) {
      const imagePath = path.resolve(agentFolder, metadata.image);
      if (existsSync(imagePath)) {
        console.log('\nStep 4: Uploading local image...');
        const imageExt = path.extname(imagePath);
        const imagePathname = `agents/images/${slug}-${timestamp}${imageExt}`;
        const imageMimeType = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
        }[imageExt.toLowerCase()] || 'image/png';

        imageUrl = await uploadFile(options.frontend, imagePath, imagePathname, imageMimeType);
        metadata.image = imageUrl;
        console.log(`  Image URL: ${imageUrl}`);
      } else {
        console.log(`\nStep 4: Skipping image (file not found: ${imagePath})`);
      }
    } else {
      console.log('\nStep 4: Skipping image upload (already a URL or not specified)');
    }

    // Step 5: Upload metadata JSON (with updated image URL if applicable)
    console.log('\nStep 5: Uploading metadata...');
    const tempMetadataPath = path.join(agentFolder, `.agent-metadata-${timestamp}.json`);
    writeFileSync(tempMetadataPath, JSON.stringify(metadata, null, 2));

    const metadataPathname = `agents/metadata/${slug}-${timestamp}.json`;
    metadataUrl = await uploadFile(options.frontend, tempMetadataPath, metadataPathname, 'application/json');
    console.log(`  Metadata URL: ${metadataUrl}`);

    // Cleanup temp metadata file
    try {
      execSync(`rm "${tempMetadataPath}"`, { stdio: 'ignore' });
    } catch {}

  } finally {
    // Cleanup temp tar file
    try {
      execSync(`rm ${tempTarPath}`, { stdio: 'ignore' });
    } catch {}
  }

  // Output summary
  console.log('\n' + '='.repeat(60));
  console.log('PUBLISH COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nAgent: ${agentDef.name} v${agentDef.version}`);

  // Check if agentId exists in the metadata
  const agentId = agentDef.agentId;
  if (agentId) {
    console.log(`Agent ID: ${agentId}`);
  }

  console.log(`\nURLs:`);
  console.log(`  Metadata URI:   ${metadataUrl}`);
  console.log(`  Container URI:  ${containerUrl}`);
  if (imageUrl) {
    console.log(`  Image URI:      ${imageUrl}`);
  }

  // Build management URL with query params
  // Route to /agent/[id]/manage if agentId exists, otherwise /admin
  let manageUrl;
  if (agentId) {
    const params = new URLSearchParams({
      metadataUri: metadataUrl,
      containerImageUri: containerUrl,
    });
    manageUrl = `${options.frontend}/agent/${agentId}/manage?${params.toString()}`;
  } else {
    const params = new URLSearchParams({
      metadataUri: metadataUrl,
      containerImageUri: containerUrl,
    });
    manageUrl = `${options.frontend}/admin?${params.toString()}`;
    console.log('\nNote: No agentId found in agent.json. Opening generic admin panel.');
    console.log('Consider adding an "agentId" field to your agent.json for better workflow.');
  }

  console.log('\nOpening Agent Management in browser...');
  console.log('='.repeat(60) + '\n');

  // Open browser
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${manageUrl}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${manageUrl}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${manageUrl}"`, { stdio: 'ignore' });
    }
  } catch (err) {
    console.log(`Could not open browser. Visit this URL to complete registration:`);
    console.log(`  ${manageUrl}\n`);
  }
}

// ============================================================================
// DEV COMMAND
// ============================================================================

async function devCommand(agentFolderArg) {
  const folderToUse = agentFolderArg || '.';
  const { agentFolder, agentJsonPath } = validateFolder(folderToUse);

  // State
  let agentDef = null;
  let containerName = null;
  let containerProcess = null;
  let isRebuilding = false;

  // Load agent definition
  function loadAgentDef() {
    agentDef = JSON.parse(readFileSync(agentJsonPath, 'utf-8'));
    console.log(`Loaded agent: ${agentDef.name} v${agentDef.version}`);
    return agentDef;
  }

  // Build Docker image
  function buildImage() {
    const imageName = `agent-test-${agentDef.name.toLowerCase().replace(/\s+/g, '-')}`;

    console.log(`Building Docker image: ${imageName}...`);
    try {
      execSync(`docker build --platform linux/amd64 -t ${imageName} ${agentFolder}`, { stdio: 'inherit' });
      return imageName;
    } catch (error) {
      console.error('Failed to build Docker image');
      return null;
    }
  }

  // Stop current container
  function stopContainer() {
    if (containerName) {
      console.log('Stopping container...');
      try {
        execSync(`docker stop ${containerName}`, { stdio: 'ignore' });
      } catch {}
      containerName = null;
      containerProcess = null;
    }
  }

  // Start container
  function startContainer(imageName) {
    containerName = `agent-test-${Date.now()}`;

    try {
      // Clean up any containers using our port
      try {
        const containersOnPort = execSync(`docker ps -q --filter "publish=${HOST_PORT}"`, { encoding: 'utf-8' }).trim();
        if (containersOnPort) {
          console.log('Stopping existing container on port...');
          execSync(`docker rm -f ${containersOnPort}`, { stdio: 'ignore' });
        }
      } catch {}

      console.log(`Starting container on port ${HOST_PORT}...`);

      containerProcess = spawn('docker', [
        'run',
        '--rm',
        '--name', containerName,
        '-p', `${HOST_PORT}:${CONTAINER_PORT}`,
        imageName
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      containerProcess.stdout.on('data', (data) => {
        process.stdout.write(`[container] ${data}`);
      });

      containerProcess.stderr.on('data', (data) => {
        process.stderr.write(`[container] ${data}`);
      });

      containerProcess.on('exit', (code) => {
        if (!isRebuilding) {
          console.log(`Container exited with code ${code}`);
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to start container:', error.message);
      return false;
    }
  }

  // Wait for container to be ready
  async function waitForContainer(maxAttempts = 30) {
    console.log('Waiting for container to be ready...');
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${HOST_PORT}/health`);
        if (response.ok) {
          console.log('Container is ready!');
          return true;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  // Build and start
  async function buildAndStart() {
    loadAgentDef();

    const imageName = buildImage();
    if (!imageName) return false;

    if (!startContainer(imageName)) return false;

    await new Promise(r => setTimeout(r, 2000));

    return await waitForContainer();
  }

  // Rebuild on file change
  async function rebuild() {
    if (isRebuilding) return;
    isRebuilding = true;

    console.log('\n' + '='.repeat(50));
    console.log('File change detected, rebuilding...');
    console.log('='.repeat(50) + '\n');

    stopContainer();

    await new Promise(r => setTimeout(r, 500));

    const success = await buildAndStart();

    if (success) {
      console.log('\n' + '='.repeat(50));
      console.log('Rebuild complete!');
      console.log(`Agent Tester UI: http://localhost:${UI_PORT}`);
      console.log(`Agent container: http://localhost:${HOST_PORT}`);
      console.log('='.repeat(50) + '\n');
    } else {
      console.error('Rebuild failed - waiting for next change...');
    }

    isRebuilding = false;
  }

  // Generate the web UI HTML
  function generateUI() {
    const functions = agentDef.abi.filter(f => f.type === 'function');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${agentDef.name} - Agent Tester</title>
  <script type="module">
    import { encodeFunctionData, decodeFunctionResult } from 'https://esm.sh/viem@2.21.0';

    let abi = null;

    async function loadAbi() {
      const res = await fetch('/abi');
      abi = await res.json();
    }

    loadAbi();

    window.callFunction = async function(fnName) {
      if (!abi) await loadAbi();

      const fn = abi.find(f => f.name === fnName);
      if (!fn) return;

      const resultDiv = document.getElementById('result-' + fnName);
      const receiptDiv = document.getElementById('receipt-' + fnName);
      const errorDiv = document.getElementById('error-' + fnName);
      resultDiv.textContent = '';
      receiptDiv.textContent = '';
      errorDiv.textContent = '';

      try {
        const args = fn.inputs.map((input, i) => {
          const el = document.getElementById(fnName + '-' + input.name);
          const value = el.value;

          if (input.type === 'uint256' || input.type === 'int256') {
            return BigInt(value);
          } else if (input.type === 'bool') {
            return value === 'true';
          } else if (input.type.endsWith('[]')) {
            return JSON.parse(value);
          }
          return value;
        });

        const calldata = encodeFunctionData({
          abi,
          functionName: fnName,
          args
        });

        console.log('Calldata:', calldata);

        const response = await fetch('/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calldata })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text);
        }

        const { responseHex, steps } = await response.json();
        console.log('Response:', responseHex);
        console.log('Steps:', steps);

        const result = decodeFunctionResult({
          abi,
          functionName: fnName,
          data: responseHex
        });

        resultDiv.textContent = JSON.stringify(result, (k, v) =>
          typeof v === 'bigint' ? v.toString() : v, 2);

        if (steps && steps.length > 0) {
          receiptDiv.innerHTML = renderReceipt(steps, responseHex);
        }

      } catch (error) {
        console.error(error);
        errorDiv.textContent = error.message;
      }
    };

    // Render receipt with tabs
    function renderReceipt(steps, resultHex) {
      const stepsHtml = steps.map((step, idx) => {
        const { name, ...rest } = step;
        const fields = Object.entries(rest);
        const color = getStepColor(name);

        const fieldsHtml = fields.length > 0
          ? '<div class="step-fields">' + fields.map(([k, v]) =>
              '<div class="step-field"><span class="field-key">' + escapeHtml(k) + ':</span> <span class="field-value">' + escapeHtml(formatValue(v)) + '</span></div>'
            ).join('') + '</div>'
          : '';

        return '<div class="step">' +
          '<div class="step-indicator" style="background:' + color.bg + ';border-color:' + color.border + ';color:' + color.text + '">' + (idx + 1) + '</div>' +
          '<div class="step-content">' +
            '<div class="step-name" style="color:' + color.text + '">' + escapeHtml(name) + '</div>' +
            fieldsHtml +
          '</div>' +
        '</div>';
      }).join('');

      const jsonHtml = '<pre class="json-view">' + escapeHtml(JSON.stringify(steps, null, 2)) + '</pre>';

      return '<div class="receipt-container">' +
        '<div class="receipt-tabs">' +
          '<button class="receipt-tab active" onclick="switchTab(this, \\'formatted\\')">Formatted</button>' +
          '<button class="receipt-tab" onclick="switchTab(this, \\'json\\')">JSON</button>' +
        '</div>' +
        '<div class="receipt-content">' +
          '<div class="tab-panel active" data-tab="formatted">' +
            '<div class="steps-list">' + stepsHtml + '</div>' +
            (resultHex ? '<div class="result-hex"><span class="result-hex-label">Raw result:</span> <code>' + escapeHtml(resultHex) + '</code></div>' : '') +
          '</div>' +
          '<div class="tab-panel" data-tab="json">' + jsonHtml + '</div>' +
        '</div>' +
      '</div>';
    }

    function getStepColor(name) {
      if (name.includes('error')) return { bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.3)', text: '#f87171' };
      if (name.includes('completed') || name.includes('encoded')) return { bg: 'rgba(16,185,129,0.2)', border: 'rgba(16,185,129,0.3)', text: '#10b981' };
      if (name.includes('started')) return { bg: 'rgba(59,130,246,0.2)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' };
      if (name.includes('request') || name.includes('response')) return { bg: 'rgba(168,85,247,0.2)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' };
      return { bg: 'rgba(107,114,128,0.2)', border: 'rgba(107,114,128,0.3)', text: '#9ca3af' };
    }

    function formatValue(v) {
      if (v === null || v === undefined) return 'null';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }

    function escapeHtml(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.switchTab = function(btn, tabName) {
      const container = btn.closest('.receipt-container');
      container.querySelectorAll('.receipt-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      container.querySelector('.tab-panel[data-tab="' + tabName + '"]').classList.add('active');
    };
  </script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
    }
    h1 {
      color: #fff;
      margin-bottom: 5px;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .description { color: #a3a3a3; margin-bottom: 30px; font-size: 14px; }
    .version {
      color: #10b981;
      font-size: 12px;
      background: rgba(16, 185, 129, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 8px;
    }
    .function-card {
      background: #141414;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
      border: 1px solid #262626;
      transition: border-color 0.2s;
    }
    .function-card:hover { border-color: #404040; }
    .function-name {
      font-size: 16px;
      font-weight: 600;
      color: #a78bfa;
      margin-bottom: 12px;
    }
    .signature {
      font-family: inherit;
      font-size: 11px;
      color: #a3a3a3;
      margin-bottom: 16px;
      padding: 10px 12px;
      background: #0a0a0a;
      border-radius: 6px;
      border: 1px solid #262626;
    }
    .input-group { margin-bottom: 14px; }
    label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 6px;
      color: #d4d4d4;
    }
    .type-hint { font-size: 11px; color: #737373; font-weight: normal; }
    input, textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #262626;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      background: #0a0a0a;
      color: #e5e5e5;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: #a78bfa;
      box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.1);
    }
    input::placeholder { color: #525252; }
    button {
      background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 12px;
      font-family: inherit;
      transition: transform 0.1s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    button:active { transform: translateY(0); }
    .result {
      margin-top: 16px;
      padding: 14px;
      background: rgba(16, 185, 129, 0.1);
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-all;
      display: none;
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }
    .result:not(:empty) { display: block; }
    .receipt {
      margin-top: 12px;
      display: none;
    }
    .receipt:not(:empty) { display: block; }
    .receipt-container {
      background: rgba(0,0,0,0.3);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      overflow: hidden;
    }
    .receipt-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .receipt-tab {
      background: transparent;
      border: none;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 500;
      color: #737373;
      cursor: pointer;
      border-radius: 4px;
      margin: 0;
      transition: all 0.15s;
    }
    .receipt-tab:hover { color: #a3a3a3; background: rgba(255,255,255,0.05); }
    .receipt-tab.active { color: #fff; background: rgba(255,255,255,0.1); }
    .receipt-content { padding: 12px; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .steps-list { display: flex; flex-direction: column; gap: 8px; }
    .step {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .step-indicator {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid;
      flex-shrink: 0;
    }
    .step-content {
      flex: 1;
      min-width: 0;
    }
    .step-name {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .step-fields {
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .step-field {
      font-size: 11px;
      margin-bottom: 2px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .step-field:last-child { margin-bottom: 0; }
    .field-key { color: #737373; flex-shrink: 0; }
    .field-value { color: #d4d4d4; word-break: break-all; }
    .result-hex {
      margin-top: 12px;
      padding: 10px;
      background: rgba(16,185,129,0.1);
      border-radius: 6px;
      border: 1px solid rgba(16,185,129,0.2);
      font-size: 10px;
    }
    .result-hex-label { color: #10b981; font-weight: 600; }
    .result-hex code { color: rgba(16,185,129,0.7); word-break: break-all; }
    .json-view {
      font-size: 10px;
      color: #93c5fd;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .error {
      margin-top: 16px;
      padding: 14px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 8px;
      color: #f87171;
      font-size: 13px;
      display: none;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .error:not(:empty) { display: block; }
  </style>
</head>
<body>
  <h1>${agentDef.name}</h1>
  <p class="version">v${agentDef.version}</p>
  <p class="description">${agentDef.description}</p>

  ${functions.map(fn => {
    const sig = `${fn.name}(${fn.inputs.map(i => i.type).join(', ')})`;
    const outputs = fn.outputs.map(o => `${o.name || 'result'}: ${o.type}`).join(', ');

    return `
  <div class="function-card">
    <div class="function-name">${fn.name}</div>
    <div class="signature">${sig} &rarr; (${outputs})</div>

    ${fn.inputs.map(input => `
    <div class="input-group">
      <label>${input.name} <span class="type-hint">(${input.type})</span></label>
      <input type="text" id="${fn.name}-${input.name}" placeholder="Enter ${input.type}">
    </div>
    `).join('')}

    <button onclick="callFunction('${fn.name}')">Call ${fn.name}</button>

    <div class="result" id="result-${fn.name}"></div>
    <div class="receipt" id="receipt-${fn.name}"></div>
    <div class="error" id="error-${fn.name}"></div>
  </div>
    `;
  }).join('')}

</body>
</html>`;
  }

  // Start UI server
  function startUIServer() {
    const server = createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateUI());
        return;
      }

      if (req.method === 'GET' && req.url === '/abi') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(agentDef.abi));
        return;
      }

      if (req.method === 'POST' && req.url === '/proxy') {
        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const { calldata } = body;
          const requestId = body.requestId || crypto.randomUUID();

          // Send JSON request to agent container: { requestId, request: hex }
          const agentResponse = await fetch(`http://localhost:${HOST_PORT}/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requestId,
              request: calldata,
            })
          });

          if (!agentResponse.ok) {
            const text = await agentResponse.text();
            res.writeHead(agentResponse.status, { 'Content-Type': 'text/plain' });
            res.end(text);
            return;
          }

          // Parse JSON response: { steps: array, result: hex }
          const jsonResponse = await agentResponse.json();
          const responseHex = jsonResponse.result || '0x';
          const steps = jsonResponse.steps || null;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ responseHex, steps }));

        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(error.message);
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(UI_PORT, () => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Agent Tester UI: http://localhost:${UI_PORT}`);
      console.log(`Agent container: http://localhost:${HOST_PORT}`);
      console.log('Watching for file changes...');
      console.log('='.repeat(50) + '\n');
      console.log('Press Ctrl+C to stop\n');

      // Open browser
      const url = `http://localhost:${UI_PORT}`;
      const platform = process.platform;
      try {
        if (platform === 'darwin') {
          execSync(`open ${url}`, { stdio: 'ignore' });
        } else if (platform === 'win32') {
          execSync(`start ${url}`, { stdio: 'ignore' });
        } else {
          execSync(`xdg-open ${url}`, { stdio: 'ignore' });
        }
      } catch {}
    });

    return server;
  }

  // Watch for file changes
  function startWatcher() {
    let debounceTimer = null;

    watch(agentFolder, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.includes('node_modules') || filename.startsWith('.')) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        console.log(`Changed: ${filename}`);
        rebuild();
      }, 500);
    });
  }

  // Cleanup on exit
  function cleanup() {
    console.log('\nShutting down...');
    stopContainer();
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Run dev server
  console.log(`\nAgent Tester - Watching ${agentFolder}\n`);

  const success = await buildAndStart();
  if (!success) {
    console.error('Initial build failed');
    process.exit(1);
  }

  startUIServer();
  startWatcher();
}

// ============================================================================
// MAIN
// ============================================================================

switch (command) {
  case 'create':
    createCommand(args[1]);
    break;
  case 'dev':
    devCommand(args[1]);
    break;
  case 'publish':
    publishCommand(args[1], args.slice(2));
    break;
  default:
    console.error(`Unknown command: ${command}`);
    usage();
}
