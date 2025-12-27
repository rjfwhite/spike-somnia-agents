import { writeFile, mkdir, access } from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import type { AgentConfig, AgentSpec, MethodDefinition, AbiParameter } from '../types.js';
import { saveConfig, saveSpec, configExists } from '../utils/config.js';

const SAMPLE_DOCKERFILE = `# Agent Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build if needed
RUN npm run build || true

# Expose port 80 (required by agent-host)
EXPOSE 80

# Start the agent
CMD ["npm", "start"]
`;

const SAMPLE_SERVER = `// Simple agent HTTP server
import http from 'http';

const PORT = 80;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', \`http://\${req.headers.host}\`);
  const method = url.pathname.slice(1); // Remove leading slash

  let body = [];
  req.on('data', chunk => body.push(chunk));

  req.on('end', () => {
    const callData = Buffer.concat(body);
    console.log(\`Received request: \${method}\`);
    console.log(\`Call data (hex): \${callData.toString('hex')}\`);

    // Handle the request based on method
    // The callData contains ABI-encoded input parameters
    // Return ABI-encoded output parameters
    
    try {
      const response = handleMethod(method, callData);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(response);
    } catch (error) {
      console.error(\`Error handling \${method}:\`, error);
      res.writeHead(500);
      res.end(\`Error: \${error.message}\`);
    }
  });
});

function handleMethod(method, callData) {
  switch (method) {
    case 'ping':
      // No inputs expected
      // Output: string message
      // For simplicity, return raw text (in production, use ABI encoding)
      return Buffer.from('pong');
      
    case 'echo':
      // Input: string message
      // Output: string message
      // Echo back the input (callData is ABI-encoded string)
      return callData;
      
    default:
      throw new Error(\`Unknown method: \${method}\`);
  }
}

server.listen(PORT, () => {
  console.log(\`Agent server listening on port \${PORT}\`);
});
`;

const SAMPLE_PACKAGE_JSON = `{
  "name": "my-agent",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "build": "echo 'No build step'"
  }
}
`;

interface InitOptions {
  name?: string;
  template?: string;
  force?: boolean;
}

export async function initCommand(directory: string = '.', options: InitOptions = {}): Promise<void> {
  const targetDir = path.resolve(directory);
  
  console.log(chalk.blue('🚀 Initializing new Somnia Agent project...\n'));

  // Check if config already exists
  if (!options.force && await configExists(targetDir)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Agent configuration already exists. Overwrite?',
      default: false,
    }]);
    
    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  // Gather information
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      default: options.name || path.basename(targetDir),
      validate: (input: string) => input.length > 0 || 'Name is required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description:',
      default: 'A Somnia agent',
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author (optional):',
    },
    {
      type: 'input',
      name: 'version',
      message: 'Version:',
      default: '1.0.0',
    },
    {
      type: 'confirm',
      name: 'createSampleMethods',
      message: 'Add sample methods (ping, echo)?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'createDockerfile',
      message: 'Create sample Dockerfile?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'createServer',
      message: 'Create sample server code?',
      default: true,
    },
  ]);

  // Build the spec with sample methods using standard ABI format
  const methods: MethodDefinition[] = [];
  
  if (answers.createSampleMethods) {
    // Ping method - no inputs, returns string
    methods.push({
      name: 'ping',
      description: 'Simple ping method that returns "pong"',
      inputs: [],
      outputs: [
        { 
          name: 'message', 
          type: 'string',
          internalType: 'string'
        }
      ],
    });
    
    // Echo method - takes string, returns string
    methods.push({
      name: 'echo',
      description: 'Echo back the input message',
      inputs: [
        {
          name: 'message',
          type: 'string',
          internalType: 'string'
        }
      ],
      outputs: [
        {
          name: 'message',
          type: 'string',
          internalType: 'string'
        }
      ],
    });
  }

  const spec: AgentSpec = {
    name: answers.name,
    version: answers.version,
    description: answers.description,
    author: answers.author || undefined,
    methods,
  };

  const config: AgentConfig = {
    spec,
    build: {
      dockerfile: 'Dockerfile',
      context: '.',
      tag: `${answers.name}:latest`,
    },
  };

  // Create directory if needed
  try {
    await mkdir(targetDir, { recursive: true });
  } catch {}

  // Save config files
  await saveConfig(config, targetDir);
  await saveSpec(spec, targetDir);
  
  console.log(chalk.green('✓ Created agent.config.json'));
  console.log(chalk.green('✓ Created agent.spec.json'));

  // Create sample files
  if (answers.createDockerfile) {
    const dockerfilePath = path.join(targetDir, 'Dockerfile');
    await writeFile(dockerfilePath, SAMPLE_DOCKERFILE);
    console.log(chalk.green('✓ Created Dockerfile'));
  }

  if (answers.createServer) {
    const serverPath = path.join(targetDir, 'server.js');
    await writeFile(serverPath, SAMPLE_SERVER);
    console.log(chalk.green('✓ Created server.js'));
    
    const packagePath = path.join(targetDir, 'package.json');
    try {
      await access(packagePath);
    } catch {
      await writeFile(packagePath, SAMPLE_PACKAGE_JSON);
      console.log(chalk.green('✓ Created package.json'));
    }
  }

  // Create .env.example
  const envExample = `# IPFS Pinata credentials (for uploading)
PINATA_API_KEY=your_api_key
PINATA_SECRET_KEY=your_secret_key
`;
  await writeFile(path.join(targetDir, '.env.example'), envExample);
  console.log(chalk.green('✓ Created .env.example'));

  // Create .gitignore
  const gitignore = `node_modules/
dist/
*.tar
.env
`;
  await writeFile(path.join(targetDir, '.gitignore'), gitignore);
  console.log(chalk.green('✓ Created .gitignore'));

  console.log(chalk.blue('\n✨ Agent project initialized!'));
  console.log(chalk.white('\nNext steps:'));
  console.log(chalk.gray('  1. Edit agent.spec.json to define your methods and ABIs'));
  console.log(chalk.gray('  2. Implement your agent logic in server.js'));
  console.log(chalk.gray('  3. Run: agent-builder build'));
  console.log(chalk.gray('  4. Run: agent-builder upload'));
  
  // Show example ABI format
  if (answers.createSampleMethods) {
    console.log(chalk.white('\nExample method ABI format (Ethereum standard):'));
    console.log(chalk.gray(JSON.stringify({
      type: 'function',
      name: 'echo',
      inputs: [{ name: 'message', type: 'string', internalType: 'string' }],
      outputs: [{ name: 'message', type: 'string', internalType: 'string' }],
      stateMutability: 'nonpayable'
    }, null, 2)));
  }
}
