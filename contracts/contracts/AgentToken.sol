// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract AgentToken {
    // ERC-20 state
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Agent metadata
    string public metadataJson;
    string public containerUrl;
    uint256 public price;

    address public owner;

    // ERC-20 events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // Metadata events
    event MetadataUpdated(string metadataJson);
    event ContainerUrlUpdated(string containerUrl);
    event PriceUpdated(uint256 price);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "AgentToken: caller is not the owner");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        string memory _metadataJson,
        string memory _containerUrl,
        uint256 _price
    ) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;

        metadataJson = _metadataJson;
        containerUrl = _containerUrl;
        price = _price;

        // Mint initial supply to deployer
        totalSupply = _initialSupply;
        balanceOf[msg.sender] = _initialSupply;
        emit Transfer(address(0), msg.sender, _initialSupply);
    }

    // ============ ERC-20 Functions ============

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= amount, "AgentToken: insufficient allowance");

        if (currentAllowance != type(uint256).max) {
            allowance[from][msg.sender] = currentAllowance - amount;
        }

        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(from != address(0), "AgentToken: transfer from zero address");
        require(to != address(0), "AgentToken: transfer to zero address");
        require(balanceOf[from] >= amount, "AgentToken: insufficient balance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // ============ Owner Functions ============

    function setMetadataJson(string calldata _metadataJson) external onlyOwner {
        metadataJson = _metadataJson;
        emit MetadataUpdated(_metadataJson);
    }

    function setContainerUrl(string calldata _containerUrl) external onlyOwner {
        containerUrl = _containerUrl;
        emit ContainerUrlUpdated(_containerUrl);
    }

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
        emit PriceUpdated(_price);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AgentToken: new owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
