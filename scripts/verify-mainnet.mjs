// Read-only deployment audit. No wallet or signing capability.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,http,fallback,encodeDeployData} from 'viem';
import {base} from 'viem/chains';
const state=JSON.parse(readFileSync('deployments/wallet-8453.json'));
const launch=JSON.parse(readFileSync('launch-config.json'));
const cfg=state.config;
assert.equal(cfg.chainId,8453); assert.equal(cfg.testDex,false);
const client=createPublicClient({chain:base,transport:fallback([http(cfg.rpcUrl,{batch:true}),http('https://mainnet.base.org',{batch:true})])});
assert.equal(await client.getChainId(),8453);
const artifact=name=>JSON.parse(readFileSync(`out/${name}.sol/${name}.json`));
const nft=artifact('CyberToshiNFT');
const same=(a,b)=>assert.equal(a.toLowerCase(),b.toLowerCase());
const dex=['0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43','0x4200000000000000000000000000000000000006','0x420DD381b31aEf6683db6B902084cB0FFECe40Da'];
const output={chainId:8453,verifiedAt:new Date().toISOString(),config:cfg,launch,transactions:state.receipts,checks:{},sourceVerification:{}};
for(const entry of state.receipts) {
 const a=artifact(entry.name), args=entry.name==='CyberToshiNFT'?[cfg.renderer,...dex,BigInt(launch.mintStartsAt)]:[];
 const [tx,r]=await Promise.all([client.getTransaction({hash:entry.hash}),client.getTransactionReceipt({hash:entry.hash})]);
 assert.equal(r.status,'success');same(tx.from,launch.account);assert.equal(tx.to,null);assert.equal(tx.value,0n);
 same(r.contractAddress,state[entry.name]);
 assert.equal(tx.input.toLowerCase(),encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args}).toLowerCase());
}
assert.equal(state.receipts.length,2);
output.checks.deploymentInputsMatchCompiledCode=true;
const read=(address,a,functionName,args=[],extra={})=>client.readContract({address,abi:a.abi,functionName,args,...extra});
for(const [fn,key] of [['renderer','renderer'],['bcatToken','token'],['buybackRouter','vault']])same(await read(cfg.collection,nft,fn),cfg[key]);
assert.equal(await read(cfg.collection,nft,'mintStartsAt'),BigInt(launch.mintStartsAt));
assert.equal(await read(cfg.collection,nft,'MIN_MINT_INTERVAL'),60n);
assert.equal(await read(cfg.collection,nft,'MAX_SUPPLY'),16384n);
const token=artifact('BasedCatToken'), vault=artifact('ToshiBuybackRouter');
same(await read(cfg.token,token,'collection'),cfg.collection);same(await read(cfg.token,token,'vault'),cfg.vault);
same(await read(cfg.vault,vault,'token'),cfg.token);
for(const [i,fn] of ['router','weth','factory'].entries())same(await read(cfg.vault,vault,fn),dex[i]);
output.checks.contractBindingsAndOpening=true;
const block=await client.getBlock();
if(block.timestamp<BigInt(launch.mintStartsAt)) {
 assert.equal(await read(cfg.collection,nft,'totalMinted',[],{blockNumber:block.number}),0n);
 try { await client.simulateContract({account:launch.account,address:cfg.collection,abi:nft.abi,functionName:'mine',args:[0n,block.number-1n,await read(cfg.collection,nft,'prevWork')],value:1000000000000000n,blockNumber:block.number});assert.fail('Early mint accepted'); }
 catch(error){assert.equal(error.walk?.(e=>e.data?.errorName)?.data?.errorName,'MintNotOpen');}
 output.checks.beforeOpening={block:String(block.number),timestamp:String(block.timestamp),totalMinted:'0',revert:'MintNotOpen',method:'eth_call; no paid transaction'};
}
const jobs={
 renderer:'8deddaa5-9625-4a98-9d07-2d02dcdfc29b',collection:'8c1c0d5f-e51e-4639-8e6b-07fa0ac9c5af',
 token:'a23fb2fa-0072-43c6-b7de-b6fcac2eb6e0',vault:'5cc850d1-494e-411f-bfc9-c690a581d2d7',
};
for(const [kind,id] of Object.entries(jobs)) {
 const url=`https://sourcify.dev/server/v2/verify/${id}`;
 const response=await fetch(url);assert.ok(response.ok);const result=await response.json();
 assert.equal(result.isJobCompleted,true);assert.equal(result.contract.chainId,'8453');same(result.contract.address,cfg[kind]);
 assert.equal(result.contract.creationMatch,'exact_match');assert.equal(result.contract.runtimeMatch,'exact_match');
 output.sourceVerification[kind]={url,...result.contract,externalVerifications:result.externalVerifications};
}
output.status='verified';
writeFileSync('reports/mainnet-verification.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
