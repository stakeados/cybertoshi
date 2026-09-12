// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @notice Zero initial supply. One fixed community reserve plus NFT burn rewards.
contract BasedCatToken is ERC20, ERC20Burnable {
    address public immutable collection;
    address public vault;
    bool public bootstrapped;
    uint256 public constant COMMUNITY_RESERVE = 1_000_000 ether;
    error Unauthorized();

    constructor() ERC20("Based Cat", "BCAT") {
        collection = msg.sender;
    }

    function setVault(address value) external {
        if (msg.sender != collection || vault != address(0) || value == address(0)) revert Unauthorized();
        vault = value;
    }

    function mintReward(address to, uint256 amount) external {
        if (msg.sender != collection) revert Unauthorized();
        _mint(to, amount);
    }

    function bootstrap() external {
        if (msg.sender != vault || bootstrapped) revert Unauthorized();
        bootstrapped = true;
        _mint(vault, COMMUNITY_RESERVE);
    }
}
