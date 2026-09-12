// Live Base Sepolia opening gate test. Uses only the funded agent test wallet.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createPublicClient, createWalletClient, http, encodeDeployData, parseEventLogs} from 'viem';
import {baseSepolia} from 'viem/chains';
import {privateKeyToAccount} from 'viem/accounts';
import {makeInput, hashNonce} from '../frontend/pow.js';
const account = privateKeyToAccount(process.env.CYBERTOSHI_TEST_KEY);
delete process.env.CYBERTOSHI_TEST_KEY;
assert.equal(account.address, '0x5C4f2e4Be196e1D24E1511E7f12188EE788E0346');
const client = createPublicClient({chain:baseSepolia, transport:http('https://sepolia.base.org')});
const wallet = createWalletClient({account, chain:baseSepolia, transport:http('https://sepolia.base.org')});
assert.equal(await client.getChainId(),84532);
const old = JSON.parse(readFileSync('deployments/wallet-84532-burn-only.json'));
const artifact = JSON.parse(readFileSync('out/CyberToshiNFT.sol/CyberToshiNFT.json'));
const file = 'deployments/scheduled-opening-sepolia.json';
const state = existsSync(file) ? JSON.parse(readFileSync(file)) : {chainId:84532, account:account.address, testDex:true};
const save = () => writeFileSync(file, JSON.stringify(state,(_,v)=>typeof v==='bigint'?String(v):v,2));
assert.equal(state.account,account.address); assert.equal(state.chainId,84532);
if (!state.deploymentHash) {
  const block = await client.getBlock();
  state.opensAt = String(block.timestamp+180n); save();
  state.deploymentHash = await wallet.deployContract({abi:artifact.abi, bytecode:artifact.bytecode.object,
    args:[old.CyberToshiRenderer,old.TestDex,old.TestDex,old.TestDex,BigInt(state.opensAt)]});
  save(); console.log('Submitted scheduled collection '+state.deploymentHash);
}
const deployed = await client.waitForTransactionReceipt({hash:state.deploymentHash,confirmations:2});
assert.equal(deployed.status,'success'); state.collection = deployed.contractAddress; save();
const deployTx = await client.getTransaction({hash:state.deploymentHash});
assert.equal(deployTx.input.toLowerCase(),encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,
  args:[old.CyberToshiRenderer,old.TestDex,old.TestDex,old.TestDex,BigInt(state.opensAt)]}).toLowerCase());
const read = (functionName,args=[],extra={})=>client.readContract({address:state.collection,abi:artifact.abi,functionName,args,...extra});
assert.equal(await read('mintStartsAt'),BigInt(state.opensAt));
if(!state.beforeOpening) {
  const block=await client.getBlock(); assert.ok(block.timestamp<BigInt(state.opensAt),'Must observe gate before opening');
  try { await client.simulateContract({account,address:state.collection,abi:artifact.abi,functionName:'mine',args:[0n,block.number-1n,await read('prevWork')],value:1000000000000000n,blockNumber:block.number}); assert.fail('Early mint accepted'); }
  catch(error) { assert.equal(error.walk?.(e=>e.data?.errorName)?.data?.errorName,'MintNotOpen'); }
  assert.equal(await read('totalMinted'),0n);
  assert.equal(await read('effectiveTarget'),await read('EASIEST_TARGET'));
  state.beforeOpening={block:String(block.number),timestamp:String(block.timestamp),revert:'MintNotOpen',method:'eth_call against live chain state'}; save();
  console.log('PASS early mint rejected; read methods work before launch.');
}
while((await client.getBlock()).timestamp<BigInt(state.opensAt)) {
  console.log('WAIT real Base Sepolia opening: '+new Date(Number(state.opensAt)*1000).toISOString());
  await new Promise(r=>setTimeout(r,15000));
}
if(!state.mintHash) {
  const block=await client.getBlock(); const anchor=await client.getBlock({blockNumber:block.number-1n});
  const previous=await read('prevWork'); const target=await read('effectiveTarget');
  const input=makeInput({chainId:84532,collection:state.collection,account:account.address,previous,anchorHash:anchor.hash});
  let nonce=0n; const deadline=Date.now()+90000;
  while(BigInt(hashNonce(input,nonce))>=target) { nonce++; if(Date.now()>deadline) throw Error('Bounded proof search expired'); }
  const request={address:state.collection,abi:artifact.abi,functionName:'mine',args:[nonce,anchor.number,previous],value:1000000000000000n};
  await client.simulateContract({account,...request});
  state.mintHash=await wallet.writeContract(request); save(); console.log('Submitted opening mint '+state.mintHash);
}
const receipt=await client.waitForTransactionReceipt({hash:state.mintHash,confirmations:2});
assert.equal(receipt.status,'success');
const block=await client.getBlock({blockNumber:receipt.blockNumber}); assert.ok(block.timestamp>=BigInt(state.opensAt));
const [event]=parseEventLogs({abi:artifact.abi,logs:receipt.logs,eventName:'Mined'}).filter(e=>e.address.toLowerCase()===state.collection.toLowerCase());
assert.equal(event.args.miner.toLowerCase(),account.address.toLowerCase());
assert.equal((await read('ownerOf',[event.args.tokenId])).toLowerCase(),account.address.toLowerCase());
for (const id of [1n,2n]) {
  const owner=await client.readContract({address:old.config.collection,abi:artifact.abi,functionName:'ownerOf',args:[id]});
  assert.equal(owner.toLowerCase(),old.account.toLowerCase());
}
state.afterOpening={block:String(block.number),timestamp:String(block.timestamp),tokenId:String(event.args.tokenId),validPow:true};
state.userCatsPreserved=[1,2]; state.completedAt=new Date().toISOString(); state.status='passed'; save();
writeFileSync('reports/scheduled-opening-sepolia.json',JSON.stringify(state,null,2));
console.log('SCHEDULED_OPENING_SEPOLIA_PASSED');
