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
    address requester;      // Address to receive rebate
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 threshold;
    uint256 createdAt;
    bool finalized;
    ConsensusType consensusType;
    uint256 agentCost;      // Base fee for the agent (captured at request time)
    uint256 maxCost;        // Maximum cost paid upfront by requester
    uint256 finalCost;      // Actual cost: agentCost + validatorCosts + callbackGasCost
}

struct Response {
    address validator;
    bytes result;
    uint256 receipt;    // CID of JSON manifest of the computation
    uint256 price;      // Price quoted by this validator
    uint256 timestamp;
}

/// @title ISomniaAgents Interface
/// @notice Consumer interface for requesting agent execution
interface ISomniaAgents {
    // Events
    event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, address indexed requester, uint256 maxCost, bytes payload, address[] subcommittee);
    event RequestFinalized(uint256 indexed requestId, uint256 finalCost, uint256 rebate);
    event RequestTimedOut(uint256 indexed requestId);

    // Request Creation (payable - sends max cost upfront)
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function createRequestWithParams(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType
    ) external payable returns (uint256 requestId);

    // Query Functions
    function getRequest(uint256 requestId) external view returns (
        address requester,
        address callbackAddress,
        bytes4 callbackSelector,
        address[] memory subcommittee,
        uint256 threshold,
        uint256 createdAt,
        bool finalized,
        uint256 responseCount,
        ConsensusType consensusType,
        uint256 agentCost,
        uint256 maxCost,
        uint256 finalCost
    );

    function isRequestPending(uint256 requestId) external view returns (bool);
    function isRequestValid(uint256 requestId) external view returns (bool);
}

/// @title ISomniaAgentsRunner Interface
/// @notice Validator interface for agent runners participating in consensus
interface ISomniaAgentsRunner {
    // Events
    event ResponseSubmitted(uint256 indexed requestId, address indexed validator, uint256 receipt);

    // Response Submission
    function submitResponse(
        uint256 requestId,
        bytes calldata result,
        uint256 receipt,
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
    uint256 public defaultSubcommitteeSize = 5;
    uint256 public defaultThreshold = 3;
    uint256 public requestTimeout = 1 minutes;
    uint256 public callbackGasLimit = 500_000;
    uint256 public maxExecutionFee = 1 ether;  // Maximum allowed prepaid cost per request

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
        // Initialize circular buffer with pre-allocated response slots
        for (uint256 i = 0; i < bufferSize; i++) {
            requests.push();
            for (uint256 j = 0; j < 3; j++) {
                requests[i].responses.push();
            }
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

    function setCallbackGasLimit(uint256 gasLimit) external onlyOwner {
        callbackGasLimit = gasLimit;
    }

    function setMaxExecutionFee(uint256 maxFee) external onlyOwner {
        maxExecutionFee = maxFee;
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
    ) external payable override returns (uint256 requestId) {
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
    ) external payable override returns (uint256 requestId) {
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
        require(msg.value > 0 && msg.value <= maxExecutionFee, "SomniaAgents: invalid max cost");

        // Get agent info (validates existence and captures cost)
        Agent memory agent = agentRegistry.getAgent(agentId);

        address[] memory activeMembers = committee.getActiveMembers();
        require(activeMembers.length >= subcommitteeSize, "SomniaAgents: not enough active members");

        requestId = nextRequestId++;

        address[] memory subcommittee = committee.electSubcommittee(subcommitteeSize, bytes32(requestId));

        // Use circular buffer
        Request storage req = requests[requestId % requests.length];

        // Reset response count (pre-allocated slots are reused)
        req.responseCount = 0;

        req.id = requestId;
        req.requester = msg.sender;
        req.callbackAddress = callbackAddress;
        req.callbackSelector = callbackSelector;
        req.subcommittee = subcommittee;
        req.threshold = threshold;
        req.createdAt = block.timestamp;
        req.finalized = false;
        req.consensusType = consensusType;
        req.agentCost = agent.cost;
        req.maxCost = msg.value;
        req.finalCost = 0;

        emit RequestCreated(requestId, agentId, msg.sender, msg.value, payload, subcommittee);
    }

    // ============ Response Functions ============

    function submitResponse(
        uint256 requestId,
        bytes calldata result,
        uint256 receipt,
        uint256 price
    ) external override {
        // Validate request exists
        require(
            requests.length > 0 && requests[requestId % requests.length].id == requestId,
            "SomniaAgents: request not found or overwritten"
        );

        // Validate caller is subcommittee member
        require(
            _isSubcommitteeMember(requestId, msg.sender),
            "SomniaAgents: not a subcommittee member"
        );

        Request storage req = requests[requestId % requests.length];

        // Check not timed out
        require(
            block.timestamp <= req.createdAt + requestTimeout,
            "SomniaAgents: request timed out"
        );

        // Check not already responded
        require(
            !_hasResponded(req.responses, req.responseCount, msg.sender),
            "SomniaAgents: already responded"
        );

        // If already finalized, just return
        if (req.finalized) {
            return;
        }

        // Store the response in pre-allocated slot
        uint256 idx = req.responseCount;
        if (idx < req.responses.length) {
            Response storage resp = req.responses[idx];
            resp.validator = msg.sender;
            resp.result = result;
            resp.receipt = receipt;
            resp.price = price;
            resp.timestamp = block.timestamp;
        } else {
            req.responses.push(Response({
                validator: msg.sender,
                result: result,
                receipt: receipt,
                price: price,
                timestamp: block.timestamp
            }));
        }
        req.responseCount++;

        emit ResponseSubmitted(requestId, msg.sender, receipt);

        // Check finalization based on consensus type
        if (req.consensusType == ConsensusType.Majority) {
            if (_checkMajorityConsensus(req.responses, req.responseCount, req.threshold)) {
                _finalizeRequest(requestId);
            }
        } else {
            if (req.responseCount >= req.threshold) {
                _finalizeRequest(requestId);
            }
        }
    }

    function _hasResponded(Response[] storage responses, uint256 count, address validator) internal view returns (bool) {
        for (uint256 i = 0; i < count; i++) {
            if (responses[i].validator == validator) {
                return true;
            }
        }
        return false;
    }

    function _checkMajorityConsensus(Response[] storage responses, uint256 responseCount, uint256 threshold) internal view returns (bool) {
        for (uint256 i = 0; i < responseCount; i++) {
            uint256 count = 0;
            for (uint256 j = 0; j < responseCount; j++) {
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

        (bytes memory callbackData, uint256 medianPrice) = _getConsensusResultAndMedianPrice(
            req.responses,
            req.responseCount,
            req.consensusType,
            req.threshold
        );
        uint256 validatorCosts = medianPrice * req.subcommittee.length;

        uint256 callbackGasCost = 0;
        if (req.callbackAddress != address(0)) {
            uint256 gasBefore = gasleft();
            (bool success, ) = req.callbackAddress.call{gas: callbackGasLimit}(
                abi.encodeWithSelector(req.callbackSelector, requestId, callbackData)
            );
            uint256 gasUsed = gasBefore - gasleft();
            callbackGasCost = gasUsed * tx.gasprice;
        }

        req.finalCost = req.agentCost + validatorCosts + callbackGasCost;

        uint256 rebate = 0;
        if (req.finalCost < req.maxCost) {
            rebate = req.maxCost - req.finalCost;
            (bool sent, ) = req.requester.call{value: rebate}("");
        }

        emit RequestFinalized(requestId, req.finalCost, rebate);
    }

    function _getMajorityResult(
        Response[] storage responses,
        uint256 responseCount,
        uint256 threshold
    ) internal view returns (bytes memory result) {
        // Find the first result that reached threshold agreement
        for (uint256 i = 0; i < responseCount; i++) {
            uint256 count = 0;
            for (uint256 j = 0; j < responseCount; j++) {
                if (BytesLib.equal(responses[i].result, responses[j].result)) {
                    count++;
                }
            }
            if (count >= threshold) {
                return responses[i].result;
            }
        }
        // Fallback: return first response (shouldn't reach here if properly finalized)
        if (responseCount > 0) {
            return responses[0].result;
        }
        return bytes("");
    }

    function _encodeAllResponses(Response[] storage responses, uint256 responseCount) internal view returns (bytes memory) {
        // Encode all response results as an array for the callback to process
        bytes[] memory results = new bytes[](responseCount);
        for (uint256 i = 0; i < responseCount; i++) {
            results[i] = responses[i].result;
        }
        return abi.encode(results);
    }

    function _getConsensusResultAndMedianPrice(
        Response[] storage responses,
        uint256 responseCount,
        ConsensusType consensusType,
        uint256 threshold
    ) internal view returns (bytes memory result, uint256 medianPrice) {
        if (consensusType == ConsensusType.Majority) {
            result = _getMajorityResult(responses, responseCount, threshold);
        } else {
            result = _encodeAllResponses(responses, responseCount);
        }
        medianPrice = _getMedianPrice(responses, responseCount);
    }

    function _getAllPrices(Response[] storage responses, uint256 responseCount) internal view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](responseCount);
        for (uint256 i = 0; i < responseCount; i++) {
            prices[i] = responses[i].price;
        }
        return prices;
    }

    function _getMedianPrice(Response[] storage responses, uint256 responseCount) internal view returns (uint256) {
        if (responseCount == 0) {
            return 0;
        }
        return MathLib.median(_getAllPrices(responses, responseCount));
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

        // Calculate validator costs from any responses we have
        (bytes memory aggregatedResult, uint256 medianPrice) = _getConsensusResultAndMedianPrice(
            req.responses,
            req.responseCount,
            req.consensusType,
            req.threshold
        );
        uint256 validatorCosts = medianPrice * req.subcommittee.length;

        // Call callback and track gas
        uint256 callbackGasCost = 0;
        if (req.callbackAddress != address(0)) {
            uint256 gasBefore = gasleft();
            (bool success, ) = req.callbackAddress.call{gas: callbackGasLimit}(
                abi.encodeWithSelector(req.callbackSelector, requestId, aggregatedResult)
            );
            uint256 gasUsed = gasBefore - gasleft();
            callbackGasCost = gasUsed * tx.gasprice;
        }

        // Calculate final cost and send rebate
        req.finalCost = req.agentCost + validatorCosts + callbackGasCost;
        uint256 rebate = 0;
        if (req.finalCost < req.maxCost) {
            rebate = req.maxCost - req.finalCost;
            (bool sent, ) = req.requester.call{value: rebate}("");
        }

        emit RequestFinalized(requestId, req.finalCost, rebate);
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

        // Calculate validator costs from any responses we have
        (bytes memory aggregatedResult, uint256 medianPrice) = _getConsensusResultAndMedianPrice(
            req.responses,
            req.responseCount,
            req.consensusType,
            req.threshold
        );
        uint256 validatorCosts = medianPrice * req.subcommittee.length;

        // Call callback and track gas
        uint256 callbackGasCost = 0;
        if (req.callbackAddress != address(0)) {
            uint256 gasBefore = gasleft();
            (bool success, ) = req.callbackAddress.call{gas: callbackGasLimit}(
                abi.encodeWithSelector(req.callbackSelector, requestId, aggregatedResult)
            );
            uint256 gasUsed = gasBefore - gasleft();
            callbackGasCost = gasUsed * tx.gasprice;
        }

        // Calculate final cost and send rebate
        req.finalCost = req.agentCost + validatorCosts + callbackGasCost;
        uint256 rebate = 0;
        if (req.finalCost < req.maxCost) {
            rebate = req.maxCost - req.finalCost;
            (bool sent, ) = req.requester.call{value: rebate}("");
        }

        emit RequestFinalized(requestId, req.finalCost, rebate);
    }

    // ============ View Functions ============

    function getRequest(uint256 requestId) external view override returns (
        address requester,
        address callbackAddress,
        bytes4 callbackSelector,
        address[] memory subcommittee,
        uint256 threshold,
        uint256 createdAt,
        bool finalized,
        uint256 responseCount,
        ConsensusType consensusType,
        uint256 agentCost,
        uint256 maxCost,
        uint256 finalCost
    ) {
        Request storage req = requests[requestId % requests.length];
        require(req.id == requestId, "SomniaAgents: request not found or overwritten");
        return (
            req.requester,
            req.callbackAddress,
            req.callbackSelector,
            req.subcommittee,
            req.threshold,
            req.createdAt,
            req.finalized,
            req.responseCount,
            req.consensusType,
            req.agentCost,
            req.maxCost,
            req.finalCost
        );
    }

    function getResponses(uint256 requestId) external view override returns (Response[] memory) {
        Request storage req = requests[requestId % requests.length];
        require(req.id == requestId, "SomniaAgents: request not found or overwritten");
        Response[] memory result = new Response[](req.responseCount);
        for (uint256 i = 0; i < req.responseCount; i++) {
            result[i] = req.responses[i];
        }
        return result;
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
