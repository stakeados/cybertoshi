# CyberToshi community experiment

A working onchain NFT / ERC-20 experiment targeting Base. The interface and documentation are in English. The original prototype remains untouched in its original folder; this directory is the corrected implementation.

## Economic rules

| Rule | Implementation |
| --- | --- |
| Mint fee | 0.001 ETH + 0.0001 ETH per 512 lifetime mints; last epoch 0.0041 ETH, plus gas |
| Maximum issuance | 16,384 cats, lifetime cap; burning does not reopen slots |
| Rent allocation | 80% to prior living cats; claimed ETH travels with its owner, unclaimed rent travels with the NFT |
| Empty collection | The rent allocation waits for a future mint with a prior living holder |
| Community allocation | 20% accumulates in an immutable vault |
| Launch threshold | 0.02 ETH: 100 ordinary mints; voluntary donations can accelerate it |
| Initial BCAT supply | Zero |
| Pool reserve | Exactly 1,000,000 BCAT issued once, atomically with initial liquidity |
| LP ownership | Permanently held by the immutable community vault; no LP approval, transfer or withdrawal function |
| Burn reward | 1,000 BCAT reduced by 5% per epoch, rounded down in base units at each step, in base units, at burn time |
| Burn availability | After the community pool launches |
| Creator allocation | None; no admin withdrawal, mint override, renderer replacement or DEX replacement |
| Buybacks | At most 0.0002 ETH per call, 30-minute cooldown, minimum output 97% of a two-interval Aerodrome historical quote |

The creator pays deployment gas. Miners pay their mints and gas; whoever launches liquidity, updates observations or runs a buyback pays that transaction's gas. The fee accumulation is automatic, but maintenance requires a transaction from any participant. No private operator is needed. The website exposes these actions when eligible.

No new mint activity means no new rent from mints. The token has no guaranteed value. Buybacks spend existing fees and do not guarantee appreciation. The 80% / 20% split provides no creator revenue or maintenance budget. Fees are not refundable if the threshold is never reached.

Anyone can call `collectPoolFees()` after launch. It claims the vault's share of Aerodrome trading fees: received BCAT is burned immediately, and received WETH is unwrapped into ETH for the existing bounded buybacks. The caller pays gas and receives nothing. Collection does not withdraw pool reserves, approve LP spending or alter the buyback cooldown. Fee collection is separate from minting and buybacks, so a failed claim cannot block those operations. This uses Aerodrome's [claimFees implementation](https://github.com/aerodrome-finance/contracts/blob/main/contracts/Pool.sol). Other liquidity providers retain their own fee shares.

## Mining and art

The browser performs real Keccak256 in 1–4 CPU workers by default. An optional experimental WebGPU engine computes the same two-block Ethereum Keccak digest with paired 32-bit shader lanes. It checks boundary vectors before starting, checks one digest in every batch and verifies every winning proof on the CPU. Initialization failure, device loss, verification failure or 20 seconds without a response switches mining to CPU. GPU speed varies by device; no speed advantage is promised. Workers stop on a solution and pause when the tab is hidden. The frontend checks stale work and simulates the transaction before requesting a wallet signature. No automatic paid mint occurs.

The interface uses three steps: connect, mine a proof, then mint. A found proof can be discarded without a transaction. The immutable SVG renderer uses short stepped ears, a wider muzzle, whiskers, a tail and seven accessory variants. Run `node scripts/art-preview.mjs` against a local deployment to inspect all accessories and regenerate the example SVG.

The exact preimage is `abi.encodePacked(uint256(chainId), collection, miner, uint256(nonce), previousWork, anchorBlockHash)`. A hash strictly below the target is valid. Both the chain and collection address provide domain separation. Anchors must be earlier than the current block and no more than 128 blocks old. Another accepted mint invalidates previous work. A solution reserves nothing and can expire before confirmation.

Difficulty retargets every 8 mints toward 60 seconds per mint, with a maximum 2x adjustment, a 16-bit starting floor and no practical upper difficulty cap (target minimum 1). Recovery after a hashrate drop still requires eight mints; simulation shows potentially long stalls. This parameter set is for testing, not approved for mainnet. This is not protection against professional miners or GPU implementations.

Rarity uses a 256-bit rejection sampler: Common 60%, Rare 25%, Epic 12%, Legendary 3%. Accessories follow tier-specific choices: coffee / simple eyes for Common, fiber cable / VR for Rare, laser eyes / Degen hat for Epic, golden fur / Ether halo for Legendary. Seed-derived constellations and fur markings add variation. A visible 15-bit serial distinguishes every issued cat within the cap. Legendary does not mean one-of-one. Art and JSON are generated by the immutable renderer, without IPFS.

Proof-derived traits can be selected by doing more work. There is no fair-randomness or guaranteed rarity-distribution claim. Traits do not affect rent or burn rewards. This avoids pretending that hashing a timestamp is unbiased randomness.

## Development

Requirements: Node.js 22.12+ and Foundry (`forge`, `anvil`) on PATH.

```sh
npm ci
forge test --summary
npm run abi
npm test
npm run build
npm run dev
```

The Solidity tests exercise the deployed bytecode in an EVM. `npm test` runs Foundry, exports compiled ABIs and checks browser hash vectors and contract size limits. `npm run test:client` runs only the latter checks against existing artifacts. Regenerate ABI files after a Solidity interface change.

### Local deployment

```sh
anvil --host 127.0.0.1 --port 8545 --silent
node scripts/deploy.mjs --network local --broadcast
npm run dev
```

The local network uses an explicitly labelled `TestDex` simulator. It is not a real market and has no price discovery. The deployer uses an unlocked local account; no production private key is required. To repeat against a reset local chain, archive `deployments/31337.json` first. Deployment manifests are resumable and are not overwritten when onchain code is missing.

The deployment writes `frontend/public/deployment.json`. Its addresses are checked against the collection at startup. Never publish a local configuration as a production deployment. The UI disables mining when no valid deployment is configured. On loopback only, with chain ID 31337, “Use local test wallet” uses an unlocked local account. Public networks always require an external wallet. No test private key is embedded in the frontend. `--fresh-local` archives the current local deployment manifest and deploys a new instance without resetting the chain.

### Base Sepolia

`node scripts/deploy.mjs --network base-sepolia` displays a review plan without broadcasting. To deploy, set `DEPLOYER_PRIVATE_KEY` in your own terminal and add `--broadcast`. Do not put keys into a chat, a committed file or the browser. `RPC_URL` can override the RPC; the chain ID is verified.

Sepolia deploys the restricted `TestDex` too, clearly labelled in the UI. That checks mint, claim, burn and treasury interactions with test ETH. It does not pretend to be an Aerodrome deployment on Sepolia. The `TestDex` constructor rejects Base mainnet and should never be used as production infrastructure.

### Real Aerodrome integration test

Set `BASE_FORK_RPC=https://mainnet.base.org` and run `forge test --match-contract AerodromeForkTest -vv`. Without this variable the fork test is explicitly skipped. It creates a local copy of Base state and tests the actual deployed Aerodrome router, factory and pool implementation. It sends no transactions to Base.

The production addresses come from [Aerodrome's deployment table](https://github.com/aerodrome-finance/contracts#deployment):

- Router: `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
- Factory: `0x420DD381b31aEf6683db6B902084cB0FFECe40Da`
- WETH: `0x4200000000000000000000000000000000000006`

The old prototype used an incorrect router address.

### Base mainnet preparation

`node scripts/deploy.mjs --network base` is review-only. Broadcasting requires both `--broadcast` and `--ack-mainnet`, plus a funded deployer. Verify the compiler output and DEX addresses, run the fork tests, review the economic rules and complete an independent security review before funding production use. The script checks network IDs, checks DEX bytecode exists, records receipts and wires the website to actual deployed addresses. It does not estimate an invented fixed dollar deployment cost.

After a public deployment, run `npm run build` again with its deployment configuration and serve `dist/` over HTTPS. Source verification on the explorer and publication of the website remain release tasks; no public-network deployment or public hosting was performed during local development.

## Security boundaries and remaining risks

- Standard NFT and token accounting uses pinned OpenZeppelin contracts. Economic entrypoints have reentrancy guards. Only NFT owners can claim or burn; market approvals do not authorize burning.
- A failed pool launch reverts the reserve issuance as well. Mint fee reception does not call the DEX, so failed maintenance cannot block minting.
- Buybacks need at least four pool observations; the last two completed intervals exclude the empty initial interval. The latest observation must be no older than one hour. Anyone can call `checkpoint`; on Aerodrome a new sample needs more than 30 minutes. New pools need roughly 90 minutes of observations before the first buyback.
- A TWAP and a bounded swap size reduce some price-execution risks. They do not eliminate sustained manipulation of a shallow pool or all MEV. 0.02 ETH is deliberately small initial liquidity.
- No admin can fix an immutable deployed protocol. Review before deployment; serious post-deployment bugs would require a new deployment.
- Rent uses fixed-point accounting. Fractions below one wei are not paid; small rounding residues remain in the collection and cannot be withdrawn by a creator.
- Public RPC availability, wallet support, indexer listing and marketplace rendering are external dependencies. Instant listing is not guaranteed.
- This is an independent project, not affiliated with Base, Coinbase or Toshi. No profit or “rug-proof” claim is made.

See `VALIDATION.md` for recorded verification. These tests are not an independent audit.


