// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../contracts/Committee.sol";

contract DeployCommittee is Script {
    function run() external {
        vm.startBroadcast();

        Committee committee = new Committee();

        console.log("Committee deployed at:", address(committee));

        vm.stopBroadcast();
    }
}
