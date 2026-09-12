// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAerodromeRouter} from "./ToshiBuybackRouter.sol";

/// @notice TEST NETWORKS ONLY. API simulator, not a production exchange or price oracle.
contract TestDex is ERC20 {
    bool public fail;
    uint256 public observationLength = 1;
    uint256 public observedAt;
    uint256 public outputBps = 10000;
    address public asset;
    uint256 public lastMinimum;
    mapping(address => uint256) public pendingTokenFees;
    mapping(address => uint256) public pendingEthFees;

    // Test-only WETH/LP API simulation; the fork test uses separate real assets.
    function fundFees(address recipient, uint256 amount) external payable {
        require(IERC20(asset).transferFrom(msg.sender, address(this), amount));
        pendingTokenFees[recipient] += amount;
        pendingEthFees[recipient] += msg.value;
    }

    function claimFees() external returns (uint256 tokenFees, uint256 ethFees) {
        require(!fail, "DEX failed");
        tokenFees = pendingTokenFees[msg.sender];
        ethFees = pendingEthFees[msg.sender];
        delete pendingTokenFees[msg.sender];
        delete pendingEthFees[msg.sender];
        require(IERC20(asset).transfer(msg.sender, tokenFees));
        _mint(msg.sender, ethFees);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }

    constructor() ERC20("TEST ONLY LP", "TEST-LP") {
        require(block.chainid == 31337 || block.chainid == 84532, "Test networks only");
        observedAt = block.timestamp;
    }
    receive() external payable {}

    function setFail(bool value) external {
        fail = value;
    }

    function setOutputBps(uint256 value) external {
        outputBps = value;
    }

    function getPool(address, address, bool) external view returns (address) {
        return asset == address(0) ? address(0) : address(this);
    }

    function observations(uint256) external view returns (uint256, uint256, uint256) {
        return (observedAt, 0, 0);
    }

    function sync() external {
        if (block.timestamp > observedAt + 1800) {
            observationLength++;
            observedAt = block.timestamp;
        }
    }

    function quote(address, uint256 amount, uint256) external pure returns (uint256) {
        return amount * 50_000_000;
    }

    function addLiquidityETH(
        address t,
        bool,
        uint256 desired,
        uint256 tokenMin,
        uint256 ethMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256, uint256, uint256) {
        require(!fail && block.timestamp <= deadline && desired >= tokenMin && msg.value >= ethMin, "DEX failed");
        asset = t;
        require(IERC20(t).transferFrom(msg.sender, address(this), desired));
        _mint(to, 1 ether);
        return (desired, msg.value, 1 ether);
    }

    function swapExactETHForTokens(uint256 minimum, IAerodromeRouter.Route[] calldata, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts)
    {
        require(!fail && block.timestamp <= deadline, "DEX failed");
        lastMinimum = minimum;
        uint256 amount = msg.value * 50_000_000 * outputBps / 10000;
        require(amount >= minimum, "Slippage");
        require(IERC20(asset).transfer(to, amount));
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = amount;
    }
}
