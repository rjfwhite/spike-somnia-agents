const { encodeAbiParameters, decodeAbiParameters } = require('viem');
const axios = require('axios');

async function testAgent() {
    // 1. Encode parameters
    // fetch(string url, string selector)
    const url = 'https://jsonplaceholder.typicode.com/users/1';
    const selector = 'address.city';

    console.log(`Testing with URL: ${url}, selector: ${selector}`);

    const encodedInput = encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }],
        [url, selector]
    );

    // 2. Call the agent (Assuming server is running on port 8000 locally for test)
    // You'll need to run `PORT=8000 node server.js` in a separate terminal
    try {
        const response = await axios.post('http://localhost:8000/fetch',
            Buffer.from(encodedInput.slice(2), 'hex'),
            {
                headers: { 'Content-Type': 'application/octet-stream' },
                responseType: 'arraybuffer' // Important to get raw buffer
            }
        );

        // 3. Decode response
        // returns (string result)
        const encodedOutput = '0x' + response.data.toString('hex');
        const [result] = decodeAbiParameters(
            [{ type: 'string' }],
            encodedOutput
        );

        console.log('Result:', result);

        if (result === 'Gwenborough') {
            console.log('SUCCESS: Extracted correct value');
        } else {
            console.error('FAILURE: Unexpected value');
        }

    } catch (error) {
        console.error('Error calling agent:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data.toString());
        }
    }
}

testAgent();
