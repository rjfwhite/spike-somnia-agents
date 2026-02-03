// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @title ICommittee Interface
/// @notice Interface for validator committee management
interface ICommittee {
    event MemberJoined(address indexed member);
    event MemberLeft(address indexed member);
    event MemberTimedOut(address indexed member);

    function heartbeatMembership() external;
    function leaveMembership() external;
    function upkeep() external;
    function getActiveMembers() external view returns (address[] memory);
    function electSubcommittee(uint256 n, bytes32 seed) external view returns (address[] memory);
    function isActive(address addr) external view returns (bool);
}

contract Committee is ICommittee {
    mapping(address => uint256) public lastHeartbeat;
    mapping(address => bool) internal _active;
    mapping(address => uint256) internal _memberIndex;
    address[] public members;

    uint256 public lastUpkeep;
    uint256 public constant HEARTBEAT_INTERVAL = 1 minutes;

    function heartbeatMembership() external override {
        if (!_active[msg.sender]) {
            _active[msg.sender] = true;
            _memberIndex[msg.sender] = members.length;
            members.push(msg.sender);
            emit MemberJoined(msg.sender);
        }
        lastHeartbeat[msg.sender] = block.timestamp;
        _upkeep();
    }

    function leaveMembership() external override {
        require(_active[msg.sender], "Not a member");
        _removeMember(msg.sender);
        emit MemberLeft(msg.sender);
    }

    function _removeMember(address addr) internal {
        uint256 index = _memberIndex[addr];
        uint256 lastIndex = members.length - 1;

        if (index != lastIndex) {
            address lastMember = members[lastIndex];
            members[index] = lastMember;
            _memberIndex[lastMember] = index;
        }

        members.pop();
        delete _active[addr];
        delete _memberIndex[addr];
        delete lastHeartbeat[addr];
    }

    function upkeep() external override {
        _upkeep();
    }

    function _upkeep() internal {
        if (block.timestamp < lastUpkeep + 1 minutes) {
            return;
        }
        lastUpkeep = block.timestamp;

        uint256 i = 0;
        while (i < members.length) {
            address addr = members[i];
            if (block.timestamp > lastHeartbeat[addr] + HEARTBEAT_INTERVAL) {
                emit MemberTimedOut(addr);
                _removeMember(addr);
                continue;
            }
            i++;
        }
    }

    function isActive(address addr) external view override returns (bool) {
        return _active[addr];
    }

    function getActiveMembers() public view override returns (address[] memory) {
        return members;
    }

    function electSubcommittee(uint256 n, bytes32 seed) external view override returns (address[] memory) {
        require(n <= members.length, "n exceeds active members");

        address[] memory shuffled = new address[](members.length);
        for (uint256 i = 0; i < members.length; i++) {
            shuffled[i] = members[i];
        }

        for (uint256 i = 0; i < n; i++) {
            uint256 j = i + uint256(keccak256(abi.encodePacked(seed, i))) % (shuffled.length - i);
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
        }

        address[] memory result = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            result[i] = shuffled[i];
        }

        return result;
    }
}
