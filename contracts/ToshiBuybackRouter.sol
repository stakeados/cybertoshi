// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BasedCatToken} from "./BasedCatToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWETH {
    function withdraw(uint256 amount) external;
}

interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }
    function addLiquidityETH(address, bool, uint256, uint256, uint256, address, uint256)
        external
        payable
        returns (uint256, uint256, uint256);
    function swapExactETHForTokens(uint256, Route[] calldata, address, uint256)
        external
        payable
        returns (uint256[] memory);
}

interface IPoolFactory {
    function getPool(address, address, bool) external view returns (address);
}

interface IPool {
    function claimFees() external returns (uint256, uint256);
    function quote(address, uint256, uint256) external view returns (uint256);
    function observationLength() external view returns (uint256);
    function observations(uint256) external view returns (uint256, uint256, uint256);
    function sync() external;
}

/// @notice Immutable community treasury. No owner, withdrawal or DEX replacement.
/// @dev Receiving fees never calls the DEX. Anyone may trigger maintenance separately.
contract ToshiBuybackRouter is ReentrancyGuard {
    BasedCatToken public immutable token;
    address public immutable router;
    address public immutable weth;
    address public immutable factory;
    uint256 public constant THRESHOLD = 0.02 ether;
    uint256 public constant MAX_BUYBACK = 0.0002 ether;
    uint256 public constant COOLDOWN = 30 minutes;
    bool public bootstrapped;
    uint256 public lastBuyback;
    uint256 public totalBcatBurned;
    uint256 public totalFeeEthCollected;
    uint256 public totalFeeBcatBurned;
    event PoolFeesCollected(uint256 ethCollected, uint256 bcatBurned);
    event Bootstrapped(address indexed pool, uint256 ethAmount, uint256 tokenAmount, uint256 liquidity);
    event Buyback(uint256 ethAmount, uint256 tokensBurned);
    error NotReady();
    error BadExecution();

    constructor(BasedCatToken t, address r, address w, address f) {
        require(r.code.length > 0 && w.code.length > 0 && f.code.length > 0, "Invalid DEX");
        token = t;
        router = r;
        weth = w;
        factory = f;
    }
    receive() external payable {}

    function pool() public view returns (address) {
        return IPoolFactory(factory).getPool(address(token), weth, false);
    }

    function bootstrapCommunityLiquidity() external nonReentrant {
        if (bootstrapped || address(this).balance < THRESHOLD) revert NotReady();
        bootstrapped = true;
        token.bootstrap();
        uint256 reserve = token.COMMUNITY_RESERVE();
        token.approve(router, reserve);
        (uint256 usedToken, uint256 usedEth, uint256 lp) = IAerodromeRouter(router).addLiquidityETH{value: THRESHOLD}(
            address(token), false, reserve, reserve, THRESHOLD, address(this), block.timestamp
        );
        if (usedToken != reserve || usedEth != THRESHOLD || lp == 0 || pool().code.length == 0) revert BadExecution();
        if (IERC20(pool()).balanceOf(address(this)) < lp) revert BadExecution();
        token.approve(router, 0);
        lastBuyback = block.timestamp;
        emit Bootstrapped(pool(), usedEth, usedToken, lp);
    }

    /// @notice LP stays here permanently: no transfer, approval or withdrawal entrypoint.
    /// @dev BCAT fees burn directly; WETH fees become ETH for the existing bounded buybacks.
    /// Collection is separate so unavailable fees cannot block minting or buybacks.
    function collectPoolFees() external nonReentrant {
        if (!bootstrapped) revert NotReady();
        uint256 beforeToken = token.balanceOf(address(this));
        uint256 beforeWeth = IERC20(weth).balanceOf(address(this));
        IPool(pool()).claimFees();
        uint256 bcatFees = token.balanceOf(address(this)) - beforeToken;
        uint256 wethFees = IERC20(weth).balanceOf(address(this)) - beforeWeth;
        if (bcatFees != 0) {
            token.burn(bcatFees);
            totalFeeBcatBurned += bcatFees;
            totalBcatBurned += bcatFees;
        }
        if (wethFees != 0) {
            IWETH(weth).withdraw(wethFees);
            totalFeeEthCollected += wethFees;
        }
        emit PoolFeesCollected(wethFees, bcatFees);
    }

    /// @notice Permissionless sampling; Aerodrome records observations at >30 minute intervals.
    function checkpoint() external {
        if (!bootstrapped) revert NotReady();
        IPool(pool()).sync();
    }

    function buybackQuote() public view returns (uint256 ethAmount, uint256 minimumOut) {
        if (!bootstrapped || block.timestamp < lastBuyback + COOLDOWN) revert NotReady();
        ethAmount = address(this).balance < MAX_BUYBACK ? address(this).balance : MAX_BUYBACK;
        if (ethAmount == 0) revert NotReady();
        IPool p = IPool(pool());
        uint256 count = p.observationLength();
        // Exclude the initial empty-pool interval.
        if (count < 4) revert NotReady();
        (uint256 latest,,) = p.observations(count - 1);
        if (block.timestamp - latest > 1 hours) revert NotReady();
        minimumOut = p.quote(weth, ethAmount, 2) * 9700 / 10000;
        if (minimumOut == 0) revert NotReady();
    }

    function executeBuyback() external nonReentrant {
        (uint256 amount, uint256 minOut) = buybackQuote();
        lastBuyback = block.timestamp;
        IAerodromeRouter.Route[] memory route = new IAerodromeRouter.Route[](1);
        route[0] = IAerodromeRouter.Route(weth, address(token), false, factory);
        uint256 beforeBalance = token.balanceOf(address(this));
        IAerodromeRouter(router).swapExactETHForTokens{value: amount}(minOut, route, address(this), block.timestamp);
        uint256 received = token.balanceOf(address(this)) - beforeBalance;
        if (received < minOut) revert BadExecution();
        token.burn(received);
        totalBcatBurned += received;
        emit Buyback(amount, received);
    }
}
