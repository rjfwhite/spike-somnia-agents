// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @title ICommittee Interface
/// @notice Interface for validator committee management
interface ICommittee {
    event NewEpoch(uint256 indexed epoch, address[] members);

    function memberHeartbeat() external;
    function upkeep() external;
    function getActiveMembers() external view returns (address[] memory);
    function electSubcommittee(uint256 n, bytes32 seed) external view returns (address[] memory);
    function isActive(address addr) external view returns (bool);
    function currentEpoch() external view returns (uint256);
}

contract Committee is ICommittee {
    mapping(address => uint256) public lastHeartbeat;
    mapping(address => bool) internal _active;
    address[] public knownAddresses;

    uint256 public override currentEpoch;
    uint256 public lastUpkeep;
    uint256 public constant HEARTBEAT_INTERVAL = 1 minutes;

    constructor() {
        currentEpoch = 1;
    }

    function memberHeartbeat() external override {
        _upkeep();

        if (lastHeartbeat[msg.sender] == 0) {
            knownAddresses.push(msg.sender);
        }

        lastHeartbeat[msg.sender] = block.timestamp;
    }

    function upkeep() external override {
        _upkeep();
    }

    function _upkeep() internal {
        if (block.timestamp < lastUpkeep + 1 minutes) {
            return;
        }
        lastUpkeep = block.timestamp;

        bool epochChanged = false;
        uint256 i = 0;

        while (i < knownAddresses.length) {
            address addr = knownAddresses[i];
            bool wasActive = _active[addr];
            bool nowActive = block.timestamp <= lastHeartbeat[addr] + HEARTBEAT_INTERVAL;

            if (!nowActive) {
                delete lastHeartbeat[addr];
                delete _active[addr];
                knownAddresses[i] = knownAddresses[knownAddresses.length - 1];
                knownAddresses.pop();
                if (wasActive) epochChanged = true;
                continue;
            }

            if (wasActive != nowActive) {
                _active[addr] = nowActive;
                epochChanged = true;
            }

            i++;
        }

        if (epochChanged) {
            currentEpoch++;
            emit NewEpoch(currentEpoch, getActiveMembers());
        }
    }

    function isActive(address addr) external view override returns (bool) {
        return _active[addr];
    }

    function getActiveMembers() public view override returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < knownAddresses.length; i++) {
            if (_active[knownAddresses[i]]) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < knownAddresses.length; i++) {
            if (_active[knownAddresses[i]]) {
                result[index++] = knownAddresses[i];
            }
        }

        return result;
    }

    function electSubcommittee(uint256 n, bytes32 seed) external view override returns (address[] memory) {
        address[] memory members = getActiveMembers();
        require(n <= members.length, "n exceeds active members");

        for (uint256 i = 0; i < n; i++) {
            uint256 j = i + uint256(keccak256(abi.encodePacked(seed, i))) % (members.length - i);
            (members[i], members[j]) = (members[j], members[i]);
        }

        address[] memory result = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            result[i] = members[i];
        }

        return result;
    }
}
