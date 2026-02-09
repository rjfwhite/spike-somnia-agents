// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {SomniaAgents, Request, Response, ConsensusType, ResponseStatus} from "./SomniaAgents.sol";
import {AgentRegistry, IAgentRegistry} from "./AgentRegistry.sol";
import {Committee, ICommittee} from "./Committee.sol";
import {Test} from "forge-std/Test.sol";

contract MockCallback {
    uint256 public lastRequestId;
    bytes[] public lastResults;
    ResponseStatus public lastStatus;
    uint256 public lastCost;
    uint256 public callCount;

    function handleResponse(
        uint256 requestId,
        bytes[] calldata results,
        ResponseStatus status,
        uint256 cost
    ) external {
        lastRequestId = requestId;
        delete lastResults;
        for (uint256 i = 0; i < results.length; i++) {
            lastResults.push(results[i]);
        }
        lastStatus = status;
        lastCost = cost;
        callCount++;
    }

    function getLastResults() external view returns (bytes[] memory) {
        return lastResults;
    }

    function lastResultsLength() external view returns (uint256) {
        return lastResults.length;
    }

    receive() external payable {}
}

contract SomniaAgentsTest is Test {
    SomniaAgents agents;
    AgentRegistry registry;
    Committee committee;
    MockCallback callback;

    // Implement ERC721Receiver so test contract can receive NFTs
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    address validator1;
    address validator2;
    address validator3;
    address validator4;
    address validator5;

    // Default test values for receipt, cost, and agent
    uint256 constant TEST_RECEIPT = 12345; // CID as uint256
    uint256 constant TEST_COST = 100;
    uint256 constant TEST_AGENT_ID = 1;
    string constant TEST_CONTAINER_URL = "docker.io/somnia/agent:v1";

    function _fee() internal view returns (uint256) {
        return agents.getRequestDeposit();
    }

    function _fee(uint256 n) internal view returns (uint256) {
        return agents.getAdvancedRequestDeposit(n);
    }

    function setUp() public {
        registry = new AgentRegistry();
        committee = new Committee();
        agents = new SomniaAgents(100, address(registry), address(committee), 0);
        agents.setDefaultSubcommitteeSize(3);
        agents.setDefaultThreshold(2);
        callback = new MockCallback();

        validator1 = address(0x1);
        validator2 = address(0x2);
        validator3 = address(0x3);
        validator4 = address(0x4);
        validator5 = address(0x5);

        // Set defaults to match test expectations
        agents.setDefaultSubcommitteeSize(3);
        agents.setDefaultThreshold(2);

        // Create a test agent
        registry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL);

        // Register validators
        _registerValidators();
    }

    function _registerValidators() internal {
        vm.prank(validator1);
        committee.heartbeatMembership();
        vm.prank(validator2);
        committee.heartbeatMembership();
        vm.prank(validator3);
        committee.heartbeatMembership();
        vm.prank(validator4);
        committee.heartbeatMembership();
        vm.prank(validator5);
        committee.heartbeatMembership();
    }

    function _setupSmallAgent() internal returns (SomniaAgents) {
        AgentRegistry smallRegistry = new AgentRegistry();
        Committee smallCommittee = new Committee();
        SomniaAgents smallAgent = new SomniaAgents(3, address(smallRegistry), address(smallCommittee), 0);

        // Set defaults for small agent
        smallAgent.setDefaultSubcommitteeSize(3);
        smallAgent.setDefaultThreshold(2);

        // Create agent
        smallRegistry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL);

        // Register validators
        vm.prank(validator1);
        smallCommittee.heartbeatMembership();
        vm.prank(validator2);
        smallCommittee.heartbeatMembership();
        vm.prank(validator3);
        smallCommittee.heartbeatMembership();

        return smallAgent;
    }

    function test_CreateRequest() public {
        uint256 maxCostSent = _fee();
        uint256 requestId = agents.createRequest{value: maxCostSent}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        (
            address requester,
            address callbackAddr,
            bytes4 selector,
            address[] memory subcommittee,
            uint256 threshold,
            uint256 createdAt,
            ResponseStatus status,
            uint256 responseCount,
            ConsensusType consensusType,
            uint256 maxCost,
            uint256 finalCost,
            address agentCreator
        ) = agents.getRequest(requestId);

        assertEq(requester, address(this));
        assertEq(callbackAddr, address(callback));
        assertEq(selector, MockCallback.handleResponse.selector);
        assertEq(subcommittee.length, 3); // default size
        assertEq(threshold, 2); // default threshold
        assertEq(createdAt, block.timestamp);
        assertTrue(status == ResponseStatus.Pending);
        assertEq(responseCount, 0);
        assertEq(uint8(consensusType), uint8(ConsensusType.Majority)); // default
        assertEq(maxCost, maxCostSent);
        assertEq(finalCost, 0); // not finalized yet
    }

    function test_CreateRequestWithParams() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(5)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            5, // subcommittee size
            3, // threshold
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee, uint256 threshold,,,,ConsensusType consensusType,,,) = agents.getRequest(requestId);

        assertEq(subcommittee.length, 5);
        assertEq(threshold, 3);
        assertEq(uint8(consensusType), uint8(ConsensusType.Threshold));
    }

    function test_SubmitResponse() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);
        address member = subcommittee[0];

        vm.prank(member);
        agents.submitResponse(requestId, "response1", TEST_RECEIPT, TEST_COST, true);

        (,,,,,,,uint256 responseCount,,,,) = agents.getRequest(requestId);
        assertEq(responseCount, 1);
    }

    function test_SubmitResponse_OnlySubcommittee() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        address nonMember = address(0x999);

        vm.prank(nonMember);
        vm.expectRevert("SomniaAgents: not a subcommittee member");
        agents.submitResponse(requestId, "response", TEST_RECEIPT, TEST_COST, true);
    }

    function test_SubmitResponse_NoDuplicates() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);
        address member = subcommittee[0];

        vm.prank(member);
        agents.submitResponse(requestId, "response1", TEST_RECEIPT, TEST_COST, true);

        vm.prank(member);
        vm.expectRevert("SomniaAgents: already responded");
        agents.submitResponse(requestId, "response2", TEST_RECEIPT, TEST_COST, true);
    }

    function test_Finalization_AtThreshold_Majority() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Submit first response - should not finalize (need 2 agreeing)
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 100, true);

        (,,,,,,ResponseStatus status1,,,,,) = agents.getRequest(requestId);
        assertTrue(status1 == ResponseStatus.Pending);

        // Submit second response with same value - should finalize
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 200, true);

        (,,,,,,ResponseStatus status2,,,,,) = agents.getRequest(requestId);
        assertTrue(status2 != ResponseStatus.Pending);

        // Callback should have been called with Success status
        assertEq(callback.callCount(), 1);
        assertEq(callback.lastRequestId(), requestId);
        assertEq(uint8(callback.lastStatus()), uint8(ResponseStatus.Success));
        assertEq(callback.lastResultsLength(), 2);

        bytes[] memory results = callback.getLastResults();
        assertEq(results[0], "result");
        assertEq(results[1], "result");
    }

    function test_Majority_RequiresAgreement() public {
        // With threshold=2, need 2 validators to agree on the same value
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2, // threshold
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Two validators submit different values
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "value1", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "value2", TEST_RECEIPT, TEST_COST, true);

        // Should NOT be finalized - no majority agreement
        (,,,,,,ResponseStatus status1,,,,,) = agents.getRequest(requestId);
        assertTrue(status1 == ResponseStatus.Pending);

        // Third validator agrees with first
        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "value1", TEST_RECEIPT, TEST_COST, true);

        // Now should be finalized
        (,,,,,,ResponseStatus status2,,,,,) = agents.getRequest(requestId);
        assertTrue(status2 != ResponseStatus.Pending);

        // Results should contain all successful responses
        bytes[] memory results = callback.getLastResults();
        assertEq(results.length, 3);
    }

    function test_Aggregation_MajorityWins() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2, // threshold
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Two validators agree
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "majority", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "majority", TEST_RECEIPT, TEST_COST, true);

        // Should finalize immediately when 2 agree
        assertEq(uint8(callback.lastStatus()), uint8(ResponseStatus.Success));
    }

    function test_CannotSubmitAfterFinalized() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Finalize by reaching majority agreement
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);

        // Third member can call but it's a no-op (returns early)
        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "late response", TEST_RECEIPT, TEST_COST, true);

        // Callback count should still be 1
        assertEq(callback.callCount(), 1);
    }

    function test_Timeout() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Cannot submit after timeout
        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);
        vm.prank(subcommittee[0]);
        vm.expectRevert("SomniaAgents: request timed out");
        agents.submitResponse(requestId, "late", TEST_RECEIPT, TEST_COST, true);
    }

    function test_TimeoutRequest_ManualTimeout() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        // Submit one response
        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "partial", TEST_RECEIPT, TEST_COST, true);

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Anyone can call timeout
        agents.timeoutRequest(requestId);

        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status != ResponseStatus.Pending);

        // Callback should be called with TimedOut status
        assertEq(callback.callCount(), 1);
        assertEq(uint8(callback.lastStatus()), uint8(ResponseStatus.TimedOut));
        // Should still contain the partial result
        assertEq(callback.lastResultsLength(), 1);
        bytes[] memory results = callback.getLastResults();
        assertEq(results[0], "partial");
    }

    function test_TimeoutRequest_CannotTimeoutEarly() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        vm.expectRevert("SomniaAgents: request not timed out yet");
        agents.timeoutRequest(requestId);
    }

    function test_OwnerFunctions() public {
        agents.setDefaultSubcommitteeSize(5);
        assertEq(agents.defaultSubcommitteeSize(), 5);

        agents.setDefaultThreshold(3);
        assertEq(agents.defaultThreshold(), 3);

        agents.setRequestTimeout(10 minutes);
        assertEq(agents.requestTimeout(), 10 minutes);

        address newOwner = address(0x123);
        agents.transferOwnership(newOwner);
        assertEq(agents.owner(), newOwner);
    }

    function test_OwnerFunctions_OnlyOwner() public {
        vm.prank(address(0x999));
        vm.expectRevert("SomniaAgents: caller is not the owner");
        agents.setDefaultSubcommitteeSize(5);

        vm.prank(address(0x999));
        vm.expectRevert("SomniaAgents: caller is not the owner");
        agents.setDefaultThreshold(3);

        vm.prank(address(0x999));
        vm.expectRevert("SomniaAgents: caller is not the owner");
        agents.setRequestTimeout(10 minutes);

        vm.prank(address(0x999));
        vm.expectRevert("SomniaAgents: caller is not the owner");
        agents.transferOwnership(address(0x123));
    }

    function test_IsRequestPending() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        assertTrue(agents.hasRequest(requestId));

        // Finalize it (same value for majority consensus)
        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);

        // Request still exists after finalization
        assertTrue(agents.hasRequest(requestId));
        // But it's finalized
        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status != ResponseStatus.Pending);
    }

    function test_CreateRequest_NotEnoughMembers() public {
        // Deploy fresh contracts with no validators
        AgentRegistry freshRegistry = new AgentRegistry();
        Committee freshCommittee = new Committee();
        SomniaAgents freshAgents = new SomniaAgents(100, address(freshRegistry), address(freshCommittee), 0);

        // Create agent
        freshRegistry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL);

        uint256 fee = freshAgents.getRequestDeposit();
        vm.expectRevert("SomniaAgents: not enough active members");
        freshAgents.createRequest{value: fee}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );
    }

    function test_CreateRequest_InvalidThreshold() public {
        uint256 fee = _fee(3);
        vm.expectRevert("SomniaAgents: invalid threshold");
        agents.createAdvancedRequest{value: fee}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            0, // invalid: threshold must be > 0
            ConsensusType.Majority
        );

        vm.expectRevert("SomniaAgents: invalid threshold");
        agents.createAdvancedRequest{value: fee}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            4, // invalid: threshold > subcommittee size
            ConsensusType.Majority
        );
    }

    function test_CreateRequest_NoCallback() public {
        // Requests without callbacks are allowed (pure outbound queries)
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(0),
            bytes4(0),
            "test payload"
        );

        (,address callbackAddr,,,,,,,,,,) = agents.getRequest(requestId);
        assertEq(callbackAddr, address(0));

        // Finalize without callback - should not revert
        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);

        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status != ResponseStatus.Pending);
    }

    function test_CreateRequest_AgentNotFound() public {
        uint256 fee = _fee();
        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.AgentNotFound.selector, 999));
        agents.createRequest{value: fee}(
            999, // non-existent agent
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );
    }

    function test_MultipleRequests() public {
        uint256 req1 = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "payload1"
        );

        uint256 req2 = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "payload2"
        );

        assertEq(req1, 0);
        assertEq(req2, 1);
        assertEq(agents.nextRequestId(), 2);
    }

    // ============ Threshold Consensus Tests ============

    function test_Threshold_FinalizesOnCount() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2, // threshold
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Submit first response - should not finalize
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "value1", TEST_RECEIPT, TEST_COST, true);

        (,,,,,,ResponseStatus status1,,,,,) = agents.getRequest(requestId);
        assertTrue(status1 == ResponseStatus.Pending);

        // Submit second response (different value) - SHOULD finalize (threshold reached)
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "value2", TEST_RECEIPT, TEST_COST, true);

        (,,,,,,ResponseStatus status2,,,,,) = agents.getRequest(requestId);
        assertTrue(status2 != ResponseStatus.Pending);

        // Callback should receive all responses
        assertEq(callback.callCount(), 1);
        assertEq(callback.lastResultsLength(), 2);
    }

    function test_Threshold_ReturnsAllResponses() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            3, // require all responses
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "alpha", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "beta", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "gamma", TEST_RECEIPT, TEST_COST, true);

        bytes[] memory results = callback.getLastResults();

        assertEq(results.length, 3);
        assertEq(results[0], "alpha");
        assertEq(results[1], "beta");
        assertEq(results[2], "gamma");
    }

    function test_Threshold_DifferentValuesFinalizes() public {
        // Unlike Majority, Threshold doesn't care if values match
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // All different values
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "x", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "y", TEST_RECEIPT, TEST_COST, true);

        // Should be finalized even with different values
        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status != ResponseStatus.Pending);
    }

    function test_Threshold_UsedForMedian() public {
        // Simulate numeric values that would be median-aggregated
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "get price",
            3,
            3,
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Validators submit different cost estimates
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, abi.encode(100), TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, abi.encode(105), TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, abi.encode(102), TEST_RECEIPT, TEST_COST, true);

        // Callback receives all values
        bytes[] memory results = callback.getLastResults();
        assertEq(results.length, 3);

        // Verify the encoded values
        assertEq(abi.decode(results[0], (uint256)), 100);
        assertEq(abi.decode(results[1], (uint256)), 105);
        assertEq(abi.decode(results[2], (uint256)), 102);
    }

    // ============ Cost Calculation Tests ============

    function test_FinalCost_MedianTimesSubcommitteeSize() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Two validators agree with different costs
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", 1001, 100, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", 1002, 200, true);

        // Final cost = median(100, 200) * subcommitteeSize(3) = 150 * 3 = 450
        (,,,,,,,,,,uint256 finalCost,) = agents.getRequest(requestId);
        assertEq(finalCost, 450);
    }

    function test_FinalCost_OddConsensusCount() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            3,
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Three validators agree with different costs
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", 1001, 100, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", 1002, 300, true);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "result", 1003, 200, true);

        // Final cost should be median(100, 200, 300) * 3 = 200 * 3 = 600
        (,,,,,,,,,,uint256 finalCost,) = agents.getRequest(requestId);
        assertEq(finalCost, 600);
    }

    function test_FinalCost_ThresholdConsensus() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Different results but costs still used
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "x", 1001, 50, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "y", 1002, 150, true);

        // Final cost = median(50, 150) * subcommitteeSize(3) = 100 * 3 = 300
        (,,,,,,,,,,uint256 finalCost,) = agents.getRequest(requestId);
        assertEq(finalCost, 300);
    }

    function test_Response_HasReceiptAndCost() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        uint256 testReceipt = 67890;
        uint256 testCost = 12345;

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", testReceipt, testCost, true);

        // Check via getResponses
        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses.length, 1);
        assertEq(responses[0].validator, subcommittee[0]);
        assertEq(uint8(responses[0].status), uint8(ResponseStatus.Success));
        assertEq(responses[0].receipt, testReceipt);
        assertEq(responses[0].cost, testCost);
    }

    // ============ Circular Buffer Tests ============

    function test_CircularBuffer_Wraparound() public {
        SomniaAgents smallAgent = _setupSmallAgent();

        // Create 3 requests (fills buffer)
        uint256 req0 = smallAgent.createRequest{value: smallAgent.getRequestDeposit()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload0");
        uint256 req1 = smallAgent.createRequest{value: smallAgent.getRequestDeposit()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload1");
        uint256 req2 = smallAgent.createRequest{value: smallAgent.getRequestDeposit()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload2");

        assertEq(req0, 0);
        assertEq(req1, 1);
        assertEq(req2, 2);

        // All requests should be valid
        assertTrue(smallAgent.hasRequest(req0));
        assertTrue(smallAgent.hasRequest(req1));
        assertTrue(smallAgent.hasRequest(req2));

        // Create 4th request - overwrites slot 0 (req0)
        uint256 req3 = smallAgent.createRequest{value: smallAgent.getRequestDeposit()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload3");
        assertEq(req3, 3);

        // req0 should now be invalid (overwritten), req3 should be valid
        assertFalse(smallAgent.hasRequest(req0));
        assertTrue(smallAgent.hasRequest(req3));
        assertTrue(smallAgent.hasRequest(req1));
        assertTrue(smallAgent.hasRequest(req2));
    }

    function test_CircularBuffer_OldRequestRejected() public {
        AgentRegistry smallRegistry = new AgentRegistry();
        Committee smallCommittee = new Committee();
        SomniaAgents smallAgent = new SomniaAgents(2, address(smallRegistry), address(smallCommittee), 0);

        smallAgent.setDefaultSubcommitteeSize(3);
        smallAgent.setDefaultThreshold(2);
        smallRegistry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL);

        vm.prank(validator1);
        smallCommittee.heartbeatMembership();
        vm.prank(validator2);
        smallCommittee.heartbeatMembership();
        vm.prank(validator3);
        smallCommittee.heartbeatMembership();

        // Create request 0
        uint256 req0 = smallAgent.createRequest{value: smallAgent.getRequestDeposit()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "old");

        // Create requests 1 and 2 to overwrite slot 0
        smallAgent.createRequest{value: smallAgent.getRequestDeposit()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "new1");
        smallAgent.createRequest{value: smallAgent.getRequestDeposit()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "new2");

        // Trying to submit response to overwritten request should fail
        (,,, address[] memory sub,,,,,,,,) = smallAgent.getRequest(2); // Get subcommittee for valid request
        vm.prank(sub[0]);
        vm.expectRevert("SomniaAgents: request not found or overwritten");
        smallAgent.submitResponse(req0, "late", TEST_RECEIPT, TEST_COST, true);
    }

    // ============ Upkeep Tests ============

    function test_UpkeepRequests_TimesOutOldRequests() public {
        // Create multiple requests
        uint256 req0 = agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload0");
        agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload1");

        // Submit partial response to req0
        (,,, address[] memory sub0,,,,,,,,) = agents.getRequest(req0);
        vm.prank(sub0[0]);
        agents.submitResponse(req0, "partial", TEST_RECEIPT, TEST_COST, true);

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Run upkeep
        agents.upkeepRequests();

        // Both requests should be finalized
        (,,,,,,ResponseStatus status0,,,,,) = agents.getRequest(0);
        (,,,,,,ResponseStatus status1,,,,,) = agents.getRequest(1);
        assertTrue(status0 != ResponseStatus.Pending);
        assertTrue(status1 != ResponseStatus.Pending);

        // Callback should have been called twice
        assertEq(callback.callCount(), 2);
    }

    function test_UpkeepRequests_CallbackWithNoResponses() public {
        // Create request with no responses
        uint256 requestId = agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload");

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Run upkeep
        agents.upkeepRequests();

        // Request should be finalized
        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status != ResponseStatus.Pending);

        // Callback should have been called with TimedOut and empty results
        assertEq(callback.callCount(), 1);
        assertEq(callback.lastRequestId(), requestId);
        assertEq(uint8(callback.lastStatus()), uint8(ResponseStatus.TimedOut));
        assertEq(callback.lastResultsLength(), 0);
    }

    function test_UpkeepRequests_SkipsAlreadyFinalized() public {
        uint256 requestId = agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload");

        // Finalize by reaching consensus
        (,,, address[] memory sub,,,,,,,,) = agents.getRequest(requestId);
        vm.prank(sub[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);
        vm.prank(sub[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);

        assertEq(callback.callCount(), 1);

        // Warp past timeout and run upkeep
        vm.warp(block.timestamp + 6 minutes);
        agents.upkeepRequests();

        // Callback count should still be 1 (not called again)
        assertEq(callback.callCount(), 1);
    }

    function test_UpkeepRequests_SkipsNotYetTimedOut() public {
        agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload");

        // Run upkeep without waiting for timeout
        agents.upkeepRequests();

        // Request should NOT be finalized
        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(0);
        assertTrue(status == ResponseStatus.Pending);
        assertEq(callback.callCount(), 0);
    }

    function test_UpkeepRequests_AdvancesOldestPending() public {
        // Create several requests
        for (uint256 i = 0; i < 5; i++) {
            agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, abi.encodePacked("payload", i));
        }

        assertEq(agents.oldestPendingId(), 0);

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Run upkeep - should process all 5
        agents.upkeepRequests();

        // All should be finalized
        (,,,,,,ResponseStatus status0,,,,,) = agents.getRequest(0);
        (,,,,,,ResponseStatus status4,,,,,) = agents.getRequest(4);
        assertTrue(status0 != ResponseStatus.Pending);
        assertTrue(status4 != ResponseStatus.Pending);

        // oldestPendingId should advance to nextRequestId
        assertEq(agents.oldestPendingId(), 5);
        assertEq(agents.nextRequestId(), 5);

        // Running upkeep again should be a no-op
        agents.upkeepRequests();
        assertEq(callback.callCount(), 5); // Still 5, not more
    }

    function test_UpkeepRequests_StopsAtNotTimedOut() public {
        // Create 2 requests
        agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "req0");
        agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "req1");

        // Warp past timeout for first 2
        vm.warp(block.timestamp + 6 minutes);

        // Create a new request (not timed out yet)
        agents.createRequest{value: _fee()}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "req2");

        // Run upkeep
        agents.upkeepRequests();

        // First 2 should be finalized, 3rd should not
        (,,,,,,ResponseStatus status0,,,,,) = agents.getRequest(0);
        (,,,,,,ResponseStatus status1,,,,,) = agents.getRequest(1);
        (,,,,,,ResponseStatus status2,,,,,) = agents.getRequest(2);

        assertTrue(status0 != ResponseStatus.Pending);
        assertTrue(status1 != ResponseStatus.Pending);
        assertTrue(status2 == ResponseStatus.Pending);

        // oldestPendingId should stop at 2
        assertEq(agents.oldestPendingId(), 2);
    }

    // ============ Failure Tests ============

    function test_Failure_SingleFailureDoesNotFinalize() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // One failure — success is still possible (2 remaining)
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, TEST_COST, false);

        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status == ResponseStatus.Pending);
        assertEq(callback.callCount(), 0);
    }

    function test_Failure_FailuresDoNotCountTowardMajority() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // One success, one failure — should NOT finalize (need 2 agreeing successes)
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, TEST_COST, false);

        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status == ResponseStatus.Pending);

        // Third agrees with first — NOW it should finalize
        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_COST, true);

        (,,,,,,ResponseStatus status2,,,,,) = agents.getRequest(requestId);
        assertTrue(status2 != ResponseStatus.Pending);
        assertEq(uint8(callback.lastStatus()), uint8(ResponseStatus.Success));
    }

    function test_Failure_FailuresDoNotCountTowardThreshold() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // One success, one failure — should NOT finalize
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "x", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, TEST_COST, false);

        (,,,,,,ResponseStatus status,,,,,) = agents.getRequest(requestId);
        assertTrue(status == ResponseStatus.Pending);

        // Second success — NOW should finalize
        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "y", TEST_RECEIPT, TEST_COST, true);

        (,,,,,,ResponseStatus status2,,,,,) = agents.getRequest(requestId);
        assertTrue(status2 != ResponseStatus.Pending);
        assertEq(uint8(callback.lastStatus()), uint8(ResponseStatus.Success));

        // Results should only contain successful responses
        assertEq(callback.lastResultsLength(), 2);
    }

    function test_Failure_SuccessImpossible_FinalizesAsFailed() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2, // need 2 successes
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Two failures — only 1 remaining, can't reach threshold of 2
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, TEST_COST, false);

        (,,,,,,ResponseStatus status1,,,,,) = agents.getRequest(requestId);
        assertTrue(status1 == ResponseStatus.Pending); // Still possible after 1 failure

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, TEST_COST, false);

        // Now impossible: 0 successes + 1 remaining < 2 threshold
        (,,,,,,ResponseStatus status2,,,,,) = agents.getRequest(requestId);
        assertTrue(status2 != ResponseStatus.Pending);
        assertEq(uint8(callback.lastStatus()), uint8(ResponseStatus.Failed));
        assertEq(callback.lastResultsLength(), 0); // No successful results
    }

    function test_Failure_FailureStillCostsValidator() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // All three fail — finalize as Failed
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, 100, false);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, 200, false);

        // Finalized after 2nd failure (impossible to reach threshold)
        (,,,,,,,,,,uint256 finalCost,) = agents.getRequest(requestId);
        // median(100, 200) * 3 = 150 * 3 = 450
        assertEq(finalCost, 450);
    }

    // ============ getResponses Tests ============

    function test_GetResponses_AllResponded() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Majority
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", 111, 100, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", 222, 200, true);

        // Finalized after 2 matching responses — only returns respondents
        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses.length, 2);
        assertEq(responses[0].validator, subcommittee[0]);
        assertEq(responses[1].validator, subcommittee[1]);
        assertEq(uint8(responses[0].status), uint8(ResponseStatus.Success));
        assertEq(uint8(responses[1].status), uint8(ResponseStatus.Success));
    }

    function test_GetResponses_MixedResults() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // One success, one failure, one not responded
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", 111, 100, true);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "", 222, 50, false);

        // Only 2 respondents returned (third didn't respond)
        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses.length, 2);

        assertEq(responses[0].validator, subcommittee[0]);
        assertEq(uint8(responses[0].status), uint8(ResponseStatus.Success));
        assertEq(responses[0].receipt, 111);

        assertEq(responses[1].validator, subcommittee[1]);
        assertEq(uint8(responses[1].status), uint8(ResponseStatus.Failed));
        assertEq(responses[1].receipt, 222);
    }

    function test_GetResponses_ResultData() public {
        uint256 requestId = agents.createAdvancedRequest{value: _fee(3)}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Threshold
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // First: failure, Second: success, Third: success
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "", TEST_RECEIPT, TEST_COST, false);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "first_result", TEST_RECEIPT, TEST_COST, true);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "second_result", TEST_RECEIPT, TEST_COST, true);

        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses.length, 3);

        // Responses are in submission order
        assertEq(uint8(responses[0].status), uint8(ResponseStatus.Failed));
        assertEq(string(responses[0].result), "");

        assertEq(uint8(responses[1].status), uint8(ResponseStatus.Success));
        assertEq(string(responses[1].result), "first_result");

        assertEq(uint8(responses[2].status), uint8(ResponseStatus.Success));
        assertEq(string(responses[2].result), "second_result");
    }

    function test_GetResponses_InFlight() public {
        // Can query responses while request is still pending
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        // Before any responses — empty array
        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses.length, 0);

        // After one response
        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "partial", TEST_RECEIPT, TEST_COST, true);

        responses = agents.getResponses(requestId);
        assertEq(responses.length, 1);
        assertEq(uint8(responses[0].status), uint8(ResponseStatus.Success));
        assertEq(string(responses[0].result), "partial");
    }

    // ============ Registry/Committee Configuration Tests ============

    function test_SetAgentRegistry() public {
        AgentRegistry newRegistry = new AgentRegistry();
        agents.setAgentRegistry(address(newRegistry));
        assertEq(address(agents.agentRegistry()), address(newRegistry));
    }

    function test_SetCommittee() public {
        Committee newCommittee = new Committee();
        agents.setCommittee(address(newCommittee));
        assertEq(address(agents.committee()), address(newCommittee));
    }

    // ============ Revenue Share Tests ============

    function test_FeeDistribution_DefaultShares() public {
        address treasury = address(0xAA);
        agents.setTreasury(treasury);

        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "test"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Submit 2 responses (threshold=2) with cost=1000 each
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);

        // validatorCosts = median(1000) * 3 = 3000
        // runnerTotal = 3000 * 7000 / 10000 = 2100
        // creatorTotal = 3000 * 2000 / 10000 = 600
        // protocolTotal = 3000 - 2100 - 600 = 300
        // perRunner = 2100 / 3 = 700

        assertEq(committee.pendingBalance(subcommittee[0]), 700);
        assertEq(committee.pendingBalance(subcommittee[1]), 700);
        assertEq(committee.pendingBalance(subcommittee[2]), 700);
        assertEq(committee.pendingBalance(address(this)), 600); // creator (test contract owns the agent)
        assertEq(committee.pendingBalance(treasury), 300);
    }

    function test_FeeDistribution_CustomShares() public {
        address treasury = address(0xAA);
        agents.setTreasury(treasury);
        agents.setFeeShares(5000, 3000, 2000); // 50/30/20

        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "test"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);

        // validatorCosts = 3000
        // runnerTotal = 3000 * 5000 / 10000 = 1500, perRunner = 500
        // creatorTotal = 3000 * 3000 / 10000 = 900
        // protocolTotal = 3000 - 1500 - 900 = 600

        assertEq(committee.pendingBalance(subcommittee[0]), 500);
        assertEq(committee.pendingBalance(subcommittee[1]), 500);
        assertEq(committee.pendingBalance(subcommittee[2]), 500);
        assertEq(committee.pendingBalance(address(this)), 900);
        assertEq(committee.pendingBalance(treasury), 600);
    }

    function test_FeeDistribution_NoTreasury() public {
        // Treasury not set — protocol share stays in contract
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "test"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);

        // Runners and creator still get their shares
        assertEq(committee.pendingBalance(subcommittee[0]), 700);
        assertEq(committee.pendingBalance(address(this)), 600); // creator
        // Protocol share (300) is NOT in any pendingBalance — stays in contract
        assertEq(committee.pendingBalance(address(0)), 0);
    }

    function test_FeeDistribution_RunnerDustGoesToProtocol() public {
        address treasury = address(0xAA);
        agents.setTreasury(treasury);

        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "test"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        // Cost of 1001 each → validatorCosts = 1001 * 3 = 3003
        // runnerTotal = 3003 * 7000 / 10000 = 2102 (truncated)
        // perRunner = 2102 / 3 = 700, remainder = 2102 - 2100 = 2
        // creatorTotal = 3003 * 2000 / 10000 = 600 (truncated)
        // protocolTotal = 3003 - 2102 - 600 = 301 + remainder 2 = 303
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1001, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1001, true);

        assertEq(committee.pendingBalance(subcommittee[0]), 700);
        assertEq(committee.pendingBalance(subcommittee[1]), 700);
        assertEq(committee.pendingBalance(subcommittee[2]), 700);
        assertEq(committee.pendingBalance(address(this)), 600);
        assertEq(committee.pendingBalance(treasury), 303);
    }

    function test_Claim_Success() public {
        address treasury = address(0xAA);
        agents.setTreasury(treasury);

        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "test"
        );

        (,,, address[] memory subcommittee,,,,,,,,) = agents.getRequest(requestId);

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 1000, true);

        // Runner 0 has 700 pending
        assertEq(committee.pendingBalance(subcommittee[0]), 700);

        uint256 balanceBefore = subcommittee[0].balance;
        vm.prank(subcommittee[0]);
        committee.claim();
        assertEq(subcommittee[0].balance, balanceBefore + 700);
        assertEq(committee.pendingBalance(subcommittee[0]), 0);
    }

    function test_Claim_ZeroBalance() public {
        vm.prank(address(0x99));
        vm.expectRevert("Committee: no balance to claim");
        committee.claim();
    }

    function test_SetFeeShares_InvalidTotal() public {
        vm.expectRevert("SomniaAgents: shares must sum to 10000");
        agents.setFeeShares(5000, 3000, 1000); // sums to 9000
    }

    function test_SetTreasury() public {
        address treasury = address(0xBB);
        agents.setTreasury(treasury);
        assertEq(agents.treasury(), treasury);
    }

    function test_SetFeeShares_Success() public {
        agents.setFeeShares(6000, 2500, 1500);
        assertEq(agents.runnerBps(), 6000);
        assertEq(agents.creatorBps(), 2500);
        assertEq(agents.protocolBps(), 1500);
    }

    function test_GetRequest_ReturnsAgentCreator() public {
        uint256 requestId = agents.createRequest{value: _fee()}(
            TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "test"
        );

        (,,,,,,,,,,,address agentCreator) = agents.getRequest(requestId);
        assertEq(agentCreator, address(this)); // test contract is the agent owner
    }

}
