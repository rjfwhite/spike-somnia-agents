#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { createServer } from 'http';
import { readFileSync, existsSync, watch, mkdirSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import crypto from 'crypto';

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
  somnia-agent create [folder]                     Create a new agent from template
  somnia-agent dev <agent-folder>                  Run agent with web UI and file watching
  somnia-agent build <agent-folder> <output.tar>  Build agent to tar file

Commands:
  create  Create a new agent project from template
  dev     Start development server with hot reload
  build   Build Docker image and export as tar

Examples:
  somnia-agent create my-agent
  somnia-agent dev ./my-agent
  somnia-agent build ./my-agent ./my-agent.tar
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

  // Get template directory
  const templateDir = path.join(__dirname, '..', 'template');

  if (!existsSync(templateDir)) {
    console.error('Error: Template directory not found');
    process.exit(1);
  }

  console.log(`\nCreating agent: ${agentName}`);
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

    writeFileSync(targetPath, content);
    console.log(`  Created: ${file}`);
  }

  console.log(`
Done! Your agent has been created.

Next steps:
  cd ${folderName}
  npm install
  npx rob-somnia-agent dev .

Edit agent.json to define your functions, then implement them in server.js.
`);
}

// ============================================================================
// BUILD COMMAND
// ============================================================================

async function buildCommand(agentFolderArg, outputTar) {
  if (!agentFolderArg || !outputTar) {
    console.error('Usage: agent-tester build <agent-folder> <output.tar>');
    process.exit(1);
  }

  const { agentFolder, agentJsonPath } = validateFolder(agentFolderArg);
  const agentDef = JSON.parse(readFileSync(agentJsonPath, 'utf-8'));

  console.log(`\nBuilding ${agentDef.name} v${agentDef.version}`);
  console.log(`${agentDef.description}\n`);

  const imageName = `agent-build-${agentDef.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

  // Build image
  console.log('Building Docker image (linux/amd64)...');
  try {
    execSync(`docker build --platform linux/amd64 -t ${imageName} ${agentFolder}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to build Docker image');
    process.exit(1);
  }

  // Export to tar
  const outputPath = path.resolve(outputTar);
  console.log(`\nExporting to ${outputPath}...`);
  try {
    execSync(`docker save ${imageName} -o ${outputPath}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to export image');
    process.exit(1);
  }

  // Cleanup image
  console.log('Cleaning up...');
  try {
    execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
  } catch {}

  console.log(`\nDone! Image saved to ${outputPath}`);
}

// ============================================================================
// DEV COMMAND
// ============================================================================

async function devCommand(agentFolderArg) {
  if (!agentFolderArg) {
    console.error('Usage: agent-tester dev <agent-folder>');
    process.exit(1);
  }

  const { agentFolder, agentJsonPath } = validateFolder(agentFolderArg);

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

        if (steps) {
          receiptDiv.innerHTML = '<div class="receipt-label">Steps</div>' +
            JSON.stringify(steps, null, 2);
        }

      } catch (error) {
        console.error(error);
        errorDiv.textContent = error.message;
      }
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
      padding: 14px;
      background: rgba(59, 130, 246, 0.05);
      border-radius: 8px;
      font-family: inherit;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-all;
      display: none;
      border: 1px solid rgba(59, 130, 246, 0.2);
      color: #93c5fd;
    }
    .receipt:not(:empty) { display: block; }
    .receipt-label {
      font-size: 10px;
      font-weight: 600;
      color: #3b82f6;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
  case 'build':
    buildCommand(args[1], args[2]);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    usage();
}
