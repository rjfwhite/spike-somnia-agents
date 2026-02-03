// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title JSONAbiMapper Library
/// @notice Defines types for mapping JSON response fields to ABI-encoded Solidity types.
library JSONAbiMapper {
    /// @notice A single field mapping from JSON path to Solidity ABI type.
    struct Field {
        /// @notice JSONPath expression to extract the value (e.g., "$.temperature.current").
        string jsonPath;

        /// @notice Solidity type to encode the value as (e.g., "int256", "string", "uint256[]").
        string abiType;
    }

    /// @notice A request containing an array of field mappings.
    struct Request {
        /// @notice Array of fields to extract and encode from the JSON response.
        Field[] fields;
    }
}

/// @title IOracleHub Interface
/// @notice Interface for the OracleHub contract that handles HTTP requests and responses.
interface IOracleHub {
    /// @notice HTTP header key-value pair.
    struct Header {
        string name;
        string value;
    }

    /// @notice Structure defining an HTTP request.
    struct HttpRequest {
        /// @notice HTTP method (e.g., "GET", "POST").
        string method;

        /// @notice Protocol scheme (e.g., "https").
        string scheme;

        /// @notice Domain name of the API (e.g., "api.example.com").
        string authority;

        /// @notice Path and query string (e.g., "/weather?city=Guarda").
        string pathQuery;

        /// @notice Array of HTTP headers.
        Header[] headers;

        /// @notice Request body (for POST, PUT, etc.).
        bytes body;
    }

    /// @notice Structure defining an HTTP response.
    struct HttpResponse {
        /// @notice The request ID this response corresponds to.
        uint256 requestId;

        /// @notice HTTP status code (e.g., 200, 404).
        uint256 status;

        /// @notice Array of response headers.
        Header[] headers;

        /// @notice Response body (raw bytes or ABI-encoded based on jsonMapping).
        bytes body;
    }

    /// @notice Emitted when a new HTTP request is created.
    /// @param requestId Unique identifier for the request.
    /// @param request The HTTP request details.
    /// @param jsonMapping Mapping configuration for JSON to ABI encoding.
    /// @param callbackAddress Address to receive the callback.
    /// @param callbackSelector Function selector for the callback.
    event HttpRequestCreated(
        uint256 indexed requestId,
        HttpRequest request,
        JSONAbiMapper.Request jsonMapping,
        address callbackAddress,
        bytes4 callbackSelector
    );

    /// @notice Emitted when an HTTP request has been fulfilled.
    /// @param requestId Unique identifier for the fulfilled request.
    /// @param success Whether the fulfillment was successful.
    event HttpRequestFulfilled(uint256 indexed requestId, bool success);

    /// @notice Submit an HTTP request to the oracle network.
    /// @param request The HTTP request to execute.
    /// @param jsonMapping Configuration for parsing JSON response and encoding to ABI format.
    /// @param callbackSelector Function selector to call with the response.
    /// @param callbackAddress Address of the contract to receive the callback.
    /// @return requestId Unique identifier for the submitted request.
    function runRequest(
        HttpRequest memory request,
        JSONAbiMapper.Request memory jsonMapping,
        bytes4 callbackSelector,
        address callbackAddress
    ) external payable returns (uint256 requestId);
}

/// @notice Data required to request agent execution and callback.
struct AgentRequestData {
    /// @notice Unique identifier of the agent to invoke.
    uint256 agentId;

    /// @notice ABI-encoded request data for the agent, including the function selector.
    bytes request;

    /// @notice Address to receive the agent's callback.
    address callbackAddress;

    /// @notice Function selector to be used for the callback on the handler contract.
    /// @dev Defaults to ISomniaAgentsHandler.handleResponse if not specified.
    bytes4 callbackSelector;
}

/// @notice Full agent info including owner.
struct Agent {
    uint256 agentId;
    address owner;
    string metadataUri;
    string containerImageUri;
    uint256 cost;
}

/// @title Interface for Somnia agent dispatcher
interface ISomniaAgents {
    /// @notice Request execution of an agent with the specified parameters.
    /// @dev Agent is called with the provided request data; after execution, callback is invoked.
    /// @param requestData Data specifying the agent, request payload, callback address, and selector.
    /// @return requestId Unique identifier of the submitted agent request.
    function requestAgent(AgentRequestData calldata requestData) external payable returns (uint256 requestId);

    /// @notice Get full agent information including owner.
    /// @param agentId The token ID of the agent.
    /// @return agent The full agent struct with all details.
    function getAgent(uint256 agentId) external view returns (Agent memory agent);
}

/// @notice Implementer of this interface will be called when the agent response is ready.
interface ISomniaAgentsHandler {
    /// @notice Handles the response from an agent execution.
    /// @dev This function is called by the dispatcher contract when the agent's response is ready.
    /// @param requestId The unique identifier corresponding to the original request.
    /// @param response ABI-encoded data returned by the agent.
    /// @param success Indicates whether the agent execution was successful.
    function handleResponse(
        uint256 requestId,
        bytes calldata response,
        bool success
    ) external;
}

/// @title SomniaAgents - Enumerable ERC721 Agent Registry
/// @notice Each agent is an NFT that can be minted by anyone and updated by its owner.
contract SomniaAgents is ISomniaAgents, ERC721Enumerable, Ownable {

    /// @notice Reference to the OracleHub contract for HTTP requests.
    IOracleHub public oracleHub;

    /// @notice Counter for generating unique request IDs.
    uint256 public nextRequestId;

    struct CallbackDetails {
        address callbackAddress;
        bytes4 callbackSelector;
        uint256 agentId;
    }

    /// @dev Mapping of our request IDs to callback data.
    mapping(uint256 => CallbackDetails) public callbackDetails;

    /// @dev Mapping from oracle request IDs to our request IDs.
    mapping(uint256 => uint256) public oracleToRequestId;

    /// @dev Mapping of agent token IDs to their details.
    mapping(uint256 => Agent) public agents;

    /// @notice Emitted when an agent is created or updated.
    /// @param agentId The token ID of the agent.
    /// @param owner The address that owns the agent.
    /// @param metadataUri The metadata URI for the agent.
    /// @param containerImageUri The container image URI for the agent.
    /// @param cost The cost in wei to request this agent.
    event AgentSet(
        uint256 indexed agentId,
        address indexed owner,
        string metadataUri,
        string containerImageUri,
        uint256 cost
    );

    /// @notice Emitted when an agent is deleted.
    /// @param agentId The token ID of the deleted agent.
    /// @param owner The address that owned the agent.
    event AgentDeleted(
        uint256 indexed agentId,
        address indexed owner
    );

    /// @notice Emitted when an agent execution is requested.
    /// @param requestId The unique identifier for this request.
    /// @param agentId The token ID of the agent being invoked.
    /// @param request The ABI-encoded request data sent to the agent.
    event AgentRequested(
        uint256 indexed requestId,
        uint256 indexed agentId,
        bytes request
    );

    /// @notice Emitted when an agent response is received.
    /// @param requestId The unique identifier for the request.
    /// @param agentId The token ID of the agent that responded.
    /// @param response The response data from the agent.
    /// @param success Whether the agent execution was successful.
    event AgentResponded(
        uint256 indexed requestId,
        uint256 indexed agentId,
        bytes response,
        bool success
    );

    /// @notice Error thrown when querying a non-existent agent.
    error AgentNotFound(uint256 agentId);

    /// @notice Error thrown when insufficient payment is provided.
    error InsufficientPayment(uint256 required, uint256 provided);

    /// @notice Error thrown when caller is not the agent owner.
    error NotAgentOwner(uint256 agentId, address caller);

    constructor(
        address initialOwner,
        address _oracleHub
    ) ERC721("Somnia Agents", "SAGENT") Ownable(initialOwner) {
        oracleHub = IOracleHub(_oracleHub);
    }

    /// @notice Modifier to check if caller is the owner of a specific agent.
    /// @param agentId The token ID of the agent.
    modifier onlyAgentOwner(uint256 agentId) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        _;
    }

    /// @notice Update the OracleHub address.
    /// @param _oracleHub The new OracleHub contract address.
    function setOracleHub(address _oracleHub) external onlyOwner {
        oracleHub = IOracleHub(_oracleHub);
    }

    /// @notice Create or update an agent. If the agent doesn't exist, it's minted to the caller.
    ///         If it exists, only the owner can update it.
    /// @param agentId The token ID of the agent.
    /// @param metadataUri The metadata URI for the agent.
    /// @param containerImageUri The container image URI for the agent.
    /// @param cost The cost in wei to request this agent.
    function setAgent(
        uint256 agentId,
        string calldata metadataUri,
        string calldata containerImageUri,
        uint256 cost
    ) external {
        address currentOwner = _ownerOf(agentId);
        
        if (currentOwner == address(0)) {
            // Agent doesn't exist - mint it to the caller
            _safeMint(msg.sender, agentId);
        } else if (currentOwner != msg.sender) {
            // Agent exists but caller is not the owner
            revert NotAgentOwner(agentId, msg.sender);
        }
        // If we get here, either we just minted or caller is the owner
        
        agents[agentId] = Agent({
            agentId: agentId,
            owner: msg.sender,
            metadataUri: metadataUri,
            containerImageUri: containerImageUri,
            cost: cost
        });

        emit AgentSet(agentId, msg.sender, metadataUri, containerImageUri, cost);
    }

    /// @notice Delete an agent. Only the owner can delete their agent.
    /// @param agentId The token ID of the agent to delete.
    function deleteAgent(uint256 agentId) external onlyAgentOwner(agentId) {
        // Clear agent details
        delete agents[agentId];
        
        // Burn the token
        _burn(agentId);

        emit AgentDeleted(agentId, msg.sender);
    }

    /// @notice Get full agent information including owner.
    /// @param agentId The token ID of the agent.
    /// @return agent The full agent struct with all details.
    function getAgent(uint256 agentId) external view override returns (Agent memory agent) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        return agents[agentId];
    }

    /// @notice Returns the token URI for a given agent (ERC721 metadata).
    /// @param tokenId The token ID of the agent.
    /// @return The metadata URI for the agent.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert AgentNotFound(tokenId);
        return agents[tokenId].metadataUri;
    }

    /// @notice Get all agent IDs owned by a specific address.
    /// @param owner The address to query.
    /// @return agentIds Array of agent token IDs owned by the address.
    function getAgentsByOwner(address owner) external view returns (uint256[] memory agentIds) {
        uint256 balance = balanceOf(owner);
        agentIds = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            agentIds[i] = tokenOfOwnerByIndex(owner, i);
        }
        return agentIds;
    }

    /// @notice Get all agent IDs in the registry.
    /// @return agentIds Array of all agent token IDs.
    function getAllAgents() external view returns (uint256[] memory agentIds) {
        uint256 total = totalSupply();
        agentIds = new uint256[](total);
        for (uint256 i = 0; i < total; i++) {
            agentIds[i] = tokenByIndex(i);
        }
        return agentIds;
    }

    /// @notice Get a paginated list of all agents.
    /// @param offset The starting index.
    /// @param limit The maximum number of agents to return.
    /// @return agentIds Array of agent token IDs.
    function getAgentsPaginated(uint256 offset, uint256 limit) external view returns (uint256[] memory agentIds) {
        uint256 total = totalSupply();
        if (offset >= total) {
            return new uint256[](0);
        }
        
        uint256 remaining = total - offset;
        uint256 count = remaining < limit ? remaining : limit;
        
        agentIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            agentIds[i] = tokenByIndex(offset + i);
        }
        return agentIds;
    }

    /// @notice Request execution of an agent.
    /// @param requestData Data specifying the agent, request payload, callback address, and selector.
    /// @return requestId Unique identifier of the submitted agent request.
    function requestAgent(AgentRequestData calldata requestData) external payable override returns (uint256 requestId) {
        if (_ownerOf(requestData.agentId) == address(0)) revert AgentNotFound(requestData.agentId);
        
        Agent storage agent = agents[requestData.agentId];
        if (msg.value < agent.cost) revert InsufficientPayment(agent.cost, msg.value);

        // Generate unique request ID
        requestId = nextRequestId++;

        // Build the HTTP request for the oracle gateway
        // Encode request data as base64 for URL query parameter
        string memory base64Data = Base64.encode(requestData.request);
        
        // Build path with query parameters: ?agentUrl=<containerUri>&requestId=<id>&data=<base64Data>
        string memory pathQuery = string(abi.encodePacked(
            "/?agentUrl=",
            agent.containerImageUri,
            "&requestId=",
            Strings.toString(requestId),
            "&data=",
            base64Data
        ));

        IOracleHub.HttpRequest memory httpRequest = IOracleHub.HttpRequest({
            method: "GET",
            scheme: "http",
            authority: "34.170.54.156",
            pathQuery: pathQuery,
            headers: new IOracleHub.Header[](0),
            body: bytes("")
        });

        // Empty JSON mapping - oracle returns raw response body
        JSONAbiMapper.Field[] memory fields;
        JSONAbiMapper.Request memory jsonMapping = JSONAbiMapper.Request({
            fields: fields
        });

        // Call the oracle hub to execute the HTTP request
        uint256 oracleRequestId = oracleHub.runRequest{value: msg.value}(
            httpRequest,
            jsonMapping,
            this.onOracleResponse.selector,
            address(this)
        );

        // Map oracle's request ID to our request ID
        oracleToRequestId[oracleRequestId] = requestId;

        // Store callback details for when the oracle responds
        callbackDetails[requestId] = CallbackDetails({
            callbackAddress: requestData.callbackAddress,
            callbackSelector: requestData.callbackSelector,
            agentId: requestData.agentId
        });

        emit AgentRequested(requestId, requestData.agentId, requestData.request);

        return requestId;
    }

    /// @notice Callback function called by the OracleHub when the HTTP response is ready.
    /// @param response The HTTP response from the oracle.
    function onOracleResponse(IOracleHub.HttpResponse memory response) external {
        require(msg.sender == address(oracleHub), "Only OracleHub can call this function");

        // Map oracle's request ID to our request ID
        uint256 requestId = oracleToRequestId[response.requestId];
        CallbackDetails storage callback = callbackDetails[requestId];
        bool success = response.status == 200;

        emit AgentResponded(requestId, callback.agentId, response.body, success);

        // Forward the response to the original callback address
        (bool callSuccess, ) = callback.callbackAddress.call(
            abi.encodeWithSelector(
                callback.callbackSelector,
                requestId,
                response.body,
                success
            )
        );

        // Optionally handle callback failure (emit event, revert, etc.)
        require(callSuccess, "Callback failed");
    }

    /// @notice Required override for ERC721Enumerable.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @notice Required override for ERC721Enumerable. Also keeps Agent.owner in sync.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        address from = super._update(to, tokenId, auth);
        
        // Keep the stored owner in sync (for transfers, not burns)
        if (to != address(0)) {
            agents[tokenId].owner = to;
        }
        
        return from;
    }

    /// @notice Required override for ERC721Enumerable.
    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
} 