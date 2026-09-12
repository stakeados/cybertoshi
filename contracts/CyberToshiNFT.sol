// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BasedCatToken} from "./BasedCatToken.sol";
import {ToshiBuybackRouter} from "./ToshiBuybackRouter.sol";

interface IRenderer {
    function renderTokenURI(uint256, bytes32) external view returns (string memory);
}

/// @notice Experimental CPU proof-of-work collectibles. No creator allocation or admin.
contract CyberToshiNFT is ERC721Enumerable, ReentrancyGuard {
    uint256 public constant MINT_PRICE = 0.001 ether;
    uint256 public constant PRICE_STEP = 0.0001 ether;
    uint256 public constant MAX_SUPPLY = 16384;
    uint256 public constant EPOCH_SIZE = 512;
    uint256 public constant MIN_MINT_INTERVAL = 60;
    uint256 public constant SCALE = 1e18;
    uint256 public constant EASIEST_TARGET = type(uint256).max >> 16;
    uint256 public constant HARDEST_TARGET = 1;
    BasedCatToken public immutable bcatToken;
    ToshiBuybackRouter public immutable buybackRouter;
    IRenderer public immutable renderer;
    uint256 public immutable mintStartsAt;
    uint256 public currentTarget = EASIEST_TARGET;
    bytes32 public prevWork;
    uint256 public totalMinted;
    uint256 public burnedCount;
    uint256 public accPerCat;
    uint256 public pendingRent;
    uint256 public windowStart;
    uint256 public lastMintAt;
    uint256 public windowMints;
    mapping(uint256 => uint256) public claimedAcc;
    mapping(uint256 => bytes32) public seedOf;
    event Mined(uint256 indexed tokenId, address indexed miner, bytes32 seed);
    event RentRedeemed(uint256 indexed tokenId, address indexed recipient, uint256 amount);
    event Burned(uint256 indexed tokenId, uint256 reward);
    error InvalidWork();
    error InvalidPayment();
    error Unauthorized();
    error MintTooSoon(uint256 availableAt);
    error MintNotOpen(uint256 opensAt);

    constructor(address art, address dex, address weth, address factory, uint256 opensAt) ERC721("CyberToshi", "CTOSHI") {
        require(art.code.length > 0, "Invalid renderer");
        require(opensAt >= block.timestamp, "Opening time is in the past");
        mintStartsAt = opensAt;
        renderer = IRenderer(art);
        bcatToken = new BasedCatToken();
        buybackRouter = new ToshiBuybackRouter(bcatToken, dex, weth, factory);
        bcatToken.setVault(address(buybackRouter));
        prevWork = keccak256(abi.encode(block.chainid, address(this), blockhash(block.number - 1)));
        windowStart = opensAt;
        lastMintAt = opensAt;
    }

    function mintPrice() public view returns (uint256) {
        return MINT_PRICE + PRICE_STEP * (totalMinted < MAX_SUPPLY ? currentEpoch() : (MAX_SUPPLY - 1) / EPOCH_SIZE);
    }

    function currentEpoch() public view returns (uint256) {
        return totalMinted / EPOCH_SIZE;
    }

    function burnReward() public view returns (uint256) {
        uint256 reward = 1000 ether;
        for (uint256 i; i < currentEpoch(); i++) reward = reward * 95 / 100;
        return reward;
    }

    function workHash(address miner, uint256 nonce, bytes32 previous, bytes32 anchor) public view returns (bytes32) {
        return keccak256(abi.encodePacked(block.chainid, address(this), miner, nonce, previous, anchor));
    }

    /// @notice Five-minute grace, then target doubles per completed five-minute recovery step.
    /// First reduction is at ten minutes. No transaction is needed to activate it.
    function effectiveTarget() public view returns (uint256) {
        if (block.timestamp <= lastMintAt) return currentTarget;
        uint256 idle = block.timestamp - lastMintAt;
        if (idle < 10 minutes) return currentTarget;
        uint256 steps = (idle - 5 minutes) / 5 minutes;
        if (steps >= 256 || currentTarget >= (EASIEST_TARGET >> steps)) return EASIEST_TARGET;
        return currentTarget << steps;
    }

    function mine(uint256 nonce, uint256 anchorBlock, bytes32 expectedPrevWork)
        external
        payable
        nonReentrant
        returns (uint256 id)
    {
        if (block.timestamp < mintStartsAt) revert MintNotOpen(mintStartsAt);
        if (totalMinted != 0 && block.timestamp < lastMintAt + MIN_MINT_INTERVAL)
            revert MintTooSoon(lastMintAt + MIN_MINT_INTERVAL);
        uint256 price = mintPrice();
        if (msg.value != price) revert InvalidPayment();
        if (
            totalMinted >= MAX_SUPPLY || expectedPrevWork != prevWork || anchorBlock >= block.number
                || block.number - anchorBlock > 128
        ) revert InvalidWork();
        bytes32 anchor = blockhash(anchorBlock);
        bytes32 work = workHash(msg.sender, nonce, prevWork, anchor);
        uint256 target = effectiveTarget();
        if (anchor == bytes32(0) || uint256(work) >= target) revert InvalidWork();
        uint256 alive = totalSupply();
        uint256 rent = price * 80 / 100;
        pendingRent += rent;
        if (alive != 0) {
            accPerCat += pendingRent * SCALE / alive;
            pendingRent = 0; // Sub-wei rounding dust remains unallocated, never withdrawn.
        }
        id = ++totalMinted;
        claimedAcc[id] = accPerCat;
        // Cosmetic traits are grindable proof-of-work art, not a random-value lottery.
        seedOf[id] = keccak256(abi.encode(work, id));
        prevWork = work;
        if (target > currentTarget) {
            currentTarget = target;
            windowStart = block.timestamp;
            windowMints = 0;
        } else if (++windowMints == 8) {
            uint256 elapsed = block.timestamp - windowStart;
            elapsed = elapsed < 240 ? 240 : elapsed > 960 ? 960 : elapsed;
            currentTarget = Math.mulDiv(currentTarget, elapsed, 480);
            currentTarget = currentTarget < HARDEST_TARGET
                ? HARDEST_TARGET
                : currentTarget > EASIEST_TARGET ? EASIEST_TARGET : currentTarget;
            windowStart = block.timestamp;
            windowMints = 0;
        }
        lastMintAt = block.timestamp;
        (bool sent,) = address(buybackRouter).call{value: price - rent}("");
        require(sent, "Fee transfer failed");
        _safeMint(msg.sender, id);
        emit Mined(id, msg.sender, seedOf[id]);
    }

    function claimableRent(uint256 id) public view returns (uint256) {
        if (_ownerOf(id) == address(0)) return 0;
        return (accPerCat - claimedAcc[id]) / SCALE;
    }

    /// @notice The only rent redemption path: destroy the NFT and receive ETH plus BCAT atomically.
    function burn(uint256 id) external nonReentrant {
        if (ownerOf(id) != msg.sender) revert Unauthorized();
        require(buybackRouter.bootstrapped(), "Community pool not launched");
        uint256 rent = claimableRent(id);
        uint256 reward = burnReward();
        _burn(id);
        delete claimedAcc[id];
        burnedCount++;
        bcatToken.mintReward(msg.sender, reward);
        if (rent != 0) {
            (bool ok,) = msg.sender.call{value: rent}("");
            require(ok, "Rent transfer failed");
        }
        emit RentRedeemed(id, msg.sender, rent);
        emit Burned(id, reward);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return renderer.renderTokenURI(id, seedOf[id]);
    }
}


