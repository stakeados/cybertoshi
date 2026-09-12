// Public testnet only. No mainnet URLs, user keys or user NFT transactions.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createPublicClient, createWalletClient, http, formatEther, encodeDeployData, encodeFunctionData, parseEventLogs } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const key = process.env.CYBERTOSHI_TEST_KEY;
delete process.env.CYBERTOSHI_TEST_KEY;
const account = privateKeyToAccount(key);
assert.equal(account.address, '0x5C4f2e4Be196e1D24E1511E7f12188EE788E0346');
const manifest = JSON.parse(readFileSync('deployments/wallet-84532-burn-only.json'));
assert.equal(manifest.chainId, 84532); assert.equal(manifest.config.testDex, true);
const cfg = manifest.config;
const abis = JSON.parse(readFileSync('frontend/abis.json'));
abis.dex = JSON.parse(readFileSync('out/TestDex.sol/TestDex.json')).abi;
const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http('https://sepolia.base.org') });
assert.equal(await client.getChainId(), 84532);
const artifact = JSON.parse(readFileSync('out/CyberToshiNFT.sol/CyberToshiNFT.json'));
const deployTx = await client.getTransaction({ hash: manifest.receipts.find(r => r.name === 'CyberToshiNFT').hash });
assert.equal(deployTx.input.toLowerCase(), encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [cfg.renderer, manifest.TestDex, manifest.TestDex, manifest.TestDex] }).toLowerCase());
assert.ok(!artifact.abi.some(x => x.name === 'claimRent'));
const file = 'deployments/agent-sepolia-results.json';
let report = JSON.parse(readFileSync(file));
assert.equal(report.collection, cfg.collection);
const save = () => writeFileSync(file, JSON.stringify(report, (_, v) => typeof v === 'bigint' ? String(v) : v, 2));
report.checks ||= {}; report.transactions ||= {};
const address = kind => kind === 'nft' ? cfg.collection : kind === 'dex' ? manifest.TestDex : cfg[kind];
const read = (kind, functionName, args = [], extra = {}) => client.readContract({ address: address(kind), abi: abis[kind], functionName, args, ...extra });
const note = (name, evidence) => { report.checks[name] = evidence; save(); console.log('PASS ' + name + ': ' + JSON.stringify(evidence, (_,v) => typeof v === 'bigint' ? String(v) : v)); };
async function owners() {
  for (const id of [1n, 2n]) assert.equal((await read('nft','ownerOf',[id])).toLowerCase(), manifest.account.toLowerCase());
}
async function reverted(name, kind, functionName, args, expected, extra = {}) {
  try { await client.simulateContract({ address: address(kind), abi: abis[kind], functionName, args, account, ...extra }); }
  catch (error) {
    const cause = error.walk?.(e => e.data?.errorName);
    const description = cause?.data?.errorName === 'Error' ? String(cause.data.args[0]) : cause?.data?.errorName;
    assert.equal(description, expected, error.shortMessage);
    note(name, { expectedRevert: description, block: String(extra.blockNumber || await client.getBlockNumber()), method: 'eth_call, no reverted transaction paid' }); return;
  }
  throw Error(name + ' unexpectedly succeeded');
}
async function tx(label, kind, functionName, args = [], value = 0n) {
  let entry = report.transactions[label];
  if (!entry) {
    await owners();
    assert.equal(await client.getChainId(),84532);
    if (kind === 'nft' && functionName === 'burn') {
      assert.ok(report.mints.some(m => m.tokenId === String(args[0])));
      assert.equal((await read('nft','ownerOf',args)).toLowerCase(),account.address.toLowerCase());
    }
    const request = functionName ? { address: address(kind), abi: abis[kind], functionName, args, value } : null;
    if (request) await client.simulateContract({ account, ...request });
    const hash = request ? await wallet.writeContract(request) : await wallet.sendTransaction({ to: address(kind), value });
    report.transactions[label] = entry = { hash, kind, functionName, args: args.map(String), value: String(value), status: 'pending' }; save();
    console.log('SUBMITTED ' + label + ': ' + hash);
  }
  const receipt = await client.waitForTransactionReceipt({ hash: entry.hash, confirmations: 2 });
  assert.equal(receipt.status, 'success', label);
  Object.assign(entry, { status: receipt.status, block: String(receipt.blockNumber), gasUsed: String(receipt.gasUsed) }); save();
  return receipt;
}
await owners();
if (report.mints.length < 2) {
  execFileSync(process.execPath, ['scripts/sepolia-agent-mint.mjs'], { env: { ...process.env, CYBERTOSHI_TEST_KEY: key }, stdio: 'inherit' });
  report = JSON.parse(readFileSync(file)); report.checks ||= {}; report.transactions ||= {};
}
const [first, second] = report.mints;
const secondReceipt = await client.getTransactionReceipt({ hash: second.hash });
const secondBlock = await client.getBlock({ blockNumber: secondReceipt.blockNumber });
const firstBlock = await client.getBlock({ blockNumber: BigInt(first.block) });
assert.ok(secondBlock.timestamp - firstBlock.timestamp >= 60n);
note('acceptedMintInterval', { first: first.hash, second: second.hash, seconds: String(secondBlock.timestamp-firstBlock.timestamp) });
await reverted('earlyMintRejected','nft','mine',[0n,secondBlock.number-1n,await read('nft','prevWork',[],{blockNumber:secondBlock.number})],'MintTooSoon',{value:1000000000000000n,blockNumber:secondBlock.number});
const rent = await read('nft','claimableRent',[BigInt(first.tokenId)],{blockNumber:secondBlock.number});
assert.ok(rent > 0n);
note('rentAccumulates', { tokenId:first.tokenId, wei:String(rent), block:String(secondBlock.number) });
await reverted('burnBeforePoolRejected','nft','burn',[BigInt(first.tokenId)],'Community pool not launched',{blockNumber:secondBlock.number});
await reverted('userCatProtected','nft','burn',[1n],'Unauthorized');
await owners();
note('userCatsPreserved',{tokenIds:['1','2'],owner:manifest.account});

if (!await read('vault','bootstrapped')) {
  const balance = await client.getBalance({ address: cfg.vault });
  const deficit = balance >= 20000000000000000n ? 0n : 20000000000000000n - balance;
  const ownBalance = await client.getBalance({ address: account.address });
  // Reserve test fees plus enough native ETH for subsequent transactions.
  if (ownBalance < deficit + 1000000000000000n) {
    report.status = 'awaiting_test_funds';
    report.funding = { walletETH:formatEther(ownBalance), poolDeficitETH:formatEther(deficit), reserveETH:'0.001' }; save();
    console.log('AWAITING_TEST_FUNDS ' + JSON.stringify(report.funding)); process.exit(2);
  }
  if (deficit) await tx('fundPool','vault',null,[],deficit);
  await tx('bootstrap','vault','bootstrapCommunityLiquidity');
}
assert.equal(await read('vault','bootstrapped'),true);
assert.equal((await read('dex','asset')).toLowerCase(),cfg.token.toLowerCase());
assert.equal(await read('dex','balanceOf',[cfg.vault]),1000000000000000000n);
assert.equal(await read('token','allowance',[cfg.vault,manifest.TestDex]),0n);
note('poolLaunch', { hash:report.transactions.bootstrap?.hash, lockedLP:'1000000000000000000', testDex:true, note:'API simulator, not a real market' });

const burnReceipt = await tx('burnOwnCat','nft','burn',[BigInt(first.tokenId)]);
const redeemed = parseEventLogs({ abi:abis.nft, logs:burnReceipt.logs, eventName:'RentRedeemed' }).find(e => e.address.toLowerCase() === cfg.collection.toLowerCase());
const burned = parseEventLogs({ abi:abis.nft, logs:burnReceipt.logs, eventName:'Burned' }).find(e => e.address.toLowerCase() === cfg.collection.toLowerCase());
assert.equal(redeemed.args.tokenId,BigInt(first.tokenId)); assert.ok(redeemed.args.amount>0n);
assert.equal(redeemed.args.recipient.toLowerCase(),account.address.toLowerCase());
assert.equal(burned.args.reward,1000000000000000000000n);
const delta = (await read('token','balanceOf',[account.address],{blockNumber:burnReceipt.blockNumber}))-(await read('token','balanceOf',[account.address],{blockNumber:burnReceipt.blockNumber-1n}));
assert.equal(delta,burned.args.reward);
const trace = await client.request({method:'debug_traceTransaction',params:[burnReceipt.transactionHash,{tracer:'callTracer'}]}).catch(()=>null);
if (trace) {
  const calls = node => [node,...(node.calls||[]).flatMap(calls)];
  assert.ok(calls(trace).some(c => c.from?.toLowerCase()===cfg.collection.toLowerCase() && c.to?.toLowerCase()===account.address.toLowerCase() && BigInt(c.value||0)===redeemed.args.amount && !c.error));
}
assert.equal(await read('nft','claimableRent',[BigInt(first.tokenId)]),0n);
await reverted('doubleBurnRejected','nft','burn',[BigInt(first.tokenId)],'ERC721NonexistentToken');
note('combinedRedemption', { hash:burnReceipt.transactionHash, tokenId:first.tokenId, ethWei:String(redeemed.args.amount), bcatUnits:String(delta), ethTransferTraceVerified:!!trace });

await tx('approveTestFees','token','approve',[manifest.TestDex,100000000000000000000n]);
await tx('seedSimulatedFees','dex','fundFees',[cfg.vault,100000000000000000000n],200000000000000n);
const fees = await tx('collectFees','vault','collectPoolFees');
assert.equal(await read('vault','totalFeeBcatBurned'),100000000000000000000n);
assert.equal(await read('vault','totalFeeEthCollected'),200000000000000n);
assert.equal(await read('dex','balanceOf',[cfg.vault]),1000000000000000000n);
note('simulatedFeeCollection',{hash:fees.transactionHash,bcatBurned:'100',ethCollected:'0.0002',lpUnchanged:true});
const secondFees = await tx('collectFeesAgain','vault','collectPoolFees');
assert.equal(await read('vault','totalFeeBcatBurned'),100000000000000000000n);
assert.equal(await read('vault','totalFeeEthCollected'),200000000000000n);
note('feesNotDoubleCounted',{hash:secondFees.transactionHash});

report.status = 'waiting_real_oracle_intervals'; save();
const deadline = Date.now()+4*60*60*1000;
while (await read('dex','observationLength') < 4n) {
  if(Date.now()>deadline) throw Error('Oracle wait exceeded four hours');
  const [observed, block, count] = await Promise.all([read('dex','observedAt'),client.getBlock(),read('dex','observationLength')]);
  const remaining = Number(observed+1801n-block.timestamp);
  if(remaining>0) {
    console.log(`WAIT observation ${count}/4; ${remaining}s remaining by chain time.`);
    await new Promise(r=>setTimeout(r,Math.min(remaining+2,45)*1000));
  } else await tx('checkpoint-'+String(count),'vault','checkpoint');
}
const quote = await read('vault','buybackQuote');
note('eligibleBuybackQuote',{ethWei:String(quote[0]),minimumBcatUnits:String(quote[1]),observations:String(await read('dex','observationLength'))});
const bought = await tx('buyback','vault','executeBuyback');
assert.equal(await read('vault','totalBcatBurned'),10100000000000000000000n);
assert.equal(await read('token','balanceOf',[cfg.vault]),0n);
assert.equal(await read('dex','balanceOf',[cfg.vault]),1000000000000000000n);
await reverted('buybackCooldownRejected','vault','executeBuyback',[],'NotReady');
note('simulatedBuyback',{hash:bought.transactionHash,totalBcatBurned:'10100',lpUnchanged:true});
await owners();
note('userCatsPreserved',{tokenIds:['1','2'],owner:manifest.account});
report.status='passed'; report.completedAt=new Date().toISOString(); save();
console.log('SEPOLIA_SUITE_PASSED');
