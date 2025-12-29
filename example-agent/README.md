# Example Agent Container

## Summary

Created a Docker container implementing the three methods from `https://agents.src.host/test.json`.

## Implementation

### Methods

1. **greet(string name) → string greeting**
   - Takes a name as input
   - Returns: "Hello, {name}! Welcome to the Somnia Agents platform."

2. **add(uint256 a, uint256 b) → uint256 sum**
   - Takes two numbers
   - Returns their sum

3. **processData(bytes data) → (bytes result, bool success)**
   - Attempts to interpret data as UTF-8 text
   - Reverses and uppercases the text
   - Returns processed result and success flag

### Files Created

- [server.js](file:///Users/rjfwhite/spike-somnia-agents/example-agent/server.js) - Express server with ABI encoding/decoding
- [Dockerfile](file:///Users/rjfwhite/spike-somnia-agents/example-agent/Dockerfile) - Container definition
- [package.json](file:///Users/rjfwhite/spike-somnia-agents/example-agent/package.json) - Dependencies
- `example-agent.tar` - Built container image (63MB)

## Next Steps

The container is built and ready. To use it:

1. **Upload to IPFS** - The tar file needs to be uploaded to IPFS to get a CID
2. **Update metadata** - Update `https://agents.src.host/test.json` to set `container_image` to the IPFS CID

## Upload Options

Since IPFS CLI is not installed, you can:
- Install IPFS locally and upload
- Use a web service (web3.storage, nft.storage, pinata)
- Manually upload via IPFS web interface
