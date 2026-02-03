// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AgentToken} from "./AgentToken.sol";
import {Test} from "forge-std/Test.sol";

contract AgentTokenTest is Test {
    AgentToken token;
    address owner;
    address alice;
    address bob;

    string constant NAME = "Test Agent";
    string constant SYMBOL = "TAGENT";
    uint256 constant INITIAL_SUPPLY = 1000000 * 10**18;
    string constant METADATA = '{"name":"Test Agent","description":"A test agent"}';
    string constant CONTAINER_URL = "https://registry.example.com/agent:v1";
    uint256 constant PRICE = 100;

    function setUp() public {
        owner = address(this);
        alice = address(0x1);
        bob = address(0x2);

        token = new AgentToken(
            NAME,
            SYMBOL,
            INITIAL_SUPPLY,
            METADATA,
            CONTAINER_URL,
            PRICE
        );
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(token.name(), NAME);
        assertEq(token.symbol(), SYMBOL);
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY);
        assertEq(token.metadataJson(), METADATA);
        assertEq(token.containerUrl(), CONTAINER_URL);
        assertEq(token.price(), PRICE);
        assertEq(token.owner(), owner);
    }

    // ============ ERC-20 Tests ============

    function test_Transfer() public {
        uint256 amount = 1000 * 10**18;

        token.transfer(alice, amount);

        assertEq(token.balanceOf(alice), amount);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - amount);
    }

    function test_Transfer_RevertInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert("AgentToken: insufficient balance");
        token.transfer(bob, 1);
    }

    function test_Transfer_RevertToZeroAddress() public {
        vm.expectRevert("AgentToken: transfer to zero address");
        token.transfer(address(0), 100);
    }

    function test_Approve() public {
        uint256 amount = 500 * 10**18;

        token.approve(alice, amount);

        assertEq(token.allowance(owner, alice), amount);
    }

    function test_TransferFrom() public {
        uint256 amount = 500 * 10**18;

        token.approve(alice, amount);

        vm.prank(alice);
        token.transferFrom(owner, bob, amount);

        assertEq(token.balanceOf(bob), amount);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - amount);
        assertEq(token.allowance(owner, alice), 0);
    }

    function test_TransferFrom_MaxAllowance() public {
        uint256 amount = 500 * 10**18;

        token.approve(alice, type(uint256).max);

        vm.prank(alice);
        token.transferFrom(owner, bob, amount);

        // Max allowance should not decrease
        assertEq(token.allowance(owner, alice), type(uint256).max);
    }

    function test_TransferFrom_RevertInsufficientAllowance() public {
        token.approve(alice, 100);

        vm.prank(alice);
        vm.expectRevert("AgentToken: insufficient allowance");
        token.transferFrom(owner, bob, 200);
    }

    // ============ Metadata Tests ============

    function test_SetMetadataJson() public {
        string memory newMetadata = '{"name":"Updated Agent"}';

        token.setMetadataJson(newMetadata);

        assertEq(token.metadataJson(), newMetadata);
    }

    function test_SetMetadataJson_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("AgentToken: caller is not the owner");
        token.setMetadataJson("new");
    }

    function test_SetContainerUrl() public {
        string memory newUrl = "https://new.registry.com/agent:v2";

        token.setContainerUrl(newUrl);

        assertEq(token.containerUrl(), newUrl);
    }

    function test_SetContainerUrl_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("AgentToken: caller is not the owner");
        token.setContainerUrl("new");
    }

    function test_SetPrice() public {
        uint256 newPrice = 200;

        token.setPrice(newPrice);

        assertEq(token.price(), newPrice);
    }

    function test_SetPrice_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("AgentToken: caller is not the owner");
        token.setPrice(999);
    }

    // ============ Ownership Tests ============

    function test_TransferOwnership() public {
        token.transferOwnership(alice);

        assertEq(token.owner(), alice);

        // New owner can update metadata
        vm.prank(alice);
        token.setPrice(999);
        assertEq(token.price(), 999);

        // Old owner cannot
        vm.expectRevert("AgentToken: caller is not the owner");
        token.setPrice(1);
    }

    function test_TransferOwnership_RevertZeroAddress() public {
        vm.expectRevert("AgentToken: new owner is zero address");
        token.transferOwnership(address(0));
    }

    function test_TransferOwnership_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("AgentToken: caller is not the owner");
        token.transferOwnership(bob);
    }

    // ============ Event Tests ============

    function test_Transfer_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit AgentToken.Transfer(owner, alice, 100);
        token.transfer(alice, 100);
    }

    function test_Approval_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit AgentToken.Approval(owner, alice, 100);
        token.approve(alice, 100);
    }

    function test_SetMetadata_EmitsEvent() public {
        string memory newMeta = "new";
        vm.expectEmit(false, false, false, true);
        emit AgentToken.MetadataUpdated(newMeta);
        token.setMetadataJson(newMeta);
    }

    function test_SetContainerUrl_EmitsEvent() public {
        string memory newUrl = "new";
        vm.expectEmit(false, false, false, true);
        emit AgentToken.ContainerUrlUpdated(newUrl);
        token.setContainerUrl(newUrl);
    }

    function test_SetPrice_EmitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit AgentToken.PriceUpdated(500);
        token.setPrice(500);
    }
}
