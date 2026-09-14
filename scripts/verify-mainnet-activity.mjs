import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createPublicClient,http,parseAbi,decodeEventLog} from 'viem';
import {base} from 'viem/chains';
import {loadMarket} from '../frontend/market.js';
const cfg=JSON.parse(readFileSync('frontend/public/deployment.json'));
assert.equal(cfg.chainId,8453);
const abis=JSON.parse(readFileSync('frontend/abis.json'));
const client=createPublicClient({chain:base,transport:http(cfg.rpcUrl,{batch:true})});
const logClient=createPublicClient({chain:base,transport:http('https://mainnet.base.org')});
const state=await loadMarket(client,cfg,abis);
assert(state.launched && state.lockedLp>0n);
const swapAbi=parseAbi(['event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)']);
const entries=[];
for(let from=51232098n;from<=state.blockNumber;from+=2000n){
  const to=from+1999n>state.blockNumber?state.blockNumber:from+1999n;
  let logs;
  for(let attempt=0;;attempt++) {
    try { logs=await logClient.getLogs({address:[cfg.collection,cfg.token,cfg.vault,state.pool],fromBlock:from,toBlock:to}); break; }
    catch(e) { if(attempt===4) throw e; await new Promise(r=>setTimeout(r,2000*(attempt+1))); }
  }
  await new Promise(r=>setTimeout(r,500));
  for(const log of logs){
    const addr=log.address.toLowerCase();
    const abi=addr===cfg.collection.toLowerCase()?abis.nft:addr===cfg.token.toLowerCase()?abis.token:addr===cfg.vault.toLowerCase()?abis.vault:swapAbi;
    try {
      const decoded=decodeEventLog({abi,data:log.data,topics:log.topics});
      if(['Bootstrapped','Burned','RentRedeemed','PoolFeesCollected','Buyback','Swap','Transfer'].includes(decoded.eventName))
        entries.push({address:log.address,hash:log.transactionHash,block:log.blockNumber,event:decoded.eventName,args:decoded.args});
    } catch {}
  }
}
const events=entries.filter(x=>x.event!=='Transfer');
const receipts=[];
for(const hash of new Set(events.map(x=>x.hash))){
  const [tx,r]=await Promise.all([logClient.getTransaction({hash}),logClient.getTransactionReceipt({hash})]);
  assert.equal(r.status,'success');receipts.push({hash,from:tx.from,to:tx.to,value:tx.value,status:r.status});
  await new Promise(r=>setTimeout(r,500));
}
const feeEvents=events.filter(x=>x.event==='PoolFeesCollected');
assert.equal(feeEvents.reduce((s,e)=>s+e.args.bcatBurned,0n),state.feeBurned);
assert.equal(feeEvents.reduce((s,e)=>s+e.args.ethCollected,0n),state.feeEth);
const burns=events.filter(x=>x.event==='Burned');
assert.equal(BigInt(burns.length),state.burnedCats);
for(const e of burns){
  assert(entries.some(x=>x.hash===e.hash&&x.address.toLowerCase()===cfg.token.toLowerCase()&&x.event==='Transfer'&&x.args.from==='0x0000000000000000000000000000000000000000'&&x.args.value===e.args.reward));
}
const mintedTokens=entries.filter(x=>x.event==='Transfer'&&x.address.toLowerCase()===cfg.token.toLowerCase()&&x.args.from==='0x0000000000000000000000000000000000000000').reduce((s,x)=>s+x.args.value,0n);
const burnedTokens=entries.filter(x=>x.event==='Transfer'&&x.address.toLowerCase()===cfg.token.toLowerCase()&&x.args.to==='0x0000000000000000000000000000000000000000').reduce((s,x)=>s+x.args.value,0n);
assert.equal(mintedTokens-burnedTokens,state.supply);
const boot=events.find(x=>x.event==='Bootstrapped');
assert(boot);
assert.equal(boot.args.ethAmount,20000000000000000n);
assert.equal(boot.args.tokenAmount,1000000000000000000000000n);
const report={verifiedAt:new Date().toISOString(),chainId:8453,contracts:cfg,state,events,receipts,checks:{successfulReceipts:true,bootstrapAmounts:true,feeCountersMatchEvents:true,burnRewardsMinted:true,tokenSupplyReconciled:true,lpStillInVault:state.lockedLp>=boot.args.liquidity},scope:'Read-only receipts, events and state. Does not prove recipient ETH balance deltas net of gas or an independent security audit.'};
writeFileSync('reports/mainnet-activity.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
