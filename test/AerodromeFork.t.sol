// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {CyberToshiNFT} from "../contracts/CyberToshiNFT.sol";
import {CyberToshiRenderer} from "../contracts/CyberToshiRenderer.sol";
import {ToshiBuybackRouter, IAerodromeRouter} from "../contracts/ToshiBuybackRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ForkVm {
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
    function skip(bool) external;
    function deal(address, uint256) external;
    function warp(uint256) external;
}

interface SellRouter {
    function swapExactTokensForETH(uint256, uint256, IAerodromeRouter.Route[] calldata, address, uint256) external returns (uint256[] memory);
}

/// @notice Executes against real Aerodrome bytecode on a read-only Base fork. No public transactions.
contract AerodromeForkTest {
    receive() external payable {}
    ForkVm constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testRealAerodromeBootstrapOracleAndBuyback() public {
        string memory rpc = vm.envOr("BASE_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        CyberToshiRenderer renderer = new CyberToshiRenderer();
        CyberToshiNFT nft = new CyberToshiNFT(
            address(renderer),
            0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43,
            0x4200000000000000000000000000000000000006,
            0x420DD381b31aEf6683db6B902084cB0FFECe40Da,
            block.timestamp
        );
        ToshiBuybackRouter vault = nft.buybackRouter();
        vm.deal(address(vault), 0.0202 ether);
        vault.bootstrapCommunityLiquidity();
        require(vault.bootstrapped() && nft.bcatToken().totalSupply() == 1_000_000 ether);
        uint256 locked = IERC20(vault.pool()).balanceOf(address(vault));
        require(locked > 0);
        vm.deal(address(this), 1 ether);
        IAerodromeRouter.Route[] memory route = new IAerodromeRouter.Route[](1);
        route[0] = IAerodromeRouter.Route(vault.weth(), address(nft.bcatToken()), false, vault.factory());
        IAerodromeRouter(vault.router()).swapExactETHForTokens{value: 0.00001 ether}(1, route, address(this), block.timestamp);
        uint256 bought = nft.bcatToken().balanceOf(address(this));
        nft.bcatToken().approve(vault.router(), bought);
        route[0] = IAerodromeRouter.Route(address(nft.bcatToken()), vault.weth(), false, vault.factory());
        SellRouter(vault.router()).swapExactTokensForETH(bought, 1, route, address(this), block.timestamp);
        uint256 supplyBefore = nft.bcatToken().totalSupply();
        uint256 ethBefore = address(vault).balance;
        vault.collectPoolFees();
        require(vault.totalFeeEthCollected() > 0 && vault.totalFeeBcatBurned() > 0);
        require(address(vault).balance == ethBefore + vault.totalFeeEthCollected());
        require(nft.bcatToken().totalSupply() == supplyBefore - vault.totalFeeBcatBurned());
        require(IERC20(vault.pool()).balanceOf(address(vault)) == locked);
        require(IERC20(vault.pool()).allowance(address(vault), vault.router()) == 0);
        vault.collectPoolFees();
        require(nft.bcatToken().totalSupply() == supplyBefore - vault.totalFeeBcatBurned());
        uint256 start = block.timestamp;
        for (uint256 i; i < 3; i++) {
            vm.warp(start + (i + 1) * 1801);
            vault.checkpoint();
        }
        (uint256 spend, uint256 minimum) = vault.buybackQuote();
        require(spend == 0.0002 ether && minimum > 0);
        vault.executeBuyback();
        require(vault.totalBcatBurned() > 0 && nft.bcatToken().totalSupply() < 1_000_000 ether);
    }
}
