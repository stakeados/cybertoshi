# Base transaction attribution

The frontend attributes its transactions to Builder Code `bc_u6c8h11k` using
ERC-8021 and `Attribution.toDataSuffix` from `ox/erc8021`.

`frontend/builder-code.js` enables the suffix on Base (8453) and Base Sepolia
(84532), not on local chains. The wallet client carries the default suffix;
the shared transaction simulation also receives it so simulation and submission
use identical calldata. This covers mint, NFT burn, pool bootstrap, checkpoint,
fee collection and buyback. It does not change any deployed contract or fee split.

Domain verification is separate: `base:app_id` in the HTML identifies the app
registration. It does not by itself add attribution to transactions from ordinary
browser wallets. Transactions sent outside this frontend are not automatically
covered by this integration, and historical transactions are not retroactively tagged.

Run `npm run test:builder-code` for mocked-RPC checks of all six actions on Base,
Sepolia and a local chain. It checks the exact simulated/submitted calldata,
single attribution suffix, decoded code, unchanged arguments, destination and value.
This test sends no real transactions and does not verify Base's external indexer.

After the next real user transaction, inspect its input with the ERC-8021 decoder
and check attribution in Base.dev. Rewards or listing acceptance are not guaranteed.
The suffix adds calldata bytes and a small associated gas cost.

Reference: https://docs.base.org/specifications/builder-codes/for-app-developers
