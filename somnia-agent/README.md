# Somnia Agents CLI

A CLI tool for testing and building Somnia agents locally.

## Installation

```bash
npm install -g somnia-agents
```

Or use directly with npx:

```bash
npx somnia-agents <command>
```

## Commands

### create

Generate a new agent from a template:

```bash
npx somnia-agents create [folder]
```

This will prompt you for the agent name and description, then create a new folder with all the necessary files.

### dev

Start a development server with hot reload:

```bash
npx somnia-agents dev [agent-folder]
```

This will:
1. Build the Docker image from the Dockerfile
2. Run the container on port 9000
3. Start a web UI at http://localhost:3000
4. Watch for file changes and auto-rebuild

If no folder is specified, uses the current directory.

### publish

Build and upload the agent to the hosting service:

```bash
npx somnia-agents publish [agent-folder]
```

This will:
1. Build the Docker image for linux/amd64
2. Export and upload the container tar file
3. Upload the agent metadata
4. Open the browser to complete registration

## Examples

```bash
# Create a new agent
npx somnia-agents create my-agent

# Development mode (current directory)
cd my-agent
npx somnia-agents dev

# Development mode (specific folder)
npx somnia-agents dev ./agents/test-agent

# Publish to network
npx somnia-agents publish
```

## Agent Folder Structure

The agent folder must contain:
- `agent.json` - Agent definition with ABI
- `Dockerfile` - Instructions to build the agent container

## Web UI

The web UI automatically generates input forms based on the agent's ABI:

- Each function gets its own card with input fields
- Input types are displayed to help with formatting
- Results are displayed as JSON
- Errors are shown in red

## Supported Input Types

- `string` - Enter text directly
- `uint256` / `int256` - Enter numbers (converted to BigInt)
- `bool` - Enter `true` or `false`
- `address` - Enter hex address with 0x prefix
- Arrays (`string[]`, `uint256[]`, etc.) - Enter as JSON array

## Ports

- **3000** - Web UI (dev mode)
- **9000** - Agent container (dev mode)

## Requirements

- Docker must be running
- Node.js 18+
