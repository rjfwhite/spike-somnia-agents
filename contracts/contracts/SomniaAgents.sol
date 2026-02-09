// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { ICommittee } from "./Committee.sol";
import { IAgentRegistry, Agent } from "./AgentRegistry.sol";
import { BytesLib, MathLib } from "./Utils.sol";

enum ConsensusType {
    Majority,   // Finalizes when 2/3 agree on the same value
    Threshold   // Finalizes when threshold responses received (for median/xor aggregation)
}

enum ResponseStatus {
    Pending,    // Not yet resolved (default zero value)
    Success,    // Consensus reached normally
    Failed,     // Validators reported failure (success became impossible)
    TimedOut    // Request timed out
}

struct Request {
    uint256 id;             // Request ID to verify slot hasn't been overwritten
    address requester;      // Address to receive rebate
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;   // Number of failure responses
    uint256 threshold;
    uint256 createdAt;
    ResponseStatus status;      // Pending, Success, Failed, or TimedOut
    ConsensusType consensusType;
    uint256 maxCost;        // Maximum cost paid upfront by requester
    uint256 finalCost;      // Actual cost: validatorCosts + callbackGasCost
    address agentCreator;   // Snapshot of agent owner at request creation
}

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;  // Success or Failed
    uint256 receipt;        // CID of JSON manifest of the computation
    uint256 cost;           // Cost quoted by this validator
    uint256 timestamp;
}

/// @title ISomniaAgents Interface
/// @notice Consumer interface for requesting agent execution
interface ISomniaAgents {
    // Events
    event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, uint256 maxCostPerAgent, bytes payload, address[] subcommittee);
    event RequestFinalized(uint256 indexed requestId, ResponseStatus status);
    // Request Creation (payable - sends max cost upfront)
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function createAdvancedRequest(
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
        ResponseStatus status,
        uint256 responseCount,
        ConsensusType consensusType,
        uint256 maxCost,
        uint256 finalCost,
        address agentCreator
    );

    function getResponses(uint256 requestId) external view returns (Response[] memory);

    function hasRequest(uint256 requestId) external view returns (bool);

    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);
}

/// @title ISomniaAgentsRunner Interface
/// @notice Validator interface for agent runners participating in consensus
interface ISomniaAgentsRunner {
    // Response Submission
    function submitResponse(
        uint256 requestId,
        bytes calldata result,
        uint256 receipt,
        uint256 cost,
        bool success
    ) external;
}

/// @title ISomniaAgentsHandler Interface
/// @notice Interface for contracts that receive callbacks from SomniaAgents
interface ISomniaAgentsHandler {
    function handleResponse(
        uint256 requestId,
        bytes[] calldata results,
        ResponseStatus status,
        uint256 cost
    ) external;
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
    uint256 public maxPerAgentFee = 0.01 ether;  // Max fee per subcommittee member (rebated if less)

    // Revenue share configuration (basis points, must sum to 10000)
    address public treasury;
    uint16 public runnerBps = 7000;   // 70% to agent runners (subcommittee)
    uint16 public creatorBps = 2000;  // 20% to agent creator
    uint16 public protocolBps = 1000; // 10% to protocol treasury

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

    constructor(uint256 bufferSize, address _agentRegistry, address _committee, uint256 startingRequestId) {
        owner = msg.sender;
        agentRegistry = IAgentRegistry(_agentRegistry);
        committee = ICommittee(_committee);
        nextRequestId = startingRequestId;
        oldestPendingId = startingRequestId;
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

    function setMaxPerAgentFee(uint256 fee) external onlyOwner {
        maxPerAgentFee = fee;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SomniaAgents: new owner is zero address");
        owner = newOwner;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setFeeShares(uint16 _runnerBps, uint16 _creatorBps, uint16 _protocolBps) external onlyOwner {
        require(_runnerBps + _creatorBps + _protocolBps == 10000, "SomniaAgents: shares must sum to 10000");
        runnerBps = _runnerBps;
        creatorBps = _creatorBps;
        protocolBps = _protocolBps;
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

    function createAdvancedRequest(
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
        require(msg.value == maxPerAgentFee * subcommitteeSize, "SomniaAgents: incorrect deposit (use getRequestDeposit())");

        // Validate agent exists and capture creator
        Agent memory agent = agentRegistry.getAgent(agentId);

        address[] memory activeMembers = committee.getActiveMembers();
        require(activeMembers.length >= subcommitteeSize, "SomniaAgents: not enough active members");

        requestId = nextRequestId++;

        address[] memory subcommittee = committee.electSubcommittee(subcommitteeSize, bytes32(requestId));

        // Use circular buffer
        Request storage req = requests[requestId % requests.length];

        // Reset response count (pre-allocated slots are reused)
        req.responseCount = 0;
        req.failureCount = 0;

        req.id = requestId;
        req.requester = msg.sender;
        req.callbackAddress = callbackAddress;
        req.callbackSelector = callbackSelector;
        req.subcommittee = subcommittee;
        req.threshold = threshold;
        req.createdAt = block.timestamp;
        req.status = ResponseStatus.Pending;
        req.consensusType = consensusType;
        req.maxCost = msg.value;
        req.finalCost = 0;
        req.agentCreator = agent.owner;

        emit RequestCreated(requestId, agentId, maxPerAgentFee, payload, subcommittee);
    }

    // ============ Response Functions ============

    function submitResponse(
        uint256 requestId,
        bytes calldata result,
        uint256 receipt,
        uint256 cost,
        bool success
    ) external override {

        upkeepRequests();

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
        if (req.status != ResponseStatus.Pending) {
            return;
        }

        // Store the response in pre-allocated slot
        uint256 idx = req.responseCount;
        if (idx < req.responses.length) {
            Response storage resp = req.responses[idx];
            resp.validator = msg.sender;
            resp.result = result;
            resp.status = success ? ResponseStatus.Success : ResponseStatus.Failed;
            resp.receipt = receipt;
            resp.cost = cost;
            resp.timestamp = block.timestamp;
        } else {
            req.responses.push(Response({
                validator: msg.sender,
                result: result,
                status: success ? ResponseStatus.Success : ResponseStatus.Failed,
                receipt: receipt,
                cost: cost,
                timestamp: block.timestamp
            }));
        }
        req.responseCount++;

        if (!success) req.failureCount++;

        // Check if success is still mathematically possible
        uint256 successCount = req.responseCount - req.failureCount;
        uint256 remaining = req.subcommittee.length - req.responseCount;

        if (successCount + remaining < req.threshold) {
            // Success is impossible — finalize as Failed
            _finalizeWithStatus(requestId, ResponseStatus.Failed);
            return;
        }

        // Check finalization based on consensus type (only successful responses count)
        if (success) {
            if (req.consensusType == ConsensusType.Majority) {
                if (_checkMajorityConsensus(req.responses, req.responseCount, req.threshold)) {
                    _finalizeWithStatus(requestId, ResponseStatus.Success);
                }
            } else {
                if (successCount >= req.threshold) {
                    _finalizeWithStatus(requestId, ResponseStatus.Success);
                }
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
        // Only count successful responses for majority agreement
        for (uint256 i = 0; i < responseCount; i++) {
            if (responses[i].status != ResponseStatus.Success) continue;
            uint256 count = 0;
            for (uint256 j = 0; j < responseCount; j++) {
                if (responses[j].status != ResponseStatus.Success) continue;
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

    // ============ Finalization ============

    function _finalizeWithStatus(uint256 requestId, ResponseStatus status) internal {
        Request storage req = requests[requestId % requests.length];
        require(req.status == ResponseStatus.Pending, "SomniaAgents: already finalized");

        req.status = status;

        uint256 medianCost = _getMedianCost(req.responses, req.responseCount);
        uint256 validatorCosts = medianCost * req.subcommittee.length;

        uint256 callbackGasCost = _invokeCallback(req, status, validatorCosts);

        _settleRequest(req, status, validatorCosts, callbackGasCost);
    }

    function _invokeCallback(Request storage req, ResponseStatus status, uint256 validatorCosts) internal returns (uint256 callbackGasCost) {
        callbackGasCost = callbackGasLimit * tx.gasprice;

        if (req.callbackAddress == address(0)) return callbackGasCost;

        uint256 totalCost = validatorCosts + callbackGasCost;

        // Build results array (only successful responses)
        bytes[] memory results = _getSuccessfulResults(req.responses, req.responseCount);

        (bool ok, ) = req.callbackAddress.call{gas: callbackGasLimit}(
            abi.encodeWithSelector(
                req.callbackSelector,
                req.id,
                results,
                status,
                totalCost
            )
        );
        // Callback failure is silently ignored — caller can check via getResponses
    }

    function _getSuccessfulResults(Response[] storage responses, uint256 responseCount) internal view returns (bytes[] memory) {
        uint256 successCount = 0;
        for (uint256 i = 0; i < responseCount; i++) {
            if (responses[i].status == ResponseStatus.Success) successCount++;
        }

        bytes[] memory results = new bytes[](successCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < responseCount; i++) {
            if (responses[i].status == ResponseStatus.Success) {
                results[idx] = responses[i].result;
                idx++;
            }
        }
        return results;
    }

    function _settleRequest(Request storage req, ResponseStatus status, uint256 validatorCosts, uint256 callbackGasCost) internal {
        req.finalCost = validatorCosts + callbackGasCost;

        // Distribute validatorCosts via Committee
        if (validatorCosts > 0) {
            uint256 runnerTotal = validatorCosts * runnerBps / 10000;
            uint256 creatorTotal = validatorCosts * creatorBps / 10000;
            uint256 protocolTotal = validatorCosts - runnerTotal - creatorTotal;

            // Runner share: equal split among subcommittee
            uint256 subLen = req.subcommittee.length;
            uint256 perRunner = runnerTotal / subLen;
            uint256 runnerRemainder = runnerTotal - (perRunner * subLen);
            protocolTotal += runnerRemainder;

            // Creator share (falls back to protocol if no creator)
            if (req.agentCreator == address(0)) {
                protocolTotal += creatorTotal;
                creatorTotal = 0;
            }

            // Protocol share (falls back to contract if no treasury)
            if (treasury == address(0)) {
                protocolTotal = 0;
            }

            // Build deposit arrays
            uint256 depositCount = subLen;
            if (creatorTotal > 0) depositCount++;
            if (protocolTotal > 0) depositCount++;

            address[] memory recipients = new address[](depositCount);
            uint256[] memory amounts = new uint256[](depositCount);

            for (uint256 i = 0; i < subLen; i++) {
                recipients[i] = req.subcommittee[i];
                amounts[i] = perRunner;
            }

            uint256 idx = subLen;
            uint256 depositTotal = perRunner * subLen;
            if (creatorTotal > 0) {
                recipients[idx] = req.agentCreator;
                amounts[idx] = creatorTotal;
                depositTotal += creatorTotal;
                idx++;
            }
            if (protocolTotal > 0) {
                recipients[idx] = treasury;
                amounts[idx] = protocolTotal;
                depositTotal += protocolTotal;
            }

            committee.deposit{value: depositTotal}(recipients, amounts);
        }

        // Rebate unused funds to requester
        if (req.finalCost < req.maxCost) {
            uint256 rebate = req.maxCost - req.finalCost;
            (bool sent, ) = req.requester.call{value: rebate}("");
        }

        emit RequestFinalized(req.id, status);
    }

    function _getAllCosts(Response[] storage responses, uint256 responseCount) internal view returns (uint256[] memory) {
        uint256[] memory costs = new uint256[](responseCount);
        for (uint256 i = 0; i < responseCount; i++) {
            costs[i] = responses[i].cost;
        }
        return costs;
    }

    function _getMedianCost(Response[] storage responses, uint256 responseCount) internal view returns (uint256) {
        if (responseCount == 0) {
            return 0;
        }
        return MathLib.median(_getAllCosts(responses, responseCount));
    }

    // ============ Timeout Functions ============

    function timeoutRequest(uint256 requestId) external validRequest(requestId) {
        _timeoutRequest(requestId);
    }

    function _timeoutRequest(uint256 requestId) internal {
        Request storage req = requests[requestId % requests.length];

        require(req.status == ResponseStatus.Pending, "SomniaAgents: request already finalized");
        require(block.timestamp > req.createdAt + requestTimeout, "SomniaAgents: request not timed out yet");

        req.status = ResponseStatus.TimedOut;

        uint256 medianCost = _getMedianCost(req.responses, req.responseCount);
        uint256 validatorCosts = medianCost * req.subcommittee.length;

        uint256 callbackGasCost = _invokeCallback(req, ResponseStatus.TimedOut, validatorCosts);

        _settleRequest(req, ResponseStatus.TimedOut, validatorCosts, callbackGasCost);
    }

    // Upkeep function to timeout old requests - walks from oldest pending forward
    function upkeepRequests() public {
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
            if (req.status != ResponseStatus.Pending) {
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
        req.status = ResponseStatus.TimedOut;

        uint256 medianCost = _getMedianCost(req.responses, req.responseCount);
        uint256 validatorCosts = medianCost * req.subcommittee.length;

        uint256 callbackGasCost = _invokeCallback(req, ResponseStatus.TimedOut, validatorCosts);

        _settleRequest(req, ResponseStatus.TimedOut, validatorCosts, callbackGasCost);
    }

    // ============ View Functions ============

    function getRequest(uint256 requestId) external view override returns (
        address requester,
        address callbackAddress,
        bytes4 callbackSelector,
        address[] memory subcommittee,
        uint256 threshold,
        uint256 createdAt,
        ResponseStatus status,
        uint256 responseCount,
        ConsensusType consensusType,
        uint256 maxCost,
        uint256 finalCost,
        address agentCreator
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
            req.status,
            req.responseCount,
            req.consensusType,
            req.maxCost,
            req.finalCost,
            req.agentCreator
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

    function hasRequest(uint256 requestId) external view override returns (bool) {
        return requests[requestId % requests.length].id == requestId;
    }

    function getRequestDeposit() external view override returns (uint256) {
        return maxPerAgentFee * defaultSubcommitteeSize;
    }

    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view override returns (uint256) {
        return maxPerAgentFee * subcommitteeSize;
    }
}
