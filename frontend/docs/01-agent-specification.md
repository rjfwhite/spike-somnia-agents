# Agent Specification

## What is an Agent Specification?

An agent specification (`agent.spec.json`) defines the **interface** of your agent using Ethereum ABI-compatible types. It describes:
- Agent metadata (name, version, description)
- Available methods
- Input parameters for each method
- Output parameters for each method

## Specification Format

### Basic Structure

```json
{
  "name": "my-agent",
  "version": "1.0.0",
  "description": "A sample agent",
  "author": "Your Name",
  "homepage": "https://example.com",
  "repository": "https://github.com/you/my-agent",
  "tags": ["utility", "data"],
  "methods": [
    {
      "name": "methodName",
      "description": "What this method does",
      "inputs": [
        {
          "name": "paramName",
          "type": "string",
          "description": "Parameter description"
        }
      ],
      "outputs": [
        {
          "name": "result",
          "type": "string",
          "description": "Return value description"
        }
      ]
    }
  ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique agent name (lowercase, hyphens) |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `description` | string | Brief description of agent functionality |
| `methods` | array | Array of method definitions |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Agent creator name or organization |
| `homepage` | string | Agent website or documentation URL |
| `repository` | string | Source code repository URL |
| `tags` | array | Tags for categorization/discovery |
| `image` | string | IPFS CID of container image |

## Method Definitions

Each method in the `methods` array must specify:

### Method Structure

```json
{
  "name": "greet",
  "description": "Greets a user by name",
  "inputs": [
    {
      "name": "userName",
      "type": "string",
      "description": "The name to greet"
    }
  ],
  "outputs": [
    {
      "name": "greeting",
      "type": "string",
      "description": "The greeting message"
    }
  ]
}
```

### Method Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Method name (camelCase recommended) |
| `description` | No | What the method does |
| `inputs` | Yes | Array of input parameters (can be empty) |
| `outputs` | Yes | Array of output parameters (can be empty) |

## ABI Parameter Types

All parameters use **Ethereum ABI types** for encoding/decoding.

### Elementary Types

| Type | Description | Example Value |
|------|-------------|---------------|
| `uint256` | Unsigned 256-bit integer | `"12345"` |
| `int256` | Signed 256-bit integer | `"-100"` |
| `address` | Ethereum address (20 bytes) | `"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"` |
| `bool` | Boolean | `true` or `false` |
| `string` | UTF-8 string | `"hello world"` |
| `bytes` | Dynamic byte array | `"0x1234abcd"` |
| `bytes32` | Fixed 32-byte array | `"0x000...000"` |
| `bytes1` to `bytes31` | Fixed byte arrays | Variable |
| `uint8` to `uint256` | Unsigned integers | Variable |
| `int8` to `int256` | Signed integers | Variable |

### Array Types

Arrays are specified by appending `[]` to any type:

```json
{
  "name": "numbers",
  "type": "uint256[]",
  "description": "Array of numbers"
}
```

**Fixed-size arrays** use `[N]` syntax:

```json
{
  "name": "coordinates",
  "type": "uint256[3]",
  "description": "3D coordinates"
}
```

### Tuple Types (Structs)

Complex structures use `tuple` type with `components`:

```json
{
  "name": "user",
  "type": "tuple",
  "description": "User information",
  "components": [
    {
      "name": "name",
      "type": "string"
    },
    {
      "name": "age",
      "type": "uint256"
    },
    {
      "name": "wallet",
      "type": "address"
    }
  ]
}
```

**Arrays of tuples:**

```json
{
  "name": "users",
  "type": "tuple[]",
  "components": [
    { "name": "name", "type": "string" },
    { "name": "age", "type": "uint256" }
  ]
}
```

## Complete Example

Here's a complete agent specification for a JSON selector agent:

```json
{
  "name": "json-selector",
  "version": "1.0.0",
  "description": "Fetches JSON from a URL and extracts values using selectors",
  "author": "Somnia Team",
  "homepage": "https://somnia.network",
  "tags": ["data", "json", "utility"],
  "methods": [
    {
      "name": "select",
      "description": "Fetch JSON and extract values using dot notation selectors",
      "inputs": [
        {
          "name": "url",
          "type": "string",
          "description": "URL to fetch JSON from"
        },
        {
          "name": "selectors",
          "type": "string[]",
          "description": "Array of dot-notation selectors (e.g., 'user.name', 'data[0].id')"
        }
      ],
      "outputs": [
        {
          "name": "values",
          "type": "string[]",
          "description": "Extracted values as strings"
        }
      ]
    }
  ]
}
```

## Validation

The agent builder automatically validates your specification:

```bash
agent-builder validate
```

### Common Validation Rules

- Method names must be valid identifiers
- All parameter types must be valid ABI types
- Tuple types must have `components` array
- Array types must use `[]` or `[N]` syntax
- No duplicate method names
- No duplicate parameter names within a method

## Best Practices

### Naming Conventions

- **Agent names**: lowercase with hyphens (e.g., `my-awesome-agent`)
- **Method names**: camelCase (e.g., `getUserData`)
- **Parameter names**: camelCase (e.g., `userName`, `maxResults`)

### Documentation

- Always include `description` fields
- Describe input/output parameters clearly
- Include usage examples in agent homepage
- Document any limitations or requirements

### Versioning

Use semantic versioning:
- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features, backward compatible
- **Patch** (1.0.0 → 1.0.1): Bug fixes

### Type Selection

- Use `uint256` for non-negative numbers (most common)
- Use `address` for wallet/contract addresses
- Use `string` for text (UTF-8 encoded)
- Use `bytes` for binary data
- Use tuples for complex structures
- Avoid fixed-size types unless necessary

## Interactive Specification Builder

Use the CLI to build specifications interactively:

```bash
# Add a new method
agent-builder spec --add

# Edit existing specification
agent-builder spec --edit

# View current specification
agent-builder spec --view
```

## Next Steps

- [Learn how to build agents](./02-building-agents.md)
- [Understand container requirements](./03-container-requirements.md)
- [See complete examples](./06-examples.md)
