// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Committee} from "./Committee.sol";
import {Test} from "forge-std/Test.sol";

contract CommitteeTest is Test {
    Committee committee;
    address member1;
    address member2;

    function setUp() public {
        member1 = address(0x1);
        member2 = address(0x2);
        committee = new Committee();
    }

    function test_InitialState() public view {
        require(committee.currentEpoch() == 1, "Initial epoch should be 1");
        require(committee.getActiveMembers().length == 0, "No active members initially");
    }

    function test_Heartbeat_BecomesActive() public {
        vm.prank(member1);
        committee.memberHeartbeat();

        // Warp to trigger upkeep
        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        require(committee.isActive(member1), "Should be active");
        require(committee.currentEpoch() == 2, "Epoch should increment");
    }

    function test_MissedHeartbeat_BecomesInactive() public {
        vm.prank(member1);
        committee.memberHeartbeat();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();
        require(committee.isActive(member1), "Should be active");

        // Miss heartbeat
        vm.warp(block.timestamp + 2 minutes);
        committee.upkeep();

        require(!committee.isActive(member1), "Should be inactive");
    }

    function test_CanRejoin() public {
        vm.prank(member1);
        committee.memberHeartbeat();

        // Miss heartbeat - gets removed
        vm.warp(block.timestamp + 2 minutes);
        committee.upkeep();

        // Rejoin
        vm.prank(member1);
        committee.memberHeartbeat();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        require(committee.isActive(member1), "Should be active again");
    }

    function test_GetActiveMembers() public {
        vm.prank(member1);
        committee.memberHeartbeat();
        vm.prank(member2);
        committee.memberHeartbeat();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        address[] memory active = committee.getActiveMembers();
        require(active.length == 2, "Should have 2 active");
    }

    function test_Cleanup_RemovesInactive() public {
        vm.prank(member1);
        committee.memberHeartbeat();
        vm.prank(member2);
        committee.memberHeartbeat();

        // Only member1 keeps heartbeating
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(member1);
        committee.memberHeartbeat();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        require(committee.lastHeartbeat(member2) == 0, "member2 should be cleaned up");
    }

    function test_UpkeepRateLimited() public {
        vm.prank(member1);
        committee.memberHeartbeat();

        // Upkeep won't run yet (rate limited)
        committee.upkeep();
        require(!committee.isActive(member1), "Should not be active yet");

        // After 1 minute, upkeep runs
        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();
        require(committee.isActive(member1), "Should be active now");
    }

    function test_ElectSubcommittee() public {
        // Add 3 members
        vm.prank(member1);
        committee.memberHeartbeat();
        vm.prank(member2);
        committee.memberHeartbeat();
        vm.prank(address(0x3));
        committee.memberHeartbeat();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        // Elect 2 of 3
        address[] memory sub = committee.electSubcommittee(2, bytes32("seed1"));
        require(sub.length == 2, "Should return 2 members");
    }

    function test_ElectSubcommittee_Deterministic() public {
        vm.prank(member1);
        committee.memberHeartbeat();
        vm.prank(member2);
        committee.memberHeartbeat();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        bytes32 seed = bytes32("test");
        address[] memory sub1 = committee.electSubcommittee(1, seed);
        address[] memory sub2 = committee.electSubcommittee(1, seed);

        require(sub1[0] == sub2[0], "Same seed should return same result");
    }

    function test_ElectSubcommittee_DifferentSeeds() public {
        // Add many members to increase chance of different results
        for (uint160 i = 1; i <= 10; i++) {
            vm.prank(address(i));
            committee.memberHeartbeat();
        }

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        address[] memory sub1 = committee.electSubcommittee(5, bytes32("seed1"));
        address[] memory sub2 = committee.electSubcommittee(5, bytes32("seed2"));

        bool different = false;
        for (uint256 i = 0; i < 5; i++) {
            if (sub1[i] != sub2[i]) {
                different = true;
                break;
            }
        }
        require(different, "Different seeds should likely return different results");
    }

    function test_ElectSubcommittee_RevertIfTooMany() public {
        vm.prank(member1);
        committee.memberHeartbeat();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        vm.expectRevert("n exceeds active members");
        committee.electSubcommittee(2, bytes32("seed"));
    }
}
