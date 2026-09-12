# Verification record — 12 September 2026

## Mainnet deployment — 13 September

The user has signed both deployments. The collection is
`0x333fef2bdbfdc2858a27c23594747e7e2669df42` on Base, opening at 01:00 UTC / 03:00 Madrid.
All four contracts have exact creation/runtime matches on Sourcify; constructor inputs,
contract bindings and pre-opening rejection were independently checked against mainnet.
See [MAINNET-RESULTS.md](MAINNET-RESULTS.md). Public source verification is not an audit;
`release:check` continues to report the independent-review gate as incomplete.

## Scheduled opening — 13 September release candidate

The constructor now takes an immutable `mintStartsAt`. `mine` rejects before that chain
timestamp; there is no owner or function to change it. Difficulty timing begins at
opening, and `effectiveTarget` remains readable before opening without underflow.
Mainnet is scheduled for **2026-09-13 01:00 UTC / 03:00 Europe/Madrid**, recorded in
`launch-config.json`. It has not been deployed by this preparation step.

**22 tests passed, zero failed or skipped**, including the real Aerodrome fork at
Base block **51,231,566**, 256 solvency fuzz cases, pre-opening rejection, acceptance
at the exact opening timestamp, the following 59/60-second mint boundary, and rejection
of a constructor time in the past. Production build and ABI/hash checks passed.
NFT runtime is 8,760 bytes; creation bytecode is 19,247 bytes.

The scheduled version also passed a new live Base Sepolia test, using only the agent
wallet: pre-opening `eth_call` returned `MintNotOpen`, then a real PoW mint succeeded
after the opening timestamp, with no clock manipulation. See
[scheduled-opening-sepolia.json](reports/scheduled-opening-sepolia.json).
This new test covers the added gate. The prior full Sepolia pool/burn/fee/buyback run
below used the preceding four-argument constructor; it was not repeated on the new
collection. The full local protocol and real Aerodrome fork suite was rerun on the new code.
Historical Sepolia scripts and bytecode comparisons belong to commit `145c809`.

The mainnet wallet screen was loaded in a browser and checked for the expected account,
Base 8453, two deployment steps and the fixed opening time. Real mainnet signatures
and post-deployment verification remain separate steps. The independent review remains pending.

## ETH redemption only on NFT burn — current version

20 tests passed, zero failed or skipped, including Aerodrome on Base fork 51,230,708 and 256 solvency fuzz cases. The latest run strengthens the funded buyback cooldown check: rejection at 1,799 seconds and success at exactly 1,800 seconds. Production build previously passed; production contracts and frontend are unchanged by this test update. NFT runtime: 8,622 bytes.

Removed the separate `claimRent` entrypoint and frontend claim button. ETH accumulates with the NFT and is redeemable only when its owner burns it for ETH plus BCAT, after pool launch. Tests cover the removed selector rejecting calls, transfer of accrued ETH with ownership, owner-only redemption, no double burn, and atomic rollback of NFT destruction and token issuance if the ETH recipient rejects payment.

The earlier collection at `0x8f993333ecb294d1508c5627cb9d45d6583a4f0e` allows separate ETH claims and is superseded for launch purposes. The corrected collection at `0x51bc317ba8c99282816199e33391a6e786807871` is deployed on Base Sepolia. The user minted #1 and #2 through the browser; the separate test wallet mined #3 and #4. Live checks validate accrued ETH, early/unauthorized rejection paths, pool bootstrap, combined redemption by burning #3, simulated fee collection and no double credit. The suite and independent verifier completed at 2026-09-12 22:09 UTC: after real observation waits, the buyback spent 0.0002 ETH and burned 10,000 BCAT. User NFTs #1 and #2 remain preserved. See [SEPOLIA-RESULTS.md](SEPOLIA-RESULTS.md) and [the verification report](reports/sepolia-verification.json) for receipts and exact scope. Sepolia uses TestDex; real Aerodrome is covered separately on a local Base fork. No mainnet deployment was performed. The old deployment manifest is preserved. Historical results below refer to previous versions.

## Global mint interval — latest run

19 tests passed, zero failed or skipped, including Aerodrome on Base fork 51,206,150. The contract enforces a minimum of 60 seconds between accepted mints after the first. Tests reject same-timestamp and 59-second attempts across wallets, including after burning all living cats, and accept at exactly 60 seconds.

The exact earliest first-to-last interval is (16,384 - 1) * 60 = 982,980 seconds (11 days, 9 hours, 3 minutes), measured in chain timestamps. This is an issuance-rate bound, not a guarantee of individual access or completion. NFT runtime is 8,861 bytes. Earlier simulation outputs predate the mandatory interval and must not be used as forecasts for this version. Sepolia deployment and wallet testing remain outstanding; no signer is configured in the current execution environment.

## Idle recovery update — latest

18 tests passed, zero failed or skipped, including Aerodrome on Base fork 51,200,183. Recovery boundary checks cover 599/600/900 seconds, the easiest-target cap, persistence after a valid recovered proof, and reset of the eight-mint window. NFT runtime: 8,718 bytes. Production frontend build passes; it reads effectiveTarget and restarts active workers when that target changes. End-to-end external-wallet recovery testing in Sepolia remains outstanding.

Updated seeded simulation: stable-rate median completion 12.54–12.66 days. A 1,000-fold hashrate drop yields median 12.64 days and worst observed global gap 0.932 hours across 100 runs, versus 161 hours in the previous no-recovery model. These results are not guaranteed bounds.

Strategic withholding remains possible: waiting ten minutes halves required expected work; waiting fifteen minutes quarters it, provided nobody else mints. This can save computation for a dominant miner while sacrificing time, and a competing mint resets the idle clock. The random-search simulation does not validate adversarial strategy resistance. Do not claim farm protection or equal outcomes. Difficulty remains flagged for review before mainnet; recovery does not guarantee demand or individual mint times.

The older no-recovery finding below is historical and is superseded by this implementation and its stated limits. No public chain deployment has occurred.

## Latest parameter test run

17 tests passed (16 protocol tests including 256 fuzz cases, plus real Aerodrome integration on Base fork block 51,199,697). The reward now decays 5% per 512 lifetime mints, with equal rewards across rarity tiers. All epoch boundaries through epoch 32 are checked. Fast-window adjustment doubles difficulty; the target window is now 480 seconds for eight mints. The old 24-bit ceiling is removed. Earlier run details below are historical.

`node scripts/simulate-mining.mjs` produces `reports/mining-simulation.json`: 100 seeded trials for each of five scenarios. Stable effective hashrates from 100 kH/s to 10 GH/s yield median completion times around 12.6–12.7 days in this simplified model. A 1,000-fold hashrate drop halfway produces a median of 23.5 days and individual global gaps up to 161 hours across these trials. These are modeled outcomes, not hardware measurements or forecasts. No wallet latency, stale work, demand or transaction contention is modeled.

**Open finding:** the retarget only changes after eight accepted mints, so abrupt hashrate loss can stall mining. Difficulty parameters remain unapproved for mainnet until recovery is designed and tested. No Sepolia deployment or external-wallet test was performed in this run. Public website remains pre-launch.

The final source is verified locally, not deployed to a public network. The original prototype has not been changed.

## Completed

- Progressive price implemented: 0.001 ETH + 0.0001 ETH per 512 lifetime mints. Boundary tests cover exact payment, rejection of under/overpayment, the 80/20 split and the final mint. The browser binds the displayed payment to the proof's challenge.
- Production build verified at a nested IPFS-style local URL: relative assets, deployment configuration, CPU and GPU proofs and explicit mint price passed. This is a path compatibility test, not an upload or gateway availability test.
- `release:check` correctly rejects the current local configuration and records pending economic decisions and public-wallet/review work. See GUIA-LANZAMIENTO.md for the launch procedure.

- Community LP is now held permanently by the vault. A new permissionless fee-collection test checks direct BCAT burn, WETH unwrap, unchanged LP balance, zero LP allowance, no caller payout, repeat-claim behavior and minting after a failed fee claim. The Base fork generates real fees with a buy and sell, collects both assets and then executes the existing buyback. Trading fees support burns and buybacks; mint rent remains unchanged.

- `npm test` with `BASE_FORK_RPC=https://mainnet.base.org`: **15 passed, 0 failed, 0 skipped**. Fourteen protocol tests include 256 fuzz runs checking rent solvency. The fork test executes bootstrap, historical price sampling and buyback/burn against real deployed Aerodrome bytecode in a local Base fork. Final recorded fork block: **51,193,147**.
- Real genesis proof search with a bounded 2,000,000-nonce space finds and submits a valid witness. Chain/collection/address domain separation, stale work, anchor age and exact payment are checked.
- Community funding after 100 mints, atomic failed-bootstrap recovery, continued mining after DEX failure, LP destination, burn gating, unauthorized issuance, ownership transfers, safe receiver checks, zero-address rejection, rent claims and epoch rewards are checked in the EVM.
- Seven full-width nonce vectors confirm the browser's byte encoding matches the Solidity packed preimage. Nonces include byte boundaries and the maximum uint256.
- Contract runtime sizes: NFT **8,388 bytes**, renderer **14,914**, vault **5,113**, token **2,575**. All runtime and creation-code sizes pass applicable size checks.
- `npm run build` succeeds. Dependencies are locked; installation reported zero npm audit vulnerabilities at installation time.
- Playwright exercised one CPU and one WebGPU mint against the production NFT contract deployed on Anvil, claimed rent, launched the test community pool and burned a cat. The local DEX is explicitly a simulator. A test donation accelerated this browser test; the 100-mint funding path is covered separately in Solidity.
- WebGPU produced 272 digests matching CPU Keccak, including a 32-bit nonce rollover and a nonzero high nonce prefix, in addition to its startup self-tests. Both worker bundles are included in the production build.
- Injecting unavailable WebGPU inside the GPU worker triggered automatic CPU fallback. The CPU found a valid proof, which was discarded without a transaction. This checks the fallback path, not all possible GPU driver failures.
- Seven accessory variants were rendered directly from the deployed renderer and visually inspected. Short ears remain visible with the hat and halo.
- Desktop (1280 px) and mobile (390 px) screenshots were captured, with no horizontal overflow or browser page exceptions in the checked flow. Images come from the deployed renderer.
- `scripts/record-validation.mjs` verifies the local deployment transactions contain the final compiled creation bytecode, checks supply/burn/pool state and decodes metadata for every local living cat.

## Evidence

- Latest contract run: 15 passed, 0 failed, 0 skipped; recorded in this task's tool output. Older `output/contract-tests.txt` predates fee collection.
- `output/validation.json`: local state and SHA-256 hashes of contract source files.
- `output/playwright/desktop.png` and `mobile.png`: browser captures.
- `deployments/31337.json`: local deployment transaction receipts and addresses.

## Boundaries

This is not an independent security audit. The fork test covers the direct volatile Aerodrome route and basic oracle lifecycle, not every market manipulation or MEV scenario. Sustained manipulation of shallow liquidity remains possible. Browser checks use a local unlocked account, not every external wallet or mobile webview. WebGPU is experimental and has not been benchmarked across devices. Gas sponsorship, passkeys and public hosting are not implemented or claimed.

Before public participation, complete Sepolia wallet testing, an independent review and explorer verification. Sepolia uses test ETH and the labelled TestDex; Aerodrome compatibility is tested on the Base fork. No real ETH has been spent in these checks.



