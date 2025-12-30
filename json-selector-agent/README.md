# JSON Selector Agent

## Summary

This agent enables fetching specific data from a remote JSON API. It takes a URL and a selector path, fetches the JSON content, extracts the value at the specified path, and returns it.

## Implementation

### Methods

#### 1. fetch(string url, string selector) → string result
- **Inputs**:
  - `url`: The full URL to the JSON endpoint (e.g., `https://api.example.com/data`).
  - `selector`: The dot-notation path to the desired field (e.g., `user.address.city` or `items[0].name`).
- **Returns**:
  - `result`: The extracted value converted to a string.

### Logic
1.  Decodes the ABI-encoded input parameters.
2.  Performs a GET request to the provided `url`.
3.  Parses the JSON response.
4.  Uses `lodash.get` to resolve the `selector` path.
5.  Encodes the result as a string and returns it.

### Files

- [server.js](server.js): The Express server implementing the logic.
- [Dockerfile](Dockerfile): Defines the container environment (Node.js Alpine).
- [package.json](package.json): Lists dependencies (`express`, `viem`, `axios`, `lodash`).
- `json-selector-agent.tar`: The built x86 Docker image.

## Usage

### Build
To build the Docker image and export it to a tar file:
```bash
docker build --platform linux/amd64 -t json-selector-agent .
docker save -o json-selector-agent.tar json-selector-agent
```

### Run Locally
```bash
npm install
PORT=8000 node server.js
```
