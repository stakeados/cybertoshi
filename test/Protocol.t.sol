// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {CyberToshiNFT} from "../contracts/CyberToshiNFT.sol";
import {CyberToshiRenderer} from "../contracts/CyberToshiRenderer.sol";
import {BasedCatToken} from "../contracts/BasedCatToken.sol";
import {ToshiBuybackRouter} from "../contracts/ToshiBuybackRouter.sol";
import {TestDex} from "../contracts/TestDex.sol";

interface Vm {
    function deal(address, uint256) external;
    function prank(address) external;
    function roll(uint256) external;
    function warp(uint256) external;
    function setBlockhash(uint256, bytes32) external;
    function expectRevert() external;
    function chainId(uint256) external;
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
}

contract Harness is CyberToshiNFT {
    constructor(address a, address d, address w, address f) CyberToshiNFT(a, d, w, f) {}

    function easy() external {
        currentTarget = type(uint256).max;
    }

    function setMintCount(uint256 count) external {
        totalMinted = count;
    }
    function setTarget(uint256 target) external { currentTarget = target; }
    function setWindow(uint256 count) external { windowMints = count; }
}

contract RejectNFT {}

contract ProtocolTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Harness nft;
    CyberToshiRenderer art;
    TestDex dex;
    BasedCatToken token;
    ToshiBuybackRouter vault;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    receive() external payable {}

    function setUp() public {
        vm.chainId(31337);
        vm.roll(100);
        vm.warp(10000);
        vm.setBlockhash(99, bytes32(uint256(1234)));
        art = new CyberToshiRenderer();
        dex = new TestDex();
        nft = new Harness(address(art), address(dex), address(dex), address(dex));
        token = nft.bcatToken();
        vault = nft.buybackRouter();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(address(this), 10 ether);
    }

    function mint(address who) internal returns (uint256) {
        if(nft.totalMinted()!=0 && block.timestamp<nft.lastMintAt()+60) vm.warp(nft.lastMintAt()+60);
        nft.easy();
        bytes32 previous = nft.prevWork();
        vm.prank(who);
        return nft.mine{value: 0.001 ether}(0, 99, previous);
    }

    function bootstrap() internal {
        (bool ok,) = address(vault).call{value: 0.02 ether}("");
        require(ok);
        vault.bootstrapCommunityLiquidity();
    }

    function testRealPowAndDomainSeparation() public {
        bytes32 previous = nft.prevWork();
        bytes32 anchor = bytes32(uint256(1234));
        uint256 nonce;
        // Expected 65,536 trials at the production genesis target; bounded at 2M.
        while (uint256(nft.workHash(alice, nonce, previous, anchor)) >= nft.currentTarget() && nonce < 2_000_000) nonce++;
        require(nonce < 2_000_000, "No witness");
        require(nft.workHash(alice, nonce, previous, anchor) != nft.workHash(bob, nonce, previous, anchor));
        vm.prank(alice);
        nft.mine{value: 0.001 ether}(nonce, 99, previous);
        require(nft.ownerOf(1) == alice);
        vm.expectRevert();
        vm.prank(alice);
        nft.mine{value: 0.001 ether}(nonce, 99, previous);
    }

    function testExactFeeAndStaleAnchor() public {
        bytes32 previous = nft.prevWork();
        vm.expectRevert();
        vm.prank(alice);
        nft.mine{value: 0.002 ether}(0, 99, previous);
        vm.expectRevert();
        vm.prank(alice);
        nft.mine{value: 0.001 ether}(0, 100, previous);
        vm.roll(300);
        vm.expectRevert();
        vm.prank(alice);
        nft.mine{value: 0.001 ether}(0, 99, previous);
    }

    function test100MintsCommunityLaunchAndBurn() public {
        require(token.totalSupply() == 0);
        for (uint256 i; i < 100; i++) {
            mint(alice);
        }
        require(address(vault).balance == 0.02 ether);
        require(!vault.bootstrapped());
        vault.bootstrapCommunityLiquidity();
        require(token.totalSupply() == 1_000_000 ether);
        require(dex.balanceOf(address(vault)) == 1 ether);
        uint256 rent = nft.claimableRent(1);
        uint256 before = alice.balance;
        vm.prank(alice);
        nft.burn(1);
        require(token.balanceOf(alice) == 1000 ether && alice.balance == before + rent);
        require(nft.totalSupply() == 99 && nft.burnedCount() == 1);
        vm.expectRevert();
        vault.bootstrapCommunityLiquidity();
    }

    function testBootstrapFailureAtomicAndMintContinues() public {
        (bool ok,) = address(vault).call{value: 0.02 ether}("");
        require(ok);
        dex.setFail(true);
        vm.expectRevert();
        vault.bootstrapCommunityLiquidity();
        require(!token.bootstrapped() && !vault.bootstrapped() && token.totalSupply() == 0);
        require(address(vault).balance == 0.02 ether);
        mint(alice);
        dex.setFail(false);
        vault.bootstrapCommunityLiquidity();
        require(vault.bootstrapped());
    }

    function testRentFollowsNFTAndOnlyRedeemsOnBurn() public {
        mint(alice);
        mint(bob);
        require(nft.claimableRent(1) == 0.0016 ether && nft.claimableRent(2) == 0);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        vm.expectRevert();
        vm.prank(alice);
        nft.burn(1);
        // Even the owner cannot withdraw ETH through the removed selector.
        uint256 held = bob.balance;
        vm.prank(bob);
        (bool claimed,) = address(nft).call(abi.encodeWithSignature("claimRent(uint256)", 1));
        require(!claimed && bob.balance == held && nft.ownerOf(1) == bob);
        vm.expectRevert();
        vm.prank(bob);
        nft.burn(1);
        (bool funded,) = address(vault).call{value: 0.02 ether}("");
        require(funded);
        vault.bootstrapCommunityLiquidity();
        uint256 before = bob.balance;
        vm.prank(bob);
        nft.burn(1);
        vm.expectRevert();
        vm.prank(bob);
        nft.burn(1);
        require(bob.balance == before + 0.0016 ether && nft.claimableRent(1) == 0);
        require(token.balanceOf(bob) == 1000 ether && nft.totalSupply() == 1);
    }

    function testBurnRevertsAtomicallyIfOwnerRejectsETH() public {
        mint(alice);
        mint(bob);
        bootstrap();
        RejectNFT reject = new RejectNFT();
        vm.prank(alice);
        nft.transferFrom(alice, address(reject), 1);
        uint256 ethBefore = address(nft).balance;
        uint256 supplyBefore = token.totalSupply();
        vm.expectRevert();
        vm.prank(address(reject));
        nft.burn(1);
        require(nft.ownerOf(1) == address(reject) && nft.burnedCount() == 0);
        require(nft.claimableRent(1) == 0.0016 ether && address(nft).balance == ethBefore);
        require(token.totalSupply() == supplyBefore && token.balanceOf(address(reject)) == 0);
    }

    function testSafeTransfersAndZeroAddress() public {
        mint(alice);
        RejectNFT reject = new RejectNFT();
        vm.expectRevert();
        vm.prank(alice);
        nft.safeTransferFrom(alice, address(reject), 1);
        vm.expectRevert();
        vm.prank(alice);
        nft.transferFrom(alice, address(0), 1);
        require(nft.supportsInterface(0x80ac58cd) && nft.supportsInterface(0x01ffc9a7));
    }

    function testBurnBeforeLaunchAndUnauthorizedIssuance() public {
        mint(alice);
        vm.expectRevert();
        vm.prank(alice);
        nft.burn(1);
        vm.expectRevert();
        token.mintReward(alice, 1 ether);
        vm.expectRevert();
        token.bootstrap();
        vm.expectRevert();
        token.setVault(alice);
    }

    function testBuybackOracleCooldownAndSlippage() public {
        bootstrap();
        mint(alice);
        vm.expectRevert();
        vault.executeBuyback();
        for (uint256 i; i < 3; i++) {
            vm.warp(10000 + (i + 1) * 1801);
            vault.checkpoint();
        }
        dex.setOutputBps(9000);
        vm.expectRevert();
        vault.executeBuyback();
        require(vault.totalBcatBurned() == 0);
        dex.setOutputBps(10000);
        uint256 supply = token.totalSupply();
        vault.executeBuyback();
        require(dex.lastMinimum() > 0 && token.totalSupply() < supply);
        require(vault.totalBcatBurned() == 10000 ether);
        // Keep funds and a fresh oracle available so only the cooldown blocks execution.
        (bool funded,) = address(vault).call{value: 0.0002 ether}("");
        require(funded);
        uint256 firstBuybackAt = vault.lastBuyback();
        vm.expectRevert();
        vault.executeBuyback();
        vm.warp(firstBuybackAt + 1799);
        vm.expectRevert();
        vault.executeBuyback();
        require(vault.lastBuyback() == firstBuybackAt && vault.totalBcatBurned() == 10000 ether);
        vm.warp(firstBuybackAt + 1800);
        vault.executeBuyback();
        require(vault.lastBuyback() == firstBuybackAt + 1800 && vault.totalBcatBurned() == 20000 ether);
    }

    function testPoolFeesPermissionlessBurnAndNoDoubleClaim() public {
        vm.expectRevert();
        vault.collectPoolFees();
        bootstrap();
        mint(alice);
        vm.prank(alice);
        nft.burn(1);
        vm.prank(alice);
        token.approve(address(dex), 100 ether);
        vm.prank(alice);
        dex.fundFees{value: 0.001 ether}(address(vault), 100 ether);
        uint256 supply = token.totalSupply();
        uint256 ethBefore = address(vault).balance;
        uint256 callerBefore = bob.balance;
        vm.prank(bob);
        vault.collectPoolFees();
        require(token.totalSupply() == supply - 100 ether);
        require(vault.totalFeeBcatBurned() == 100 ether && vault.totalBcatBurned() == 100 ether);
        require(vault.totalFeeEthCollected() == 0.001 ether);
        require(address(vault).balance == ethBefore + 0.001 ether && bob.balance == callerBefore);
        require(dex.balanceOf(address(vault)) == 1 ether);
        require(dex.allowance(address(vault), address(dex)) == 0);
        vault.collectPoolFees();
        require(vault.totalFeeBcatBurned() == 100 ether && vault.totalFeeEthCollected() == 0.001 ether);
        dex.setFail(true);
        vm.expectRevert();
        vault.collectPoolFees();
        mint(bob);
        require(dex.balanceOf(address(vault)) == 1 ether);
    }

    function testPriceEpochBoundaryAndSplit() public {
        mint(alice);
        nft.setMintCount(511);
        require(nft.mintPrice() == 0.001 ether);
        mint(bob);
        require(nft.totalMinted() == 512 && nft.mintPrice() == 0.0011 ether);
        vm.warp(nft.lastMintAt()+60);
        bytes32 previous = nft.prevWork();
        vm.expectRevert();
        vm.prank(bob);
        nft.mine{value: 0.001 ether}(0, 99, previous);
        vm.expectRevert();
        vm.prank(bob);
        nft.mine{value: 0.0012 ether}(0, 99, previous);
        uint256 rentBefore = nft.claimableRent(1);
        uint256 vaultBefore = address(vault).balance;
        nft.easy();
        vm.prank(bob);
        nft.mine{value: 0.0011 ether}(0, 99, previous);
        require(nft.claimableRent(1) - rentBefore == 0.00044 ether);
        require(address(vault).balance - vaultBefore == 0.00022 ether);
        vm.warp(nft.lastMintAt()+60);
        nft.setMintCount(16383);
        require(nft.mintPrice() == 0.0041 ether);
        nft.easy();
        previous = nft.prevWork();
        vm.prank(bob);
        nft.mine{value: 0.0041 ether}(0, 99, previous);
        require(nft.mintPrice() == 0.0041 ether && nft.totalMinted() == 16384);
        previous = nft.prevWork();
        vm.expectRevert();
        vm.prank(bob);
        nft.mine{value: 0.0041 ether}(0, 99, previous);
    }

    function testFastMintWindowDoublesDifficulty() public {
        nft.setMintCount(7); nft.setWindow(7);
        vm.warp(10480);
        mint(alice);
        require(nft.currentTarget() == nft.EASIEST_TARGET());
        nft.setMintCount(15); nft.setWindow(7);


        vm.warp(10540);
        bytes32 previous = nft.prevWork();


        require(nft.HARDEST_TARGET() == 1);
        nft.setTarget(nft.EASIEST_TARGET());
        uint256 nonce;
        while(uint256(nft.workHash(alice, nonce, previous, bytes32(uint256(1234)))) >= nft.currentTarget()) nonce++;
        vm.prank(alice);
        nft.mine{value: 0.001 ether}(nonce,99,previous);
        require(nft.currentTarget() == nft.EASIEST_TARGET()/2);
    }

    function testIdleRecoveryBoundariesAndPersistence() public {
        uint256 target = nft.EASIEST_TARGET()/4;
        nft.setTarget(target);
        vm.warp(10599);
        require(nft.effectiveTarget() == target);
        vm.warp(10600);
        require(nft.effectiveTarget() == target*2);
        vm.warp(10900);
        require(nft.effectiveTarget() == nft.EASIEST_TARGET());
        bytes32 previous = nft.prevWork(); uint256 nonce;
        while(uint256(nft.workHash(alice,nonce,previous,bytes32(uint256(1234)))) >= nft.effectiveTarget()) nonce++;
        vm.prank(alice);
        nft.mine{value:0.001 ether}(nonce,99,previous);
        require(nft.currentTarget() == nft.EASIEST_TARGET());
        require(nft.lastMintAt()==10900 && nft.windowMints()==0 && nft.windowStart()==10900);
        vm.warp(1_000_000);
        require(nft.effectiveTarget()==nft.EASIEST_TARGET());
    }

    function testGlobalIntervalAcrossWalletsAndAfterBurn() public {
        mint(alice);
        bytes32 previous = nft.prevWork();
        uint256 at = nft.lastMintAt();
        nft.easy();
        vm.expectRevert(); vm.prank(bob);
        nft.mine{value:0.001 ether}(0,99,previous);
        vm.warp(at+59);
        vm.expectRevert(); vm.prank(alice);
        nft.mine{value:0.001 ether}(0,99,previous);
        bootstrap();
        vm.prank(alice); nft.burn(1);
        require(nft.totalSupply()==0);
        vm.expectRevert(); vm.prank(bob);
        nft.mine{value:0.001 ether}(0,99,previous);
        vm.warp(at+60);
        vm.prank(bob); nft.mine{value:0.001 ether}(0,99,previous);
        require(nft.totalMinted()==2 && nft.lastMintAt()==at+60);
        previous=nft.prevWork();
        vm.expectRevert(); vm.prank(alice);
        nft.mine{value:0.001 ether}(0,99,previous);
    }

    function testRewardAcrossAllEpochs() public {
        uint256 expected = 1000 ether;
        for(uint256 epoch; epoch <= 32; epoch++) {
            nft.setMintCount(epoch*512);
            require(nft.burnReward() == expected);
            if(epoch<32){nft.setMintCount(epoch*512+511);require(nft.burnReward()==expected);}
            expected = expected*95/100;
        }
    }

    function testFivePercentDecayAndSupplyCap() public {
        nft.setMintCount(511);
        require(nft.burnReward() == 1000 ether);
        nft.setMintCount(512);
        require(nft.burnReward() == 950 ether);
        nft.setMintCount(1024);
        require(nft.burnReward() == 902.5 ether);
        nft.setMintCount(16384);
        bytes32 previous = nft.prevWork();
        vm.expectRevert();
        vm.prank(alice);
        nft.mine{value: 0.001 ether}(0, 99, previous);
    }

    function testRarityWeightsAndUniqueSerial() public view {
        uint256[4] memory counts;
        for (uint256 i; i < 100; i++) {
            counts[art.tierForRoll(i)]++;
        }
        require(counts[0] == 60 && counts[1] == 25 && counts[2] == 12 && counts[3] == 3);
        require(keccak256(bytes(art.renderSVG(1, bytes32(0)))) != keccak256(bytes(art.renderSVG(2, bytes32(0)))));
    }

    function testCheckpointDoesNotResetObservationClock() public {
        bootstrap();
        vm.warp(10500);
        vault.checkpoint();
        require(dex.observationLength() == 1);
        vm.warp(11801);
        vault.checkpoint();
        require(dex.observationLength() == 2);
    }

    function testFuzzRentSolvent(uint8 n) public {
        uint256 count = uint256(n) % 30 + 2;
        for (uint256 i; i < count; i++) {
            mint(i % 2 == 0 ? alice : bob);
        }
        (bool funded,) = address(vault).call{value: 0.02 ether}("");
        require(funded);
        vault.bootstrapCommunityLiquidity();
        uint256 sum;
        for (uint256 id = 1; id <= count; id++) {
            sum += nft.claimableRent(id);
            address who = nft.ownerOf(id);
            vm.prank(who);
            nft.burn(id);
        }
        require(sum <= count * 0.0008 ether && address(nft).balance == count * 0.0008 ether - sum);
    }
}





