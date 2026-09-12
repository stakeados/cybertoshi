import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, http, encodeDeployData, parseEventLogs } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { makeInput, hashNonce } from '../frontend/pow.js';

const account = privateKeyToAccount(process.env.CYBERTOSHI_TEST_KEY);
delete process.env.CYBERTOSHI_TEST_KEY;
assert.equal(account.address, '0x5C4f2e4Be196e1D24E1511E7f12188EE788E0346');
const s = JSON.parse(readFileSync('deployments/wallet-84532-burn-only.json'));
assert.equal(s.chainId, 84532); assert.equal(s.config.testDex, true);
const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http('https://sepolia.base.org') });
assert.equal(await client.getChainId(), 84532);
const artifact = JSON.parse(readFileSync('out/CyberToshiNFT.sol/CyberToshiNFT.json'));
const deployment = await client.getTransaction({ hash: s.receipts.find(r => r.name === 'CyberToshiNFT').hash });
assert.equal(deployment.input.toLowerCase(), encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [s.CyberToshiRenderer, s.TestDex, s.TestDex, s.TestDex] }).toLowerCase());
const read = (functionName, args = []) => client.readContract({ address: s.config.collection, abi: artifact.abi, functionName, args });
const file = 'deployments/agent-sepolia-results.json';
const report = existsSync(file) ? JSON.parse(readFileSync(file)) : { chainId: 84532, account: account.address, collection: s.config.collection, mints: [] };
assert.equal(report.collection, s.config.collection);
// Recover a submitted transaction before permitting another mint.
async function record(hash) {
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
  assert.equal(receipt.status, 'success');
  const [event] = parseEventLogs({ abi: artifact.abi, logs: receipt.logs, eventName: 'Mined' }).filter(e => e.address.toLowerCase() === s.config.collection.toLowerCase());
  assert.equal(event.args.miner.toLowerCase(), account.address.toLowerCase());
  assert.equal((await read('ownerOf', [event.args.tokenId])).toLowerCase(), account.address.toLowerCase());
  report.mints.push({ hash, tokenId: String(event.args.tokenId), block: String(receipt.blockNumber) });
  delete report.pendingMint;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.mints.at(-1)));
}
if (report.pendingMint) { await record(report.pendingMint); process.exit(0); }
const [last, count] = await Promise.all([read('lastMintAt'), read('totalMinted')]);
let latest = await client.getBlock();
if (count && latest.timestamp < last + 60n) {
  const seconds = Number(last + 60n - latest.timestamp) + 2;
  console.log(`Waiting ${seconds}s for the real global mint interval.`);
  await new Promise(r => setTimeout(r, seconds * 1000));
  latest = await client.getBlock();
}
const anchor = await client.getBlock({ blockNumber: latest.number - 1n });
const [previous, target, value] = await Promise.all([read('prevWork'), read('effectiveTarget'), read('mintPrice')]);
assert.ok(value <= 1000000000000000n, 'Unexpected mint price');
const input = makeInput({ chainId: 84532, collection: s.config.collection, account: account.address, previous, anchorHash: anchor.hash });
let nonce = 0n;
const started = Date.now();
while (BigInt(hashNonce(input, nonce)) >= target) {
  nonce++;
  if (nonce % 10000n === 0n && Date.now() - started > 90_000) throw Error('Mining time limit exceeded; no transaction sent');
}
const args = [nonce, anchor.number, previous];
await client.simulateContract({ account, address: s.config.collection, abi: artifact.abi, functionName: 'mine', args, value });
report.pendingMint = await wallet.writeContract({ address: s.config.collection, abi: artifact.abi, functionName: 'mine', args, value });
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`Submitted test mint: ${report.pendingMint}`);
await record(report.pendingMint);
