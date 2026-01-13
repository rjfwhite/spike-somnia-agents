# Agent Tester

A CLI tool for testing and building Somnia agents locally.

## Installation

```bash
cd agent-tester
npm install
npm link  # Optional: makes 'agent-tester' available globally
```

## Commands

### dev

Start a development server with hot reload:

```bash
agent-tester dev <agent-folder>
```

This will:
1. Build the Docker image from the Dockerfile
2. Run the container on port 9000
3. Start a web UI at http://localhost:3000
4. Watch for file changes and auto-rebuild

### build

Build the agent and export as a tar file:

```bash
agent-tester build <agent-folder> <output.tar>
```

This will:
1. Build the Docker image for linux/amd64
2. Export the image to the specified tar file
3. Clean up the temporary image

## Examples

```bash
# Development mode
agent-tester dev ./agents/test-agent

# Build for deployment
agent-tester build ./agents/test-agent ./test-agent.tar
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
