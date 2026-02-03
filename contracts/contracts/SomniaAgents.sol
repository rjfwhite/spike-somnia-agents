// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { ICommittee } from "./Committee.sol";
import { IAgentRegistry, Agent } from "./AgentRegistry.sol";
import { BytesLib, MathLib } from "./Utils.sol";

enum ConsensusType {
    Majority,   // Finalizes when 2/3 agree on the same value
    Threshold   // Finalizes when threshold responses received (for median/xor aggregation)
}

struct Request {
    uint256 id;             // Request ID to verify slot hasn't been overwritten
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    bytes payload;
    uint256 agentId;        // ID of the agent to run
    address[] subcommittee;
    Response[] responses;
    uint256 threshold;
    uint256 createdAt;
    bool finalized;
    ConsensusType consensusType;
    uint256 finalPrice;     // Median price * consensus count
}

struct Response {
    address validator;
    bytes result;
    bytes receipt;      // CID of JSON manifest of the computation
    uint256 price;      // Price quoted by this validator
    uint256 timestamp;
}

/// @title ISomniaAgents Interface
/// @notice Consumer interface for requesting agent execution
interface ISomniaAgents {
    // Events
    event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, bytes payload, address[] subcommittee);
    event RequestFinalized(uint256 indexed requestId);
    event RequestTimedOut(uint256 indexed requestId);

    // Request Creation
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external returns (uint256 requestId);

    function createRequestWithParams(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType
    ) external returns (uint256 requestId);

    // Query Functions
    function getRequest(uint256 requestId) external view returns (
        address requester,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes memory payload,
        uint256 agentId,
        address[] memory subcommittee,
        uint256 threshold,
        uint256 createdAt,
        bool finalized,
        uint256 responseCount,
        ConsensusType consensusType,
        uint256 finalPrice
    );

    function isRequestPending(uint256 requestId) external view returns (bool);
    function isRequestValid(uint256 requestId) external view returns (bool);
}

/// @title ISomniaAgentsRunner Interface
/// @notice Validator interface for agent runners participating in consensus
interface ISomniaAgentsRunner {
    // Events
    event ResponseSubmitted(uint256 indexed requestId, address indexed validator);

    // Response Submission
    function submitResponse(
        uint256 requestId,
        bytes calldata result,
        bytes calldata receipt,
        uint256 price
    ) external;

    // Maintenance
    function upkeepRequests() external;

    // Query Functions
    function getResponses(uint256 requestId) external view returns (Response[] memory);
    function getSubcommittee(uint256 requestId) external view returns (address[] memory);
    function isSubcommitteeMember(uint256 requestId, address addr) external view returns (bool);
}

/// @title ISomniaAgentsHandler Interface
/// @notice Interface for contracts that receive callbacks from SomniaAgents
interface ISomniaAgentsHandler {
    function handleResponse(uint256 requestId, bytes calldata result) external;
}

contract SomniaAgents is ISomniaAgents, ISomniaAgentsRunner {
    address public owner;

    IAgentRegistry public agentRegistry;
    ICommittee public committee;

    uint256 public nextRequestId;
    uint256 public oldestPendingId;  // Tracks oldest request that may need timeout
    uint256 public defaultSubcommitteeSize = 3;
    uint256 public defaultThreshold = 2;
    uint256 public requestTimeout = 1 minutes;

    // Circular buffer of requests
    Request[] public requests;

    modifier onlyOwner() {
        require(msg.sender == owner, "SomniaAgents: caller is not the owner");
        _;
    }

    modifier validRequest(uint256 requestId) {
        require(requests.length > 0 && requests[requestId % requests.length].id == requestId, "SomniaAgents: request not found or overwritten");
        _;
    }

    modifier onlySubcommitteeMember(uint256 requestId) {
        require(_isSubcommitteeMember(requestId, msg.sender), "SomniaAgents: not a subcommittee member");
        _;
    }

    constructor(uint256 bufferSize, address _agentRegistry, address _committee) {
        owner = msg.sender;
        agentRegistry = IAgentRegistry(_agentRegistry);
        committee = ICommittee(_committee);
        // Initialize circular buffer
        for (uint256 i = 0; i < bufferSize; i++) {
            requests.push();
        }
    }

    // ============ Owner Functions ============

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        agentRegistry = IAgentRegistry(_agentRegistry);
    }

    function setCommittee(address _committee) external onlyOwner {
        committee = ICommittee(_committee);
    }

    function setDefaultSubcommitteeSize(uint256 size) external onlyOwner {
        require(size > 0, "SomniaAgents: size must be > 0");
        defaultSubcommitteeSize = size;
    }

    function setDefaultThreshold(uint256 threshold) external onlyOwner {
        require(threshold > 0, "SomniaAgents: threshold must be > 0");
        defaultThreshold = threshold;
    }

    function setRequestTimeout(uint256 timeout) external onlyOwner {
        requestTimeout = timeout;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SomniaAgents: new owner is zero address");
        owner = newOwner;
    }

    // ============ Request Functions ============

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external override returns (uint256 requestId) {
        return _createRequest(agentId, callbackAddress, callbackSelector, payload, defaultSubcommitteeSize, defaultThreshold, ConsensusType.Majority);
    }

    function createRequestWithParams(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType
    ) external override returns (uint256 requestId) {
        return _createRequest(agentId, callbackAddress, callbackSelector, payload, subcommitteeSize, threshold, consensusType);
    }

    function _createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType
    ) internal returns (uint256 requestId) {
        require(threshold > 0 && threshold <= subcommitteeSize, "SomniaAgents: invalid threshold");
        require(agentRegistry.agentExists(agentId), "SomniaAgents: agent does not exist");

        address[] memory activeMembers = committee.getActiveMembers();
        require(activeMembers.length >= subcommitteeSize, "SomniaAgents: not enough active members");

        requestId = nextRequestId++;

        // Generate deterministic seed from request parameters
        bytes32 seed = keccak256(abi.encodePacked(
            requestId,
            block.timestamp,
            blockhash(block.number - 1),
            msg.sender,
            payload
        ));

        address[] memory subcommittee = committee.electSubcommittee(subcommitteeSize, seed);

        // Use circular buffer
        Request storage req = requests[requestId % requests.length];

        // Clear responses array for reuse
        while (req.responses.length > 0) {
            req.responses.pop();
        }

        req.id = requestId;
        req.requester = msg.sender;
        req.callbackAddress = callbackAddress;
        req.callbackSelector = callbackSelector;
        req.payload = payload;
        req.agentId = agentId;
        req.subcommittee = subcommittee;
        req.threshold = threshold;
        req.createdAt = block.timestamp;
        req.finalized = false;
        req.consensusType = consensusType;
        req.finalPrice = 0;

        emit RequestCreated(requestId, agentId, payload, subcommittee);
    }

    // ============ Response Functions ============

    function submitResponse(
        uint256 requestId,
        bytes calldata result,
        bytes calldata receipt,
        uint256 price
    ) external override validRequest(requestId) onlySubcommitteeMember(requestId) {
        Request storage req = requests[requestId % requests.length];

        require(!req.finalized, "SomniaAgents: request already finalized");
        require(block.timestamp <= req.createdAt + requestTimeout, "SomniaAgents: request timed out");
        require(!_hasResponded(req.responses, msg.sender), "SomniaAgents: already responded");

        req.responses.push(Response({
            validator: msg.sender,
            result: result,
            receipt: receipt,
            price: price,
            timestamp: block.timestamp
        }));

        emit ResponseSubmitted(requestId, msg.sender);

        // Check finalization based on consensus type
        if (req.consensusType == ConsensusType.Majority) {
            // Check if any result has reached threshold agreement
            if (_checkMajorityConsensus(req.responses, req.threshold)) {
                _finalizeRequest(requestId);
            }
        } else {
            // Threshold consensus: finalize when we have enough responses
            if (req.responses.length >= req.threshold) {
                _finalizeRequest(requestId);
            }
        }
    }

    function _hasResponded(Response[] storage responses, address validator) internal view returns (bool) {
        for (uint256 i = 0; i < responses.length; i++) {
            if (responses[i].validator == validator) {
                return true;
            }
        }
        return false;
    }

    function _checkMajorityConsensus(Response[] storage responses, uint256 threshold) internal view returns (bool) {
        for (uint256 i = 0; i < responses.length; i++) {
            uint256 count = 0;
            for (uint256 j = 0; j < responses.length; j++) {
                if (BytesLib.equal(responses[i].result, responses[j].result)) {
                    count++;
                }
            }
            if (count >= threshold) {
                return true;
            }
        }
        return false;
    }

    function _finalizeRequest(uint256 requestId) internal {
        Request storage req = requests[requestId % requests.length];
        require(!req.finalized, "SomniaAgents: already finalized");

        req.finalized = true;

        bytes memory callbackData;
        uint256[] memory consensusPrices;

        if (req.consensusType == ConsensusType.Majority) {
            // Return the result that reached threshold and get prices from agreeing validators
            (callbackData, consensusPrices) = _getMajorityResultAndPrices(req.responses, req.threshold);
        } else {
            // Threshold consensus: return all response data for off-chain aggregation (median, xor, etc.)
            callbackData = _encodeAllResponses(req.responses);
            consensusPrices = _getAllPrices(req.responses);
        }

        // Calculate final price: median price * consensus count
        uint256 medianPrice = MathLib.median(consensusPrices);
        req.finalPrice = medianPrice * consensusPrices.length;

        // Call the callback if one was provided
        if (req.callbackAddress != address(0)) {
            (bool success, ) = req.callbackAddress.call(
                abi.encodeWithSelector(req.callbackSelector, requestId, callbackData)
            );
        }

        emit RequestFinalized(requestId);
    }

    function _getMajorityResultAndPrices(
        Response[] storage responses,
        uint256 threshold
    ) internal view returns (bytes memory result, uint256[] memory prices) {
        // Find the first result that reached threshold agreement and collect prices from agreeing validators
        for (uint256 i = 0; i < responses.length; i++) {
            uint256 count = 0;
            for (uint256 j = 0; j < responses.length; j++) {
                if (BytesLib.equal(responses[i].result, responses[j].result)) {
                    count++;
                }
            }
            if (count >= threshold) {
                // Found consensus - collect prices from all agreeing validators
                prices = new uint256[](count);
                uint256 priceIndex = 0;
                for (uint256 j = 0; j < responses.length; j++) {
                    if (BytesLib.equal(responses[i].result, responses[j].result)) {
                        prices[priceIndex++] = responses[j].price;
                    }
                }
                return (responses[i].result, prices);
            }
        }
        // Fallback: return first response (shouldn't reach here if properly finalized)
        if (responses.length > 0) {
            prices = new uint256[](1);
            prices[0] = responses[0].price;
            return (responses[0].result, prices);
        }
        return (bytes(""), new uint256[](0));
    }

    function _encodeAllResponses(Response[] storage responses) internal view returns (bytes memory) {
        // Encode all response results as an array for the callback to process
        bytes[] memory results = new bytes[](responses.length);
        for (uint256 i = 0; i < responses.length; i++) {
            results[i] = responses[i].result;
        }
        return abi.encode(results);
    }

    function _getAllPrices(Response[] storage responses) internal view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](responses.length);
        for (uint256 i = 0; i < responses.length; i++) {
            prices[i] = responses[i].price;
        }
        return prices;
    }

    function _aggregateResponses(Response[] storage responses, ConsensusType consensusType, uint256 threshold) internal view returns (bytes memory result, uint256[] memory prices) {
        if (responses.length == 0) {
            return (bytes(""), new uint256[](0));
        }

        if (consensusType == ConsensusType.Majority) {
            return _getMajorityResultAndPrices(responses, threshold);
        } else {
            return (_encodeAllResponses(responses), _getAllPrices(responses));
        }
    }

    // ============ Timeout Functions ============

    function timeoutRequest(uint256 requestId) external validRequest(requestId) {
        _timeoutRequest(requestId);
    }

    function _timeoutRequest(uint256 requestId) internal {
        Request storage req = requests[requestId % requests.length];

        require(!req.finalized, "SomniaAgents: request already finalized");
        require(block.timestamp > req.createdAt + requestTimeout, "SomniaAgents: request not timed out yet");

        req.finalized = true;

        emit RequestTimedOut(requestId);

        // Always call callback - with results if we have them, empty if not
        bytes memory aggregatedResult;
        if (req.responses.length > 0) {
            uint256[] memory prices;
            (aggregatedResult, prices) = _aggregateResponses(req.responses, req.consensusType, req.threshold);
            uint256 medianPrice = MathLib.median(prices);
            req.finalPrice = medianPrice * prices.length;
        }

        if (req.callbackAddress != address(0)) {
            (bool success, ) = req.callbackAddress.call(
                abi.encodeWithSelector(req.callbackSelector, requestId, aggregatedResult)
            );
        }
        emit RequestFinalized(requestId);
    }

    // Upkeep function to timeout old requests - walks from oldest pending forward
    function upkeepRequests() external override {
        uint256 current = oldestPendingId;
        uint256 end = nextRequestId;
        uint256 bufferLen = requests.length;

        while (current < end) {
            Request storage req = requests[current % bufferLen];

            // If slot was overwritten by a newer request, skip
            if (req.id != current) {
                current++;
                continue;
            }

            // If already finalized, advance and continue
            if (req.finalized) {
                current++;
                continue;
            }

            // If not yet timed out, stop - all newer requests are also not timed out
            if (block.timestamp <= req.createdAt + requestTimeout) {
                break;
            }

            // Timeout this request
            _timeoutRequestUnchecked(req);
            current++;
        }

        // Update oldest pending to where we stopped
        oldestPendingId = current;
    }

    function _timeoutRequestUnchecked(Request storage req) internal {
        uint256 requestId = req.id;
        req.finalized = true;

        emit RequestTimedOut(requestId);

        bytes memory aggregatedResult;
        if (req.responses.length > 0) {
            uint256[] memory prices;
            (aggregatedResult, prices) = _aggregateResponses(req.responses, req.consensusType, req.threshold);
            uint256 medianPrice = MathLib.median(prices);
            req.finalPrice = medianPrice * prices.length;
        }

        if (req.callbackAddress != address(0)) {
            (bool success, ) = req.callbackAddress.call(
                abi.encodeWithSelector(req.callbackSelector, requestId, aggregatedResult)
            );
        }
        emit RequestFinalized(requestId);
    }

    // ============ View Functions ============

    function getRequest(uint256 requestId) external view override returns (
        address requester,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes memory payload,
        uint256 agentId,
        address[] memory subcommittee,
        uint256 threshold,
        uint256 createdAt,
        bool finalized,
        uint256 responseCount,
        ConsensusType consensusType,
        uint256 finalPrice
    ) {
        Request storage req = requests[requestId % requests.length];
        require(req.id == requestId, "SomniaAgents: request not found or overwritten");
        return (
            req.requester,
            req.callbackAddress,
            req.callbackSelector,
            req.payload,
            req.agentId,
            req.subcommittee,
            req.threshold,
            req.createdAt,
            req.finalized,
            req.responses.length,
            req.consensusType,
            req.finalPrice
        );
    }

    function getResponses(uint256 requestId) external view override returns (Response[] memory) {
        Request storage req = requests[requestId % requests.length];
        require(req.id == requestId, "SomniaAgents: request not found or overwritten");
        return req.responses;
    }

    function getSubcommittee(uint256 requestId) external view override returns (address[] memory) {
        Request storage req = requests[requestId % requests.length];
        require(req.id == requestId, "SomniaAgents: request not found or overwritten");
        return req.subcommittee;
    }

    function isSubcommitteeMember(uint256 requestId, address addr) external view override returns (bool) {
        Request storage req = requests[requestId % requests.length];
        if (req.id != requestId) return false;
        return _isSubcommitteeMember(requestId, addr);
    }

    function _isSubcommitteeMember(uint256 requestId, address addr) internal view returns (bool) {
        Request storage req = requests[requestId % requests.length];
        if (req.id != requestId) return false;
        address[] storage subcommittee = req.subcommittee;
        for (uint256 i = 0; i < subcommittee.length; i++) {
            if (subcommittee[i] == addr) {
                return true;
            }
        }
        return false;
    }

    function isRequestPending(uint256 requestId) external view override returns (bool) {
        Request storage req = requests[requestId % requests.length];
        if (req.id != requestId) return false;
        return !req.finalized && block.timestamp <= req.createdAt + requestTimeout;
    }

    function isRequestValid(uint256 requestId) external view override returns (bool) {
        return requests[requestId % requests.length].id == requestId;
    }
}
