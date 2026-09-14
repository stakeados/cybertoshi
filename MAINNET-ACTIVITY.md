# CyberToshi — live pool, redemption and trading checks

Verified on Base mainnet, 14 September 2026, at block **51,278,082**.
This records actual transactions after the scheduled launch. It is not a security audit
and does not mean every possible failure condition has been tested.

The [machine-readable report](reports/mainnet-activity.json) contains receipts,
events, block numbers, exact base-unit amounts and the pool snapshot.
Reproduce a fresh check with `node scripts/verify-mainnet-activity.mjs`.

## Confirmed activity

| Operation | Transaction | Observed result |
| --- | --- | --- |
| Create community pool | [Receipt](https://basescan.org/tx/0x579c65a0f36a8564d7947ffbe9d9c8f6850ebf763ee80e9874c63686538aaa51) | 0.02 ETH + 1,000,000 BCAT; LP minted to the community vault. |
| Burn cat #10 | [Receipt](https://basescan.org/tx/0x0a42d05475f48d19ffefb2075c2e07c035038c23395c774aa53083efb7f1087c) | NFT burned, 1,000 BCAT issued; accumulated ETH was zero. |
| Burn cat #9 | [Receipt](https://basescan.org/tx/0x8f42d20e5921112fe93533cfd8ce4c6d6e9539a0a5e80545a17581c68b313e83) | NFT burned, 1,000 BCAT issued, RentRedeemed records 0.000088888888888888 ETH. |
| Burn cat #8 | [Receipt](https://basescan.org/tx/0xd5e0ec49d6c9102fefeb5e112f54b7b90c92fa17bfc32f6eb3a2b33c9319f3dc) | NFT burned, 1,000 BCAT issued, RentRedeemed records 0.000188888888888888 ETH. |
| Buy BCAT | [Receipt](https://basescan.org/tx/0x1cbf4750d276aac1dae0495d947183799e1178e7897947e0da638677b2c0c084) | Pool Swap records 0.002 WETH in and 90,661.089388014913158134 BCAT out. |
| Sell BCAT | [Receipt](https://basescan.org/tx/0xf7323fe97d6b0862600be024296cb21c28688c8a54053deead71f67b22f713a7) | Pool Swap records 3,661.089388014913158134 BCAT in and 0.000087931434583270 WETH out. |
| Collect pool fees | [Receipt](https://basescan.org/tx/0x04111e99775c9efe486c0b23e4b004446eb20a7fd9b75957a24b5d7359247cf1) | 10.983268164044739318 BCAT burned; 0.000005999999999972 ETH collected from WETH fees. |

All listed receipts succeeded. Swap figures describe pool events, not an estimate of
the user's net wallet change after gas or other router actions.

## Reconciliation and current snapshot

- Pool: [0xF4bdcd404761Dc2B36B443cc0A5b5a71d47Da721](https://basescan.org/address/0xF4bdcd404761Dc2B36B443cc0A5b5a71d47Da721).
- Three NFT burns generated 3,000 BCAT in addition to the 1,000,000 BCAT pool reserve.
- Subtracting the 10.983268164044739318 BCAT burn gives current supply
  **1,002,989.016731835955260682 BCAT**; ERC-20 mint/burn events reconcile with totalSupply.
- The vault's fee counters match its collected-fee events.
- The original LP amount remains in the vault. It owns more than 99.99% of the pool's
  LP supply; the tiny remainder is the pool's minimum liquidity, not a creator allocation.
- Reserves: **0.021906068565416730 WETH** and **912,989.016731835955260526 BCAT**.
- Indicative reserve-ratio price: about **0.000000023993792 ETH per BCAT**.
  This is a historical spot value, not an executable quote or a valuation guarantee.

## Still distinct from these checks

**No Buyback event was present at the snapshot block.** Direct fee burns are confirmed;
an ETH-funded buyback is not claimed as executed on mainnet. It still requires funds,
cooldown and sufficient fresh historical price observations.

ETH redemptions are verified from successful receipts and contract events; this report
does not use execution traces to calculate the recipient's net ETH balance change.
It does not verify a permanent IPFS archive or an independent security review.

## Website changes

The community market now reads onchain pool reserves, spot price in ETH, BCAT supply,
NFT burn count, direct fee burns, buyback burns and ETH collected from fees. Reads for
each market snapshot use one block number. The page shows that block and the refresh
time, refreshes every minute while visible, and labels stale data if a read fails.

Buy/sell buttons open Aerodrome with the BCAT/WETH pair on Base; quotes and signatures
remain there. No approvals, trades or paid transactions are triggered by viewing these
statistics. External trades do not inherit the CyberToshi frontend's Builder Code.

Validation: production build, existing client and Builder Code checks, market reserve
ordering/empty-pool/link tests, real RPC reads, and desktop/mobile browser inspection.
