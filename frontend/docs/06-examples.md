# Agent Examples

This section provides complete, production-ready examples of Somnia agents covering common use cases.

## Example 1: Greeting Agent

A simple agent that greets users by name.

### Specification

```json
{
  "name": "greeting-agent",
  "version": "1.0.0",
  "description": "Returns personalized greetings",
  "author": "Somnia Team",
  "methods": [
    {
      "name": "greet",
      "description": "Returns a personalized greeting",
      "inputs": [
        {
          "name": "name",
          "type": "string",
          "description": "Name to greet"
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
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { encodeAbiParameters, decodeAbiParameters } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

function decode(buffer, types) {
  return decodeAbiParameters(types, `0x${buffer.toString('hex')}`);
}

function encode(values, types) {
  const hex = encodeAbiParameters(types, values);
  return Buffer.from(hex.slice(2), 'hex');
}

app.post('/greet', (req, res) => {
  try {
    const [name] = decode(req.body, [{ type: 'string' }]);
    const greeting = `Hello, ${name}! Welcome to Somnia Agents.`;
    const encoded = encode([greeting], [{ type: 'string' }]);
    res.send(encoded);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(80, () => {
  console.log('Greeting agent listening on port 80');
});
```

### Dockerfile

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js ./
EXPOSE 80
CMD ["node", "server.js"]
```

---

## Example 2: JSON Selector Agent

Fetches JSON from a URL and extracts values using dot notation selectors.

### Specification

```json
{
  "name": "json-selector",
  "version": "1.0.0",
  "description": "Fetches JSON and extracts values using selectors",
  "author": "Somnia Team",
  "tags": ["data", "json", "utility"],
  "methods": [
    {
      "name": "select",
      "description": "Fetch JSON and extract values",
      "inputs": [
        {
          "name": "url",
          "type": "string",
          "description": "URL to fetch JSON from"
        },
        {
          "name": "selectors",
          "type": "string[]",
          "description": "Dot notation selectors (e.g., 'user.name')"
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

### Implementation (Node.js)

```javascript
const express = require('express');
const { encodeAbiParameters, decodeAbiParameters } = require('viem');
const _ = require('lodash');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

function decode(buffer, types) {
  return decodeAbiParameters(types, `0x${buffer.toString('hex')}`);
}

function encode(values, types) {
  const hex = encodeAbiParameters(types, values);
  return Buffer.from(hex.slice(2), 'hex');
}

app.post('/select', async (req, res) => {
  try {
    // Decode inputs
    const [url, selectors] = decode(req.body, [
      { type: 'string' },
      { type: 'string[]' }
    ]);

    // Validate URL
    if (!url.startsWith('https://')) {
      return res.status(400).send('Only HTTPS URLs allowed');
    }

    // Fetch JSON
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).send('Failed to fetch URL');
    }

    const data = await response.json();

    // Extract values using selectors
    const values = selectors.map(selector => {
      const value = _.get(data, selector);
      return value !== undefined ? String(value) : '';
    });

    // Encode output
    const encoded = encode([values], [{ type: 'string[]' }]);
    res.send(encoded);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(80);
```

### Usage Example

```javascript
// Request
const url = 'https://api.example.com/user/123';
const selectors = ['name', 'email', 'profile.age'];

// Response
// values = ['Alice', 'alice@example.com', '25']
```

---

## Example 3: Math Calculator Agent

Performs mathematical operations on numbers.

### Specification

```json
{
  "name": "math-calculator",
  "version": "1.0.0",
  "description": "Performs mathematical calculations",
  "methods": [
    {
      "name": "calculate",
      "description": "Performs basic arithmetic operations",
      "inputs": [
        {
          "name": "a",
          "type": "uint256",
          "description": "First number"
        },
        {
          "name": "b",
          "type": "uint256",
          "description": "Second number"
        }
      ],
      "outputs": [
        {
          "name": "sum",
          "type": "uint256",
          "description": "a + b"
        },
        {
          "name": "product",
          "type": "uint256",
          "description": "a * b"
        },
        {
          "name": "difference",
          "type": "uint256",
          "description": "a - b (or 0 if b > a)"
        }
      ]
    },
    {
      "name": "sumArray",
      "description": "Sum an array of numbers",
      "inputs": [
        {
          "name": "numbers",
          "type": "uint256[]",
          "description": "Array of numbers to sum"
        }
      ],
      "outputs": [
        {
          "name": "total",
          "type": "uint256",
          "description": "Sum of all numbers"
        }
      ]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { encodeAbiParameters, decodeAbiParameters } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

function decode(buffer, types) {
  return decodeAbiParameters(types, `0x${buffer.toString('hex')}`);
}

function encode(values, types) {
  const hex = encodeAbiParameters(types, values);
  return Buffer.from(hex.slice(2), 'hex');
}

app.post('/calculate', (req, res) => {
  try {
    const [a, b] = decode(req.body, [
      { type: 'uint256' },
      { type: 'uint256' }
    ]);

    const sum = a + b;
    const product = a * b;
    const difference = a >= b ? a - b : 0n;

    const encoded = encode([sum, product, difference], [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' }
    ]);

    res.send(encoded);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.post('/sumArray', (req, res) => {
  try {
    const [numbers] = decode(req.body, [{ type: 'uint256[]' }]);

    const total = numbers.reduce((acc, num) => acc + num, 0n);

    const encoded = encode([total], [{ type: 'uint256' }]);
    res.send(encoded);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(80);
```

---

## Example 4: User Info Processor (Tuples)

Processes user information using tuple types.

### Specification

```json
{
  "name": "user-processor",
  "version": "1.0.0",
  "description": "Processes user information",
  "methods": [
    {
      "name": "processUser",
      "description": "Process and validate user information",
      "inputs": [
        {
          "name": "user",
          "type": "tuple",
          "components": [
            { "name": "name", "type": "string" },
            { "name": "age", "type": "uint256" },
            { "name": "email", "type": "string" },
            { "name": "wallet", "type": "address" }
          ]
        }
      ],
      "outputs": [
        {
          "name": "summary",
          "type": "string",
          "description": "User summary"
        },
        {
          "name": "isAdult",
          "type": "bool",
          "description": "Whether user is 18+"
        }
      ]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { encodeAbiParameters, decodeAbiParameters } = require('viem');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

function decode(buffer, types) {
  return decodeAbiParameters(types, `0x${buffer.toString('hex')}`);
}

function encode(values, types) {
  const hex = encodeAbiParameters(types, values);
  return Buffer.from(hex.slice(2), 'hex');
}

app.post('/processUser', (req, res) => {
  try {
    const [user] = decode(req.body, [
      {
        type: 'tuple',
        components: [
          { type: 'string', name: 'name' },
          { type: 'uint256', name: 'age' },
          { type: 'string', name: 'email' },
          { type: 'address', name: 'wallet' }
        ]
      }
    ]);

    const summary = `User: ${user.name}, Age: ${user.age}, Email: ${user.email}, Wallet: ${user.wallet}`;
    const isAdult = user.age >= 18n;

    const encoded = encode([summary, isAdult], [
      { type: 'string' },
      { type: 'bool' }
    ]);

    res.send(encoded);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(80);
```

---

## Example 5: Python Agent (Weather Data)

Example implementation using Python and Flask.

### Specification

```json
{
  "name": "weather-agent",
  "version": "1.0.0",
  "description": "Fetches weather data for a city",
  "methods": [
    {
      "name": "getWeather",
      "description": "Get current weather for a city",
      "inputs": [
        {
          "name": "city",
          "type": "string",
          "description": "City name"
        }
      ],
      "outputs": [
        {
          "name": "temperature",
          "type": "uint256",
          "description": "Temperature in Celsius"
        },
        {
          "name": "description",
          "type": "string",
          "description": "Weather description"
        }
      ]
    }
  ]
}
```

### Implementation (Python)

```python
from flask import Flask, request, Response
from eth_abi import decode, encode
import requests
import os

app = Flask(__name__)

WEATHER_API_KEY = os.getenv('WEATHER_API_KEY', '')

@app.route('/getWeather', methods=['POST'])
def get_weather():
    try:
        # Decode input
        raw_data = request.get_data()
        [city] = decode(['string'], raw_data)

        # Fetch weather data
        url = f'https://api.openweathermap.org/data/2.5/weather'
        params = {
            'q': city,
            'appid': WEATHER_API_KEY,
            'units': 'metric'
        }

        response = requests.get(url, params=params)

        if response.status_code != 200:
            return 'Failed to fetch weather data', 400

        data = response.json()
        temperature = int(data['main']['temp'])
        description = data['weather'][0]['description']

        # Encode output
        encoded = encode(['uint256', 'string'], [temperature, description])

        return Response(encoded, mimetype='application/octet-stream')

    except Exception as e:
        print(f'Error: {e}')
        return str(e), 500

@app.route('/health', methods=['GET'])
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
```

### Dockerfile (Python)

```dockerfile
FROM python:3.11-alpine

WORKDIR /app

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY server.py ./

EXPOSE 80

CMD ["python", "server.py"]
```

### requirements.txt

```
Flask==3.0.0
eth-abi==4.2.1
requests==2.31.0
```

---

## Example 6: Data Aggregator (Multiple APIs)

Aggregates data from multiple sources.

### Specification

```json
{
  "name": "data-aggregator",
  "version": "1.0.0",
  "description": "Aggregates data from multiple URLs",
  "methods": [
    {
      "name": "aggregate",
      "description": "Fetch and aggregate data from multiple URLs",
      "inputs": [
        {
          "name": "urls",
          "type": "string[]",
          "description": "Array of URLs to fetch"
        },
        {
          "name": "selector",
          "type": "string",
          "description": "JSON path to extract from each response"
        }
      ],
      "outputs": [
        {
          "name": "values",
          "type": "string[]",
          "description": "Extracted values"
        },
        {
          "name": "successCount",
          "type": "uint256",
          "description": "Number of successful fetches"
        }
      ]
    }
  ]
}
```

### Implementation (Node.js)

```javascript
const express = require('express');
const { encodeAbiParameters, decodeAbiParameters } = require('viem');
const _ = require('lodash');

const app = express();
app.use(express.raw({ type: '*/*', limit: '10mb' }));

function decode(buffer, types) {
  return decodeAbiParameters(types, `0x${buffer.toString('hex')}`);
}

function encode(values, types) {
  const hex = encodeAbiParameters(types, values);
  return Buffer.from(hex.slice(2), 'hex');
}

app.post('/aggregate', async (req, res) => {
  try {
    const [urls, selector] = decode(req.body, [
      { type: 'string[]' },
      { type: 'string' }
    ]);

    // Fetch all URLs in parallel
    const results = await Promise.allSettled(
      urls.map(url =>
        fetch(url)
          .then(r => r.json())
          .then(data => _.get(data, selector, ''))
      )
    );

    // Extract values
    const values = results.map(result =>
      result.status === 'fulfilled' ? String(result.value) : ''
    );

    const successCount = BigInt(
      results.filter(r => r.status === 'fulfilled').length
    );

    // Encode output
    const encoded = encode([values, successCount], [
      { type: 'string[]' },
      { type: 'uint256' }
    ]);

    res.send(encoded);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing request');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(80);
```

---

## Testing Examples

### Using Agent Builder CLI

```bash
# Test greeting agent
agent-builder test --method greet --input '{"name": "Alice"}'

# Test calculator
agent-builder test --method calculate --input '{"a": 100, "b": 50}'

# Test with array input
agent-builder test --method sumArray --input '{"numbers": [1, 2, 3, 4, 5]}'
```

### Using curl with ABI Encoding

```javascript
// encode-test.js
const { encodeAbiParameters } = require('viem');

const input = encodeAbiParameters(
  [{ type: 'string' }],
  ['Alice']
);

console.log(input);
```

```bash
# Encode input
node encode-test.js > input.hex

# Call agent
curl -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@input.hex" \
  http://localhost:8080/greet
```

## Best Practices

### Error Handling

```javascript
app.post('/method', async (req, res) => {
  try {
    // Decode
    const inputs = decode(req.body, types);

    // Validate
    if (!isValid(inputs)) {
      return res.status(400).send('Invalid input');
    }

    // Process
    const result = await processData(inputs);

    // Encode
    const encoded = encode([result], outputTypes);
    res.send(encoded);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal error');
  }
});
```

### Logging

```javascript
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});
```

### Timeouts

```javascript
app.use((req, res, next) => {
  req.setTimeout(25000); // 25 seconds
  next();
});
```

## Next Steps

- [Deploy your agent](./02-building-agents.md)
- [Set up an agent host](./04-running-agents.md)
- [Learn more about ABI encoding](./05-abi-encoding.md)
