# CyberToshi — Base mainnet deployment

Network: **Base 8453**. Opening: **13 September 2026, 01:00 UTC / 03:00 CEST Madrid**.
The opening timestamp is immutable: **1789261200**.

| Contract | Address |
| --- | --- |
| NFT collection | `0x333fef2bdbfdc2858a27c23594747e7e2669df42` |
| Renderer | `0xbAbc7A964e7a744DcF676636B3c23089389c9E0C` |
| BCAT | `0xbc384D49529AEb3B20B270586457F9Ba57e514e3` |
| Community vault | `0x69a16aD3eaF02b4A39342CfD6609F962636E619d` |

The user's wallet deployed the [renderer](https://basescan.org/tx/0xaeefa520b0852861f308390826a39ebe3c7fbaae0d87b54174d2daca8d774e30)
and the [collection, which created BCAT and the vault](https://basescan.org/tx/0x8409b8e703b2a90a276d565bcf0430d5fb6620e858d3cd88ab485d317973f092).
Both transactions succeeded. Each sent zero ETH as transaction value and paid deployment gas.

## Verification

`node scripts/verify-mainnet.mjs` independently reads the transactions, compares their
complete inputs with the compiled creation bytecode and constructor arguments, checks
the account, addresses, contract bindings, supply cap, 60-second interval and opening time.
At block 51,232,299, before opening, lifetime mints were zero and a simulated early call
returned `MintNotOpen`. No paid mainnet test mint was sent.

All four contracts have **exact creation and runtime matches on Sourcify**. The
[public verification report](reports/mainnet-verification.json) contains the job URLs
and results. Sourcify's automatic Etherscan forwarding reported a daily submission
limit; this report does **not** assert that BaseScan's source-verification badge is present.

The initial local receipt errors came from public RPC rate limiting after the successful
deployment. The receipts were recovered without repeating either transaction. The
wallet helper now persists successful receipts before reading bindings and uses batched
requests with a fallback RPC. Reloading can finish verification without another signature.

## Scope

22 local tests passed on this scheduled version, including an actual Aerodrome Base fork.
The opening gate was additionally tested in live Sepolia. See [VALIDATION.md](VALIDATION.md)
and [SEPOLIA-RESULTS.md](SEPOLIA-RESULTS.md) for the distinction between the earlier complete
Sepolia economic-flow run and the later scheduled-opening test.

Source verification is not a security audit. An independent security review remains
uncompleted. The project remains explicitly experimental. Mainnet pool creation, fees,
burns and buybacks will require real participation and are not claimed as already executed.
`npm run release:check` still reports `independentReviewCompleted` as pending; its
full release gate is not green. This field has not been marked complete to bypass it.
