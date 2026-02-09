// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/// @notice Full agent info including owner
struct Agent {
    uint256 agentId;
    address owner;
    string metadataUri;
    string containerImageUri;
}

/// @title IAgentRegistry Interface
/// @notice Interface for agent NFT registry
interface IAgentRegistry {
    event AgentSet(
        uint256 indexed agentId,
        address indexed owner,
        string metadataUri,
        string containerImageUri
    );

    event AgentDeleted(uint256 indexed agentId, address indexed owner);

    error AgentNotFound(uint256 agentId);
    error NotAgentOwner(uint256 agentId, address caller);

    function setAgent(
        uint256 agentId,
        string calldata metadataUri,
        string calldata containerImageUri
    ) external;

    function deleteAgent(uint256 agentId) external;

    function getAgent(uint256 agentId) external view returns (Agent memory agent);

    function getAgentsByOwner(address owner) external view returns (uint256[] memory agentIds);

    function getAllAgents() external view returns (uint256[] memory agentIds);

    function getAgentsPaginated(uint256 offset, uint256 limit) external view returns (uint256[] memory agentIds);

    function agentExists(uint256 agentId) external view returns (bool);
}

/// @title AgentRegistry - Enumerable ERC721 Agent Registry
/// @notice Each agent is an NFT that can be minted by anyone and updated by its owner
contract AgentRegistry is IAgentRegistry, ERC721Enumerable {
    mapping(uint256 => Agent) internal _agents;

    constructor() ERC721("Somnia Agents", "SAGENT") {}

    modifier onlyAgentOwner(uint256 agentId) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        _;
    }

    function setAgent(
        uint256 agentId,
        string calldata metadataUri,
        string calldata containerImageUri
    ) external override {
        address currentOwner = _ownerOf(agentId);

        if (currentOwner == address(0)) {
            _safeMint(msg.sender, agentId);
        } else if (currentOwner != msg.sender) {
            revert NotAgentOwner(agentId, msg.sender);
        }

        _agents[agentId] = Agent({
            agentId: agentId,
            owner: msg.sender,
            metadataUri: metadataUri,
            containerImageUri: containerImageUri
        });

        emit AgentSet(agentId, msg.sender, metadataUri, containerImageUri);
    }

    function deleteAgent(uint256 agentId) external override onlyAgentOwner(agentId) {
        address owner = ownerOf(agentId);
        delete _agents[agentId];
        _burn(agentId);
        emit AgentDeleted(agentId, owner);
    }

    function getAgent(uint256 agentId) external view override returns (Agent memory agent) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        return _agents[agentId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert AgentNotFound(tokenId);
        return _agents[tokenId].metadataUri;
    }

    function getAgentsByOwner(address owner) external view override returns (uint256[] memory agentIds) {
        uint256 balance = balanceOf(owner);
        agentIds = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            agentIds[i] = tokenOfOwnerByIndex(owner, i);
        }
        return agentIds;
    }

    function getAllAgents() external view override returns (uint256[] memory agentIds) {
        uint256 total = totalSupply();
        agentIds = new uint256[](total);
        for (uint256 i = 0; i < total; i++) {
            agentIds[i] = tokenByIndex(i);
        }
        return agentIds;
    }

    function getAgentsPaginated(uint256 offset, uint256 limit) external view override returns (uint256[] memory agentIds) {
        uint256 total = totalSupply();
        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 remaining = total - offset;
        uint256 count = remaining < limit ? remaining : limit;

        agentIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            agentIds[i] = tokenByIndex(offset + i);
        }
        return agentIds;
    }

    function agentExists(uint256 agentId) external view override returns (bool) {
        return _ownerOf(agentId) != address(0);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        address from = super._update(to, tokenId, auth);

        // Keep the stored owner in sync (for transfers, not burns)
        if (to != address(0)) {
            _agents[tokenId].owner = to;
        }

        return from;
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
