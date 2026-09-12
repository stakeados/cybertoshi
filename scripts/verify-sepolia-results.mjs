// Read-only independent verification of the recorded live test run.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createPublicClient, http, encodeDeployData, decodeFunctionData, parseEventLogs } from 'viem';
import { baseSepolia } from 'viem/chains';
const state = JSON.parse(readFileSync('deployments/wallet-84532-burn-only.json'));
const report = JSON.parse(readFileSync('deployments/agent-sepolia-results.json'));
const cfg = state.config;
const abis = JSON.parse(readFileSync('frontend/abis.json'));
abis.dex = JSON.parse(readFileSync('out/TestDex.sol/TestDex.json')).abi;
const client = createPublicClient({ chain:baseSepolia, transport:http('https://sepolia.base.org') });
assert.equal(await client.getChainId(),84532);
assert.equal(report.chainId,84532);
assert.equal(report.collection,cfg.collection);
const equalAddress = (a,b) => assert.equal(a.toLowerCase(),b.toLowerCase());
const at = kind => kind === 'nft' ? cfg.collection : kind === 'dex' ? state.TestDex : cfg[kind];
const read = (kind,functionName,args=[],extra={}) => client.readContract({address:at(kind),abi:abis[kind],functionName,args,...extra});
const output = { chainId:84532, collection:cfg.collection, verifiedAt:new Date().toISOString(), checks:{}, pending:[], transactions:{} };
async function expectRevert(label,kind,functionName,args,expected,extra={}) {
  try { await client.simulateContract({account:report.account,address:at(kind),abi:abis[kind],functionName,args,...extra}); }
  catch(error) {
    const cause=error.walk?.(e=>e.data?.errorName);
    const actual=cause?.data?.errorName==='Error'?String(cause.data.args[0]):cause?.data?.errorName;
    assert.equal(actual,expected,error.shortMessage);
    output.checks[label]={error:actual,block:String(extra.blockNumber||await client.getBlockNumber()),method:'historical eth_call'};
    return;
  }
  throw Error(label+' unexpectedly succeeded');
}
const deploymentHash = state.receipts.find(x=>x.name==='CyberToshiNFT').hash;
const [deployment, deployed] = await Promise.all([client.getTransaction({hash:deploymentHash}),client.getTransactionReceipt({hash:deploymentHash})]);
assert.equal(deployed.status,'success'); equalAddress(deployed.contractAddress,cfg.collection);
const artifact = JSON.parse(readFileSync('out/CyberToshiNFT.sol/CyberToshiNFT.json'));
assert.equal(deployment.input.toLowerCase(),encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,args:[cfg.renderer,state.TestDex,state.TestDex,state.TestDex]}).toLowerCase());
assert.ok(!artifact.abi.some(x=>x.name==='claimRent'));
output.checks.deploymentMatchesBurnOnlyCode = deploymentHash;
for (const [label,entry] of Object.entries(report.transactions)) {
  if(entry.status!=='success') { output.pending.push(label); continue; }
  const [tx,r] = await Promise.all([client.getTransaction({hash:entry.hash}),client.getTransactionReceipt({hash:entry.hash})]);
  assert.equal(r.status,'success'); equalAddress(tx.from,report.account); equalAddress(tx.to,at(entry.kind));
  assert.equal(tx.value,BigInt(entry.value));
  if(entry.functionName) {
    const decoded = decodeFunctionData({abi:abis[entry.kind],data:tx.input});
    assert.equal(decoded.functionName,entry.functionName);
    assert.deepEqual((decoded.args||[]).map(String).map(x=>x.toLowerCase()),entry.args.map(x=>x.toLowerCase()));
  } else assert.equal(tx.input,'0x');
  output.transactions[label] = {hash:entry.hash,block:String(r.blockNumber)};
}
const mintBlocks = [];
for(const entry of report.mints) {
  const [r,tx] = await Promise.all([client.getTransactionReceipt({hash:entry.hash}),client.getTransaction({hash:entry.hash})]);
  assert.equal(r.status,'success');equalAddress(tx.from,report.account);equalAddress(tx.to,cfg.collection);
  const [event] = parseEventLogs({abi:abis.nft,logs:r.logs,eventName:'Mined'}).filter(x=>x.address.toLowerCase()===cfg.collection.toLowerCase());
  assert.equal(String(event.args.tokenId),entry.tokenId); equalAddress(event.args.miner,report.account);
  mintBlocks.push(await client.getBlock({blockNumber:r.blockNumber}));
}
assert.equal(mintBlocks.length,2);
assert.ok(mintBlocks[1].timestamp-mintBlocks[0].timestamp>=60n);
output.checks.mintIntervalSeconds=String(mintBlocks[1].timestamp-mintBlocks[0].timestamp);
const mintedAt=mintBlocks[1].number;
await expectRevert('earlyMintRejected','nft','mine',[0n,mintedAt-1n,await read('nft','prevWork',[],{blockNumber:mintedAt})],'MintTooSoon',{value:1000000000000000n,blockNumber:mintedAt});
await expectRevert('burnBeforePoolRejected','nft','burn',[BigInt(report.mints[0].tokenId)],'Community pool not launched',{blockNumber:mintedAt});
await expectRevert('unauthorizedBurnRejected','nft','burn',[1n],'Unauthorized',{blockNumber:mintedAt});
const accrued=await read('nft','claimableRent',[BigInt(report.mints[0].tokenId)],{blockNumber:mintedAt});
assert.ok(accrued>0n);output.checks.accruedEthWei=String(accrued);
for(const id of [1n,2n]) equalAddress(await read('nft','ownerOf',[id]),state.account);
equalAddress(await read('nft','ownerOf',[BigInt(report.mints[1].tokenId)]),report.account);
output.checks.userCatsPreserved=[1,2];

if(report.transactions.burnOwnCat?.status==='success') {
  const r=await client.getTransactionReceipt({hash:report.transactions.burnOwnCat.hash});
  const nftLogs=r.logs.filter(x=>x.address.toLowerCase()===cfg.collection.toLowerCase());
  const [eth]=parseEventLogs({abi:abis.nft,logs:nftLogs,eventName:'RentRedeemed'});
  const [bcat]=parseEventLogs({abi:abis.nft,logs:nftLogs,eventName:'Burned'});
  assert.equal(String(eth.args.tokenId),report.mints[0].tokenId);
  assert.equal(eth.args.tokenId,bcat.args.tokenId);equalAddress(eth.args.recipient,report.account);
  assert.ok(eth.args.amount>0n);assert.equal(bcat.args.reward,1000n*10n**18n);
  const trace=await client.request({method:'debug_traceTransaction',params:[r.transactionHash,{tracer:'callTracer'}]});
  const flatten=n=>[n,...(n.calls||[]).flatMap(flatten)];
  assert.ok(flatten(trace).some(x=>x.from?.toLowerCase()===cfg.collection.toLowerCase()&&x.to?.toLowerCase()===report.account.toLowerCase()&&BigInt(x.value||0)===eth.args.amount&&!x.error));
  const tokenTransfers=parseEventLogs({abi:abis.token,logs:r.logs.filter(x=>x.address.toLowerCase()===cfg.token.toLowerCase()),eventName:'Transfer'});
  assert.ok(tokenTransfers.some(x=>x.args.from==='0x0000000000000000000000000000000000000000'&&x.args.to.toLowerCase()===report.account.toLowerCase()&&x.args.value===bcat.args.reward));
  output.checks.combinedRedemption={ethWei:String(eth.args.amount),bcatUnits:String(bcat.args.reward),traceVerified:true};
  await expectRevert('doubleBurnRejected','nft','burn',[eth.args.tokenId],'ERC721NonexistentToken',{blockNumber:r.blockNumber});
}
if(await read('vault','bootstrapped')) {
  assert.equal(await read('dex','balanceOf',[cfg.vault]),10n**18n);
  assert.equal(await read('token','allowance',[cfg.vault,state.TestDex]),0n);
  output.checks.lpCustodyAndZeroAllowance=true;
}
if(report.transactions.collectFeesAgain?.status==='success') {
  assert.equal(await read('vault','totalFeeBcatBurned'),100n*10n**18n);
  assert.equal(await read('vault','totalFeeEthCollected'),200000000000000n);
  output.checks.simulatedFees={burnedBcat:'100',collectedEthWei:'200000000000000'};
  const before=BigInt(report.transactions.collectFeesAgain.block)-1n;
  const after=BigInt(report.transactions.collectFeesAgain.block);
  for(const fn of ['totalFeeBcatBurned','totalFeeEthCollected']) assert.equal(await read('vault',fn,[],{blockNumber:before}),await read('vault',fn,[],{blockNumber:after}));
  output.checks.secondCollectionNoCredit=true;
}
const checkpoints=Object.entries(report.transactions).filter(([k,v])=>k.startsWith('checkpoint-')&&v.status==='success');
const times=[];
for(const [label,r] of checkpoints) {
  const block=await client.getBlock({blockNumber:BigInt(r.block)});
  times.push({label,timestamp:Number(block.timestamp),hash:r.hash});
}
times.sort((a,b)=>a.timestamp-b.timestamp);
for(let i=1;i<times.length;i++) assert.ok(times[i].timestamp-times[i-1].timestamp>1800);
output.checks.realCheckpointTimes=times;
if(report.transactions.buyback?.status==='success') {
  const r=await client.getTransactionReceipt({hash:report.transactions.buyback.hash});
  const [event]=parseEventLogs({abi:abis.vault,logs:r.logs,eventName:'Buyback'}).filter(x=>x.address.toLowerCase()===cfg.vault.toLowerCase());
  assert.equal(event.args.ethAmount,200000000000000n);assert.equal(event.args.tokensBurned,10000n*10n**18n);
  assert.equal(await read('vault','totalBcatBurned'),10100n*10n**18n);
  assert.equal(await read('token','balanceOf',[cfg.vault]),0n);
  assert.equal(await read('dex','observationLength',[],{blockNumber:r.blockNumber}),4n);
  assert.equal(times.length,3);
  const block=await client.getBlock({blockNumber:r.blockNumber});
  const bootstrapBlock=await client.getBlock({blockNumber:BigInt(report.transactions.bootstrap.block)});
  assert.ok(block.timestamp-bootstrapBlock.timestamp>=1800n);
  await expectRevert('immediateBuybackRetryRejected','vault','executeBuyback',[],'NotReady',{blockNumber:r.blockNumber});
  output.checks.immediateRetryScope='Retry rejects with cooldown active; exhausted vault funds may also independently prevent retry. Isolated cooldown boundaries are covered by local contract tests.';
  output.checks.simulatedBuyback={ethWei:String(event.args.ethAmount),burnedBcatUnits:String(event.args.tokensBurned)};
} else output.pending.push('buyback and cooldown');
for(const label of ['fundPool','bootstrap','burnOwnCat','approveTestFees','seedSimulatedFees','collectFees','collectFeesAgain','checkpoint-1','checkpoint-2','checkpoint-3','buyback']) {
  if(report.transactions[label]?.status!=='success'&&!output.pending.includes(label)) output.pending.push(label);
}
output.status=output.pending.length?'incomplete':'verified';
mkdirSync('reports',{recursive:true});
writeFileSync('reports/sepolia-verification.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
