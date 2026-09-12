# CyberToshi — Base Sepolia validation in progress

Network: Base Sepolia, chain ID **84532**. No mainnet deployment.
The current collection redeems ETH **only by burning the NFT**, together with BCAT.

## Verified deployment

- Collection: [`0x51bc317ba8c99282816199e33391a6e786807871`](https://sepolia.basescan.org/address/0x51bc317ba8c99282816199e33391a6e786807871)
- [Collection deployment transaction](https://sepolia.basescan.org/tx/0xd478e0437091888522ad2c63b27121fdb17c880203b7da9747327b7090446dab)
- BCAT: `0xBF660E4929b2C9bB2303bEC3635E2aA1DD4fEe67`
- Vault: `0x2bE6efD037a420e675aBfBB39e7b35dDBea06afB`
- Test wallet: `0x5C4f2e4Be196e1D24E1511E7f12188EE788E0346`

The runner compares the deployment input against the compiled creation bytecode and
constructor arguments before sending test transactions. The local wallet deployment
tool also verified the deployed contract bindings.

## Completed on-chain checks

| Check | Evidence |
| --- | --- |
| Test wallet mined NFT #3 | [Transaction](https://sepolia.basescan.org/tx/0xbf334d93895ae570d681ef47552234679881cc6205d660fddfce38ed317c5316), block 46,717,987 |
| Test wallet mined NFT #4 | [Transaction](https://sepolia.basescan.org/tx/0x5e79e99110a561517e5fc8e3029ed9fac42f37a2086d912af2b24eef0f97ed1a), block 46,718,078 |
| Accepted mint interval | 182 seconds between the two real block timestamps; no chain clock manipulation |
| Early mint rejection | Historical `eth_call` against block 46,718,078 returns `MintTooSoon` at the same timestamp as mint #4; this is a simulation against real chain state, not a paid reverted transaction |
| Accumulated ETH | NFT #3 held 266,666,666,666,666 wei after mint #4, read at that block |
| Burn before pool launch | Historical `eth_call` returns `Community pool not launched` |
| Other owner's NFT protected | Calling burn for user NFT #1 from the test wallet returns `Unauthorized` |
| User NFTs preserved | #1 and #2 remain owned by `0x12B967b8b9eddB5185922375F1f7dC1F3791d9Dc`; the runner only sends burn transactions for its recorded test NFTs |

## Pool, redemption and fee checks completed

After receiving another 0.01 test ETH, the runner resumed without repeating mints.

| Check | Evidence |
| --- | --- |
| Completed pool funding | [0.0192 ETH contribution](https://sepolia.basescan.org/tx/0xd13ac3a2ef5472c210e1bc12d3f0e55d38b292b9431bfd715bc6e1fd41adf057) |
| Pool bootstrap | [Transaction](https://sepolia.basescan.org/tx/0x8216551d1c9c9e2902fb3a7dcccdbba786db21d4f52a41ac323f6bfd1e2368a2); vault holds 1e18 simulated LP units; BCAT allowance to the DEX reset to zero |
| NFT #3 burned for ETH + BCAT | [Transaction](https://sepolia.basescan.org/tx/0x3a23d370a83f0f8fcd31dfb3f24a11a2272fad3d9d94911dea1ed1419f24e684); received 266,666,666,666,666 wei and 1,000 BCAT. ETH transfer verified using the transaction call trace; token balance delta verified at adjacent blocks |
| Double burn rejected | Post-burn `eth_call` returns `ERC721NonexistentToken` |
| Seeded simulated fees | [Transaction](https://sepolia.basescan.org/tx/0x57593b1cbe5ac66c1024ba3f1734bc65954df780072ece211b4ed2cd09529508); 100 BCAT and 0.0002 test ETH supplied explicitly by the test wallet |
| Collected fees | [Transaction](https://sepolia.basescan.org/tx/0xe82c8acf5ef557647580231e9ed65c8ba5768a64b610924ce7ec7bd755537e98); 100 BCAT burned, 0.0002 ETH collected, LP balance unchanged |
| No double fee credit | [Second collection](https://sepolia.basescan.org/tx/0x4461b9aeb7c8671d1fdb11ffc81610951fce3948a89f13021f95c84eb9117f9f) succeeded without increasing either fee counter |

## Outstanding

The runner is waiting for real oracle observation intervals. The first checkpoint
is [confirmed](https://sepolia.basescan.org/tx/0xc1307ca218d96aed1c068bd30b4026a762e7cf081b1b904dda49240d1a50eb0f),
bringing the simulator to 2 of 4 required observations. The next two require more
than 30 real minutes each. The Sepolia buyback and subsequent cooldown rejection
are **not yet passed**. A separate local contract suite has passed 20 tests,
including the fork integration below; that does not replace these live checks.

## Scope of the DEX tests

Sepolia uses `TestDex`, an API simulator. Seeding fees explicitly is not trading;
its price quote and LP accounting are simplified. A successful test does not prove
real market liquidity, demand, or price behavior.

`test/AerodromeFork.t.sol` separately tests the actual Aerodrome contracts on a local
fork of Base. The latest complete contract test run used Base block **51,206,783**.
No real Base mainnet funds were spent in that fork test.

The test wallet key is stored locally with Windows DPAPI encryption, outside this
repository. It is not included in reports or Git. Transaction progress is journaled
in `deployments/agent-sepolia-results.json` (ignored by Git); pending transactions
are recovered before another transaction with the same label can be submitted.
