// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Committee, ICommittee} from "./Committee.sol";
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
        require(committee.getActiveMembers().length == 0, "No active members initially");
    }

    function test_Heartbeat_JoinsIfNotMember() public {
        vm.prank(member1);
        committee.heartbeatMembership();

        require(committee.isActive(member1), "Should be active after heartbeat");
        require(committee.getActiveMembers().length == 1, "Should have 1 member");
    }

    function test_Heartbeat_EmitsJoinEvent() public {
        vm.expectEmit(true, false, false, false);
        emit ICommittee.MemberJoined(member1);

        vm.prank(member1);
        committee.heartbeatMembership();
    }

    function test_Heartbeat_IdempotentForExistingMember() public {
        vm.prank(member1);
        committee.heartbeatMembership();

        // Second heartbeat should not revert, just update timestamp
        vm.warp(block.timestamp + 30 seconds);
        vm.prank(member1);
        committee.heartbeatMembership();

        require(committee.isActive(member1), "Should still be active");
        require(committee.lastHeartbeat(member1) == block.timestamp, "Heartbeat should update");
    }

    function test_Leave_BecomesInactive() public {
        vm.prank(member1);
        committee.heartbeatMembership();

        vm.prank(member1);
        committee.leaveMembership();

        require(!committee.isActive(member1), "Should be inactive after leaving");
        require(committee.getActiveMembers().length == 0, "Should have 0 members");
    }

    function test_Leave_EmitsEvent() public {
        vm.prank(member1);
        committee.heartbeatMembership();

        vm.expectEmit(true, false, false, false);
        emit ICommittee.MemberLeft(member1);

        vm.prank(member1);
        committee.leaveMembership();
    }

    function test_Leave_CannotLeaveIfNotMember() public {
        vm.prank(member1);
        vm.expectRevert("Not a member");
        committee.leaveMembership();
    }

    function test_MissedHeartbeat_BecomesInactive() public {
        vm.prank(member1);
        committee.heartbeatMembership();

        // Miss heartbeat
        vm.warp(block.timestamp + 2 minutes);
        committee.upkeep();

        require(!committee.isActive(member1), "Should be inactive after missing heartbeat");
    }

    function test_CanRejoin() public {
        vm.prank(member1);
        committee.heartbeatMembership();

        // Miss heartbeat - gets removed
        vm.warp(block.timestamp + 2 minutes);
        committee.upkeep();

        // Rejoin via heartbeat
        vm.prank(member1);
        committee.heartbeatMembership();

        require(committee.isActive(member1), "Should be active again");
    }

    function test_GetActiveMembers() public {
        vm.prank(member1);
        committee.heartbeatMembership();
        vm.prank(member2);
        committee.heartbeatMembership();

        address[] memory active = committee.getActiveMembers();
        require(active.length == 2, "Should have 2 active");
    }

    function test_Cleanup_RemovesInactive() public {
        vm.prank(member1);
        committee.heartbeatMembership();
        vm.prank(member2);
        committee.heartbeatMembership();

        // Only member1 keeps heartbeating
        vm.warp(block.timestamp + 30 seconds);
        vm.prank(member1);
        committee.heartbeatMembership();

        vm.warp(block.timestamp + 1 minutes);
        committee.upkeep();

        require(committee.isActive(member1), "member1 should still be active");
        require(!committee.isActive(member2), "member2 should be inactive");
        require(committee.lastHeartbeat(member2) == 0, "member2 should be cleaned up");
    }

    function test_UpkeepRateLimited() public {
        vm.prank(member1);
        committee.heartbeatMembership();

        // Miss heartbeat
        vm.warp(block.timestamp + 2 minutes);
        committee.upkeep();
        require(!committee.isActive(member1), "Should be inactive");

        // Rejoin
        vm.prank(member1);
        committee.heartbeatMembership();

        // Upkeep won't run again yet (rate limited)
        committee.upkeep();
        require(committee.isActive(member1), "Should still be active (upkeep rate limited)");
    }

    function test_ElectSubcommittee() public {
        // Add 3 members
        vm.prank(member1);
        committee.heartbeatMembership();
        vm.prank(member2);
        committee.heartbeatMembership();
        vm.prank(address(0x3));
        committee.heartbeatMembership();

        // Elect 2 of 3
        address[] memory sub = committee.electSubcommittee(2, bytes32("seed1"));
        require(sub.length == 2, "Should return 2 members");
    }

    function test_ElectSubcommittee_Deterministic() public {
        vm.prank(member1);
        committee.heartbeatMembership();
        vm.prank(member2);
        committee.heartbeatMembership();

        bytes32 seed = bytes32("test");
        address[] memory sub1 = committee.electSubcommittee(1, seed);
        address[] memory sub2 = committee.electSubcommittee(1, seed);

        require(sub1[0] == sub2[0], "Same seed should return same result");
    }

    function test_ElectSubcommittee_DifferentSeeds() public {
        // Add many members to increase chance of different results
        for (uint160 i = 1; i <= 10; i++) {
            vm.prank(address(i));
            committee.heartbeatMembership();
        }

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
        committee.heartbeatMembership();

        vm.expectRevert("n exceeds active members");
        committee.electSubcommittee(2, bytes32("seed"));
    }

    function test_MultipleMembers_LeaveOrder() public {
        // Test that leaving maintains correct member list
        vm.prank(member1);
        committee.heartbeatMembership();
        vm.prank(member2);
        committee.heartbeatMembership();
        vm.prank(address(0x3));
        committee.heartbeatMembership();

        // Member2 leaves (middle of array)
        vm.prank(member2);
        committee.leaveMembership();

        address[] memory active = committee.getActiveMembers();
        require(active.length == 2, "Should have 2 members");
        require(committee.isActive(member1), "member1 should be active");
        require(!committee.isActive(member2), "member2 should be inactive");
        require(committee.isActive(address(0x3)), "member3 should be active");
    }
}
