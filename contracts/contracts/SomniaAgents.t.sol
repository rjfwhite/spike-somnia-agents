// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {SomniaAgents, Request, Response, ConsensusType} from "./SomniaAgents.sol";
import {AgentRegistry, IAgentRegistry} from "./AgentRegistry.sol";
import {Committee, ICommittee} from "./Committee.sol";
import {Test} from "forge-std/Test.sol";

contract MockCallback {
    uint256 public lastRequestId;
    bytes public lastResult;
    uint256 public callCount;

    function handleResponse(uint256 requestId, bytes calldata result) external {
        lastRequestId = requestId;
        lastResult = result;
        callCount++;
    }

    // Helper to decode threshold consensus results
    function decodeThresholdResult() external view returns (bytes[] memory) {
        return abi.decode(lastResult, (bytes[]));
    }
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

    // Default test values for receipt, price, and agent
    uint256 constant TEST_RECEIPT = 12345; // CID as uint256
    uint256 constant TEST_PRICE = 100;
    uint256 constant TEST_AGENT_ID = 1;
    string constant TEST_CONTAINER_URL = "docker.io/somnia/agent:v1";

    function setUp() public {
        registry = new AgentRegistry();
        committee = new Committee();
        agents = new SomniaAgents(100, address(registry), address(committee));
        callback = new MockCallback();

        validator1 = address(0x1);
        validator2 = address(0x2);
        validator3 = address(0x3);
        validator4 = address(0x4);
        validator5 = address(0x5);

        // Create a test agent
        registry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL, 0);

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
        SomniaAgents smallAgent = new SomniaAgents(3, address(smallRegistry), address(smallCommittee));

        // Create agent
        smallRegistry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL, 0);

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
        uint256 maxCostSent = 1 ether;
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
            bool finalized,
            uint256 responseCount,
            ConsensusType consensusType,
            uint256 agentCost,
            uint256 maxCost,
            uint256 finalCost
        ) = agents.getRequest(requestId);

        assertEq(requester, address(this));
        assertEq(callbackAddr, address(callback));
        assertEq(selector, MockCallback.handleResponse.selector);
        assertEq(subcommittee.length, 3); // default size
        assertEq(threshold, 2); // default threshold
        assertEq(createdAt, block.timestamp);
        assertFalse(finalized);
        assertEq(responseCount, 0);
        assertEq(uint8(consensusType), uint8(ConsensusType.Majority)); // default
        assertEq(agentCost, 0); // agent cost from registry
        assertEq(maxCost, maxCostSent);
        assertEq(finalCost, 0); // not finalized yet
    }

    function test_CreateRequestWithParams() public {
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
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
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);
        address member = subcommittee[0];

        vm.prank(member);
        agents.submitResponse(requestId, "response1", TEST_RECEIPT, TEST_PRICE);

        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses.length, 1);
        assertEq(responses[0].validator, member);
        assertEq(responses[0].result, "response1");
        assertEq(responses[0].receipt, TEST_RECEIPT);
        assertEq(responses[0].price, TEST_PRICE);
    }

    function test_SubmitResponse_OnlySubcommittee() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        address nonMember = address(0x999);

        vm.prank(nonMember);
        vm.expectRevert("SomniaAgents: not a subcommittee member");
        agents.submitResponse(requestId, "response", TEST_RECEIPT, TEST_PRICE);
    }

    function test_SubmitResponse_NoDuplicates() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);
        address member = subcommittee[0];

        vm.prank(member);
        agents.submitResponse(requestId, "response1", TEST_RECEIPT, TEST_PRICE);

        vm.prank(member);
        vm.expectRevert("SomniaAgents: already responded");
        agents.submitResponse(requestId, "response2", TEST_RECEIPT, TEST_PRICE);
    }

    function test_Finalization_AtThreshold_Majority() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Submit first response - should not finalize (need 2 agreeing)
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 100);

        (,,,,,,bool finalized1,,,,,) = agents.getRequest(requestId);
        assertFalse(finalized1);

        // Submit second response with same value - should finalize
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, 200);

        (,,,,,,bool finalized2,,,,,) = agents.getRequest(requestId);
        assertTrue(finalized2);

        // Callback should have been called
        assertEq(callback.callCount(), 1);
        assertEq(callback.lastRequestId(), requestId);
        assertEq(callback.lastResult(), "result");
    }

    function test_Majority_RequiresAgreement() public {
        // With threshold=2, need 2 validators to agree on the same value
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2, // threshold
            ConsensusType.Majority
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Two validators submit different values
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "value1", TEST_RECEIPT, TEST_PRICE);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "value2", TEST_RECEIPT, TEST_PRICE);

        // Should NOT be finalized - no majority agreement
        (,,,,,,bool finalized1,,,,,) = agents.getRequest(requestId);
        assertFalse(finalized1);

        // Third validator agrees with first
        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "value1", TEST_RECEIPT, TEST_PRICE);

        // Now should be finalized
        (,,,,,,bool finalized2,,,,,) = agents.getRequest(requestId);
        assertTrue(finalized2);

        assertEq(callback.lastResult(), "value1");
    }

    function test_Aggregation_MajorityWins() public {
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2, // threshold
            ConsensusType.Majority
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Two validators agree
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "majority", TEST_RECEIPT, TEST_PRICE);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "majority", TEST_RECEIPT, TEST_PRICE);

        // Should finalize immediately when 2 agree
        assertEq(callback.lastResult(), "majority");
    }

    function test_CannotSubmitAfterFinalized() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Finalize by reaching majority agreement
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);

        // Third member can call but it's a no-op (returns early)
        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "late response", TEST_RECEIPT, TEST_PRICE);

        // Verify response count is still 2 (third wasn't stored)
        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses.length, 2);
    }

    function test_Timeout() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Cannot submit after timeout
        address[] memory subcommittee = agents.getSubcommittee(requestId);
        vm.prank(subcommittee[0]);
        vm.expectRevert("SomniaAgents: request timed out");
        agents.submitResponse(requestId, "late", TEST_RECEIPT, TEST_PRICE);
    }

    function test_TimeoutRequest_ManualTimeout() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        // Submit one response
        address[] memory subcommittee = agents.getSubcommittee(requestId);
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "partial", TEST_RECEIPT, TEST_PRICE);

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Anyone can call timeout
        agents.timeoutRequest(requestId);

        (,,,,,,bool finalized,,,,,) = agents.getRequest(requestId);
        assertTrue(finalized);

        // Callback should still be called with partial result
        assertEq(callback.callCount(), 1);
        assertEq(callback.lastResult(), "partial");
    }

    function test_TimeoutRequest_CannotTimeoutEarly() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
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
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        assertTrue(agents.isRequestPending(requestId));

        // Finalize it (same value for majority consensus)
        address[] memory subcommittee = agents.getSubcommittee(requestId);
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);

        assertFalse(agents.isRequestPending(requestId));
    }

    function test_CreateRequest_NotEnoughMembers() public {
        // Deploy fresh contracts with no validators
        AgentRegistry freshRegistry = new AgentRegistry();
        Committee freshCommittee = new Committee();
        SomniaAgents freshAgents = new SomniaAgents(100, address(freshRegistry), address(freshCommittee));

        // Create agent
        freshRegistry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL, 0);

        vm.expectRevert("SomniaAgents: not enough active members");
        freshAgents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );
    }

    function test_CreateRequest_InvalidThreshold() public {
        vm.expectRevert("SomniaAgents: invalid threshold");
        agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            0, // invalid: threshold must be > 0
            ConsensusType.Majority
        );

        vm.expectRevert("SomniaAgents: invalid threshold");
        agents.createRequestWithParams{value: 1 ether}(
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
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(0),
            bytes4(0),
            "test payload"
        );

        (,address callbackAddr,,,,,,,,,,) = agents.getRequest(requestId);
        assertEq(callbackAddr, address(0));

        // Finalize without callback - should not revert
        address[] memory subcommittee = agents.getSubcommittee(requestId);
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);

        (,,,,,,bool finalized,,,,,) = agents.getRequest(requestId);
        assertTrue(finalized);
    }

    function test_CreateRequest_AgentNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.AgentNotFound.selector, 999));
        agents.createRequest{value: 1 ether}(
            999, // non-existent agent
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );
    }

    function test_MultipleRequests() public {
        uint256 req1 = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "payload1"
        );

        uint256 req2 = agents.createRequest{value: 1 ether}(
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
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2, // threshold
            ConsensusType.Threshold
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Submit first response - should not finalize
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "value1", TEST_RECEIPT, TEST_PRICE);

        (,,,,,,bool finalized1,,,,,) = agents.getRequest(requestId);
        assertFalse(finalized1);

        // Submit second response (different value) - SHOULD finalize (threshold reached)
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "value2", TEST_RECEIPT, TEST_PRICE);

        (,,,,,,bool finalized2,,,,,) = agents.getRequest(requestId);
        assertTrue(finalized2);

        // Callback should receive all responses encoded
        assertEq(callback.callCount(), 1);
    }

    function test_Threshold_ReturnsAllResponses() public {
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            3, // require all responses
            ConsensusType.Threshold
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "alpha", TEST_RECEIPT, TEST_PRICE);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "beta", TEST_RECEIPT, TEST_PRICE);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "gamma", TEST_RECEIPT, TEST_PRICE);

        // Decode the result
        bytes[] memory results = callback.decodeThresholdResult();

        assertEq(results.length, 3);
        assertEq(results[0], "alpha");
        assertEq(results[1], "beta");
        assertEq(results[2], "gamma");
    }

    function test_Threshold_DifferentValuesFinalizes() public {
        // Unlike Majority, Threshold doesn't care if values match
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Threshold
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // All different values
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "x", TEST_RECEIPT, TEST_PRICE);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "y", TEST_RECEIPT, TEST_PRICE);

        // Should be finalized even with different values
        (,,,,,,bool finalized,,,,,) = agents.getRequest(requestId);
        assertTrue(finalized);
    }

    function test_Threshold_UsedForMedian() public {
        // Simulate numeric values that would be median-aggregated
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "get price",
            3,
            3,
            ConsensusType.Threshold
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Validators submit different price estimates
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, abi.encode(100), TEST_RECEIPT, TEST_PRICE);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, abi.encode(105), TEST_RECEIPT, TEST_PRICE);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, abi.encode(102), TEST_RECEIPT, TEST_PRICE);

        // Callback receives all values - can compute median off-chain
        bytes[] memory results = callback.decodeThresholdResult();
        assertEq(results.length, 3);

        // Verify the encoded values
        assertEq(abi.decode(results[0], (uint256)), 100);
        assertEq(abi.decode(results[1], (uint256)), 105);
        assertEq(abi.decode(results[2], (uint256)), 102);
    }

    // ============ Price Calculation Tests ============

    function test_FinalPrice_MedianTimesSubcommitteeSize() public {
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Majority
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Two validators agree with different prices
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", 1001, 100);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", 1002, 200);

        // Final cost = median(100, 200) * subcommitteeSize(3) = 150 * 3 = 450
        // All subcommittee members are paid, not just responders
        (,,,,,,,,,,,uint256 finalCost) = agents.getRequest(requestId);
        assertEq(finalCost, 450);
    }

    function test_FinalPrice_OddConsensusCount() public {
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            3,
            ConsensusType.Majority
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Three validators agree with different prices
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", 1001, 100);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "result", 1002, 300);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "result", 1003, 200);

        // Final price should be median(100, 200, 300) * 3 = 200 * 3 = 600
        (,,,,,,,,,,,uint256 finalCost) = agents.getRequest(requestId);
        assertEq(finalCost, 600);
    }

    function test_FinalPrice_ThresholdConsensus() public {
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Threshold
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // Different results but prices still used
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "x", 1001, 50);

        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "y", 1002, 150);

        // Final cost = median(50, 150) * subcommitteeSize(3) = 100 * 3 = 300
        (,,,,,,,,,,,uint256 finalCost) = agents.getRequest(requestId);
        assertEq(finalCost, 300);
    }

    function test_FinalPrice_OnlyConsensusValidatorsPrices() public {
        // In Majority consensus, only agreeing validators' prices count for median
        // But ALL subcommittee members are paid
        uint256 requestId = agents.createRequestWithParams{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload",
            3,
            2,
            ConsensusType.Majority
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        // First validator disagrees with high price
        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "different", 1001, 10000);

        // Two validators agree with lower prices
        vm.prank(subcommittee[1]);
        agents.submitResponse(requestId, "same", 1002, 100);

        vm.prank(subcommittee[2]);
        agents.submitResponse(requestId, "same", 1003, 200);

        // Median uses only agreeing validators: median(100, 200) = 150
        // But cost is median * subcommitteeSize: 150 * 3 = 450
        // The 10000 from disagreeing validator is NOT included in median
        (,,,,,,,,,,,uint256 finalCost) = agents.getRequest(requestId);
        assertEq(finalCost, 450);
    }

    function test_Response_HasReceiptAndPrice() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(
            TEST_AGENT_ID,
            address(callback),
            MockCallback.handleResponse.selector,
            "test payload"
        );

        address[] memory subcommittee = agents.getSubcommittee(requestId);

        uint256 testReceipt = 67890;
        uint256 testPrice = 12345;

        vm.prank(subcommittee[0]);
        agents.submitResponse(requestId, "result", testReceipt, testPrice);

        Response[] memory responses = agents.getResponses(requestId);
        assertEq(responses[0].receipt, testReceipt);
        assertEq(responses[0].price, testPrice);
    }

    // ============ Circular Buffer Tests ============

    function test_CircularBuffer_Wraparound() public {
        SomniaAgents smallAgent = _setupSmallAgent();

        // Create 3 requests (fills buffer)
        uint256 req0 = smallAgent.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload0");
        uint256 req1 = smallAgent.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload1");
        uint256 req2 = smallAgent.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload2");

        assertEq(req0, 0);
        assertEq(req1, 1);
        assertEq(req2, 2);

        // All requests should be valid
        assertTrue(smallAgent.isRequestValid(req0));
        assertTrue(smallAgent.isRequestValid(req1));
        assertTrue(smallAgent.isRequestValid(req2));

        // Create 4th request - overwrites slot 0 (req0)
        uint256 req3 = smallAgent.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload3");
        assertEq(req3, 3);

        // req0 should now be invalid (overwritten), req3 should be valid
        assertFalse(smallAgent.isRequestValid(req0));
        assertTrue(smallAgent.isRequestValid(req3));
        assertTrue(smallAgent.isRequestValid(req1));
        assertTrue(smallAgent.isRequestValid(req2));
    }

    function test_CircularBuffer_OldRequestRejected() public {
        AgentRegistry smallRegistry = new AgentRegistry();
        Committee smallCommittee = new Committee();
        SomniaAgents smallAgent = new SomniaAgents(2, address(smallRegistry), address(smallCommittee));

        smallRegistry.setAgent(TEST_AGENT_ID, "ipfs://metadata", TEST_CONTAINER_URL, 0);

        vm.prank(validator1);
        smallCommittee.heartbeatMembership();
        vm.prank(validator2);
        smallCommittee.heartbeatMembership();
        vm.prank(validator3);
        smallCommittee.heartbeatMembership();

        // Create request 0
        uint256 req0 = smallAgent.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "old");

        // Create requests 1 and 2 to overwrite slot 0
        smallAgent.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "new1");
        smallAgent.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "new2");

        // Trying to submit response to overwritten request should fail
        address[] memory sub = smallAgent.getSubcommittee(2); // Get subcommittee for valid request
        vm.prank(sub[0]);
        vm.expectRevert("SomniaAgents: request not found or overwritten");
        smallAgent.submitResponse(req0, "late", TEST_RECEIPT, TEST_PRICE);
    }

    // ============ Upkeep Tests ============

    function test_UpkeepRequests_TimesOutOldRequests() public {
        // Create multiple requests
        uint256 req0 = agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload0");
        uint256 req1 = agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload1");

        // Submit partial response to req0
        address[] memory sub0 = agents.getSubcommittee(req0);
        vm.prank(sub0[0]);
        agents.submitResponse(req0, "partial", TEST_RECEIPT, TEST_PRICE);

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Run upkeep
        agents.upkeepRequests();

        // Both requests should be finalized
        (,,,,,,bool finalized0,,,,,) = agents.getRequest(req0);
        (,,,,,,bool finalized1,,,,,) = agents.getRequest(req1);
        assertTrue(finalized0);
        assertTrue(finalized1);

        // Callback should have been called twice
        assertEq(callback.callCount(), 2);
    }

    function test_UpkeepRequests_CallbackWithNoResponses() public {
        // Create request with no responses
        uint256 requestId = agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload");

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Run upkeep
        agents.upkeepRequests();

        // Request should be finalized
        (,,,,,,bool finalized,,,,,) = agents.getRequest(requestId);
        assertTrue(finalized);

        // Callback should have been called with empty result
        assertEq(callback.callCount(), 1);
        assertEq(callback.lastRequestId(), requestId);
        assertEq(callback.lastResult(), ""); // Empty result
    }

    function test_UpkeepRequests_SkipsAlreadyFinalized() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload");

        // Finalize by reaching consensus
        address[] memory sub = agents.getSubcommittee(requestId);
        vm.prank(sub[0]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);
        vm.prank(sub[1]);
        agents.submitResponse(requestId, "result", TEST_RECEIPT, TEST_PRICE);

        assertEq(callback.callCount(), 1);

        // Warp past timeout and run upkeep
        vm.warp(block.timestamp + 6 minutes);
        agents.upkeepRequests();

        // Callback count should still be 1 (not called again)
        assertEq(callback.callCount(), 1);
    }

    function test_UpkeepRequests_SkipsNotYetTimedOut() public {
        uint256 requestId = agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "payload");

        // Run upkeep without waiting for timeout
        agents.upkeepRequests();

        // Request should NOT be finalized
        (,,,,,,bool finalized,,,,,) = agents.getRequest(requestId);
        assertFalse(finalized);
        assertEq(callback.callCount(), 0);
    }

    function test_UpkeepRequests_AdvancesOldestPending() public {
        // Create several requests
        for (uint256 i = 0; i < 5; i++) {
            agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, abi.encodePacked("payload", i));
        }

        assertEq(agents.oldestPendingId(), 0);

        // Warp past timeout
        vm.warp(block.timestamp + 6 minutes);

        // Run upkeep - should process all 5
        agents.upkeepRequests();

        // All should be finalized
        (,,,,,,bool finalized0,,,,,) = agents.getRequest(0);
        (,,,,,,bool finalized4,,,,,) = agents.getRequest(4);
        assertTrue(finalized0);
        assertTrue(finalized4);

        // oldestPendingId should advance to nextRequestId
        assertEq(agents.oldestPendingId(), 5);
        assertEq(agents.nextRequestId(), 5);

        // Running upkeep again should be a no-op
        agents.upkeepRequests();
        assertEq(callback.callCount(), 5); // Still 5, not more
    }

    function test_UpkeepRequests_StopsAtNotTimedOut() public {
        // Create 3 requests
        agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "req0");
        agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "req1");

        // Warp past timeout for first 2
        vm.warp(block.timestamp + 6 minutes);

        // Create a new request (not timed out yet)
        agents.createRequest{value: 1 ether}(TEST_AGENT_ID, address(callback), MockCallback.handleResponse.selector, "req2");

        // Run upkeep
        agents.upkeepRequests();

        // First 2 should be finalized, 3rd should not
        (,,,,,,bool finalized0,,,,,) = agents.getRequest(0);
        (,,,,,,bool finalized1,,,,,) = agents.getRequest(1);
        (,,,,,,bool finalized2,,,,,) = agents.getRequest(2);

        assertTrue(finalized0);
        assertTrue(finalized1);
        assertFalse(finalized2);

        // oldestPendingId should stop at 2
        assertEq(agents.oldestPendingId(), 2);
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
}
