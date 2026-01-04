# ABI Encoding and Decoding

Somnia Agents use **Ethereum ABI (Application Binary Interface)** encoding for all method invocations and responses. This ensures type safety, cross-language compatibility, and seamless integration with blockchain tools.

## What is ABI Encoding?

ABI encoding is the standard way Ethereum encodes function calls and data. It provides:

- **Type safety**: Strict type checking
- **Deterministic encoding**: Same input always produces same output
- **Cross-language support**: Works with any language
- **Blockchain compatibility**: Direct integration with smart contracts

## ABI Types Reference

### Elementary Types

| Type | Description | Example Value | Encoded Size |
|------|-------------|---------------|--------------|
| `uint256` | Unsigned 256-bit integer | `12345` | 32 bytes |
| `uint8` to `uint256` | Unsigned integers (8-256 bits) | `255` | 32 bytes |
| `int256` | Signed 256-bit integer | `-100` | 32 bytes |
| `address` | Ethereum address (20 bytes) | `0x742d35Cc...` | 32 bytes |
| `bool` | Boolean value | `true` | 32 bytes |
| `bytes` | Dynamic byte array | `0x1234` | Dynamic |
| `bytes1` to `bytes32` | Fixed byte arrays | `0x00...` | 32 bytes |
| `string` | UTF-8 string | `"hello"` | Dynamic |

### Dynamic vs Static Types

**Static types** (fixed size):
- `uint256`, `int256`, `address`, `bool`
- `bytes1` to `bytes32`
- Fixed-size arrays like `uint256[3]`

**Dynamic types** (variable size):
- `string`
- `bytes`
- Arrays with `[]` like `uint256[]`
- Tuples containing dynamic types

## Encoding Examples

### Single Value Encoding

**String:**
```javascript
import { encodeAbiParameters } from 'viem';

const encoded = encodeAbiParameters(
  [{ type: 'string' }],
  ['hello world']
);

console.log(encoded);
// 0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000006b68656c6c6f20776f726c64000000000000000000000000000000000000000000
```

**uint256:**
```javascript
const encoded = encodeAbiParameters(
  [{ type: 'uint256' }],
  [12345n]
);

console.log(encoded);
// 0x0000000000000000000000000000000000000000000000000000000000003039
```

**Address:**
```javascript
const encoded = encodeAbiParameters(
  [{ type: 'address' }],
  ['0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb']
);
```

### Multiple Values

```javascript
const encoded = encodeAbiParameters(
  [
    { type: 'string', name: 'name' },
    { type: 'uint256', name: 'age' },
    { type: 'bool', name: 'active' }
  ],
  ['Alice', 25n, true]
);
```

### Arrays

**Dynamic array:**
```javascript
const encoded = encodeAbiParameters(
  [{ type: 'uint256[]' }],
  [[1n, 2n, 3n, 4n, 5n]]
);
```

**String array:**
```javascript
const encoded = encodeAbiParameters(
  [{ type: 'string[]' }],
  [['hello', 'world', 'foo']]
);
```

**Fixed-size array:**
```javascript
const encoded = encodeAbiParameters(
  [{ type: 'uint256[3]' }],
  [[1n, 2n, 3n]]
);
```

### Tuples (Structs)

**Simple tuple:**
```javascript
const encoded = encodeAbiParameters(
  [
    {
      type: 'tuple',
      components: [
        { name: 'name', type: 'string' },
        { name: 'age', type: 'uint256' }
      ]
    }
  ],
  [{ name: 'Alice', age: 25n }]
);
```

**Nested tuple:**
```javascript
const encoded = encodeAbiParameters(
  [
    {
      type: 'tuple',
      components: [
        { name: 'name', type: 'string' },
        {
          name: 'address',
          type: 'tuple',
          components: [
            { name: 'street', type: 'string' },
            { name: 'city', type: 'string' }
          ]
        }
      ]
    }
  ],
  [{
    name: 'Alice',
    address: {
      street: '123 Main St',
      city: 'New York'
    }
  }]
);
```

**Array of tuples:**
```javascript
const encoded = encodeAbiParameters(
  [
    {
      type: 'tuple[]',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'name', type: 'string' }
      ]
    }
  ],
  [[
    { id: 1n, name: 'Alice' },
    { id: 2n, name: 'Bob' }
  ]]
);
```

## Decoding Examples

### Single Value Decoding

```javascript
import { decodeAbiParameters } from 'viem';

const decoded = decodeAbiParameters(
  [{ type: 'string' }],
  '0x0000000000000000000000000000000000000000000000000000000000000020...'
);

console.log(decoded); // ['hello world']
```

### Multiple Values

```javascript
const decoded = decodeAbiParameters(
  [
    { type: 'string', name: 'name' },
    { type: 'uint256', name: 'age' },
    { type: 'bool', name: 'active' }
  ],
  encodedData
);

console.log(decoded);
// ['Alice', 25n, true]
```

### Destructuring

```javascript
const [name, age, active] = decodeAbiParameters(
  [
    { type: 'string' },
    { type: 'uint256' },
    { type: 'bool' }
  ],
  encodedData
);
```

## Agent Implementation Patterns

### Node.js with Viem (Recommended)

```javascript
const express = require('express');
const { encodeAbiParameters, decodeAbiParameters } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Helper functions
function decode(buffer, types) {
  return decodeAbiParameters(types, `0x${buffer.toString('hex')}`);
}

function encode(values, types) {
  const hex = encodeAbiParameters(types, values);
  return Buffer.from(hex.slice(2), 'hex');
}

// Method implementation
app.post('/greet', (req, res) => {
  // Decode input
  const [name] = decode(req.body, [{ type: 'string' }]);

  // Process
  const greeting = `Hello, ${name}!`;

  // Encode output
  const encoded = encode([greeting], [{ type: 'string' }]);

  res.send(encoded);
});

app.listen(80);
```

### Python with eth-abi

```python
from flask import Flask, request, Response
from eth_abi import decode, encode

app = Flask(__name__)

@app.route('/greet', methods=['POST'])
def greet():
    # Decode input
    raw_data = request.get_data()
    [name] = decode(['string'], raw_data)

    # Process
    greeting = f"Hello, {name}!"

    # Encode output
    encoded = encode(['string'], [greeting])

    return Response(encoded, mimetype='application/octet-stream')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
```

### Go with go-ethereum

```go
package main

import (
    "io"
    "net/http"
    "github.com/ethereum/go-ethereum/accounts/abi"
)

func greetHandler(w http.ResponseWriter, r *http.Request) {
    // Read request body
    body, _ := io.ReadAll(r.Body)

    // Define types
    stringType, _ := abi.NewType("string", "", nil)
    args := abi.Arguments{{Type: stringType}}

    // Decode
    decoded, _ := args.Unpack(body)
    name := decoded[0].(string)

    // Process
    greeting := "Hello, " + name + "!"

    // Encode
    encoded, _ := args.Pack(greeting)

    w.Write(encoded)
}

func main() {
    http.HandleFunc("/greet", greetHandler)
    http.ListenAndServe(":80", nil)
}
```

## Complex Examples

### Processing Arrays

```javascript
app.post('/sum', (req, res) => {
  // Input: uint256[] numbers
  const [numbers] = decode(req.body, [
    { type: 'uint256[]' }
  ]);

  // Calculate sum
  const sum = numbers.reduce((a, b) => a + b, 0n);

  // Output: uint256 sum
  const encoded = encode([sum], [
    { type: 'uint256' }
  ]);

  res.send(encoded);
});
```

### Working with Tuples

```javascript
app.post('/processUser', (req, res) => {
  // Input: tuple (string name, uint256 age, address wallet)
  const [user] = decode(req.body, [
    {
      type: 'tuple',
      components: [
        { type: 'string', name: 'name' },
        { type: 'uint256', name: 'age' },
        { type: 'address', name: 'wallet' }
      ]
    }
  ]);

  // Access tuple fields
  const message = `User ${user.name}, age ${user.age}, wallet ${user.wallet}`;

  // Output: string
  const encoded = encode([message], [
    { type: 'string' }
  ]);

  res.send(encoded);
});
```

### Multiple Inputs and Outputs

```javascript
app.post('/calculate', (req, res) => {
  // Input: uint256 a, uint256 b
  const [a, b] = decode(req.body, [
    { type: 'uint256', name: 'a' },
    { type: 'uint256', name: 'b' }
  ]);

  // Calculate
  const sum = a + b;
  const product = a * b;
  const difference = a - b;

  // Output: uint256 sum, uint256 product, uint256 difference
  const encoded = encode([sum, product, difference], [
    { type: 'uint256', name: 'sum' },
    { type: 'uint256', name: 'product' },
    { type: 'uint256', name: 'difference' }
  ]);

  res.send(encoded);
});
```

## Testing ABI Encoding

### Using Agent Builder

```bash
# Test method with encoded input
agent-builder test --method greet --input '{"name": "Alice"}'
```

### Manual Testing with Node.js

```javascript
const { encodeAbiParameters, decodeAbiParameters } = require('viem');

// Encode test input
const input = encodeAbiParameters(
  [{ type: 'string' }],
  ['Alice']
);

console.log('Encoded input:', input);

// Simulate agent call
const response = await fetch('http://localhost:8080/greet', {
  method: 'POST',
  body: Buffer.from(input.slice(2), 'hex')
});

const responseData = await response.arrayBuffer();

// Decode response
const [greeting] = decodeAbiParameters(
  [{ type: 'string' }],
  '0x' + Buffer.from(responseData).toString('hex')
);

console.log('Decoded output:', greeting);
```

### Using viem Test Client

```javascript
import { createTestClient, http } from 'viem';
import { foundry } from 'viem/chains';

const client = createTestClient({
  chain: foundry,
  mode: 'anvil',
  transport: http()
});

// Test encoding/decoding
const encoded = await client.encodeFunctionData({
  abi: agentAbi,
  functionName: 'greet',
  args: ['Alice']
});
```

## Common Pitfalls

### BigInt Handling

JavaScript numbers are not precise enough for uint256:

```javascript
// ❌ Wrong - loses precision
const value = 123456789012345678901234567890;

// ✅ Correct - use BigInt
const value = 123456789012345678901234567890n;
```

### Hex String Format

Always include `0x` prefix:

```javascript
// ❌ Wrong
const hex = buffer.toString('hex');

// ✅ Correct
const hex = '0x' + buffer.toString('hex');
```

### Buffer Conversion

```javascript
// Hex string to Buffer
const buffer = Buffer.from(hex.slice(2), 'hex');

// Buffer to hex string
const hex = '0x' + buffer.toString('hex');
```

### Type Mismatches

Types must match specification exactly:

```javascript
// Specification says uint256
// ❌ Wrong
encode([123], [{ type: 'string' }]);

// ✅ Correct
encode([123n], [{ type: 'uint256' }]);
```

## Tools and Libraries

### JavaScript/TypeScript

- **viem**: Modern, TypeScript-first (recommended)
- **ethers.js**: Popular, comprehensive
- **web3.js**: Original library

### Python

- **eth-abi**: Official implementation
- **web3.py**: Full Web3 library

### Go

- **go-ethereum (geth)**: Official Go implementation

### Rust

- **ethabi**: Rust ABI encoder/decoder

### Other Languages

- **Java**: web3j
- **C#**: Nethereum
- **Ruby**: ethereum.rb

## Performance Considerations

### Encoding Cost

- Static types: Constant time O(1)
- Dynamic types: Linear with data size O(n)
- Arrays: Linear with array length O(n)
- Tuples: Sum of component costs

### Memory Usage

- Each value padded to 32 bytes
- Dynamic types add offset pointers
- Large arrays can be memory-intensive

### Optimization Tips

- Use fixed types when possible
- Batch encode/decode operations
- Cache ABI type definitions
- Reuse Buffer objects

## Debugging

### Inspecting Encoded Data

```javascript
const encoded = encodeAbiParameters([{ type: 'string' }], ['hello']);

console.log('Hex:', encoded);
console.log('Length:', encoded.length);
console.log('Bytes:', Buffer.from(encoded.slice(2), 'hex'));
```

### Validation

```javascript
try {
  const decoded = decodeAbiParameters(types, data);
  console.log('Valid ABI encoding');
} catch (error) {
  console.error('Invalid ABI encoding:', error.message);
}
```

## Next Steps

- [See complete agent examples](./06-examples.md)
- [Learn about container requirements](./03-container-requirements.md)
- [Build your first agent](./02-building-agents.md)
