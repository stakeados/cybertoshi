import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createPublicClient,http,isAddress} from 'viem';
const issues=[];
const cfg=JSON.parse(readFileSync('frontend/public/deployment.json','utf8'));
const decisions=JSON.parse(readFileSync('release-decisions.json','utf8'));
for(const [key,value] of Object.entries(decisions)) if(value!==true)issues.push(`Pending: ${key}`);
if(cfg.chainId!==8453||cfg.testDex!==false)issues.push('Production requires Base 8453 and testDex=false.');
for(const key of ['collection','renderer','token','vault'])if(!isAddress(cfg[key]||''))issues.push(`Invalid ${key}`);
if(!cfg.rpcUrl||new URL(cfg.rpcUrl).protocol!=='https:')issues.push('Production RPC must use HTTPS.');
if(!existsSync('dist/index.html'))issues.push('Build the website first.');
else {
 const built=JSON.parse(readFileSync('dist/deployment.json','utf8'));
 if(JSON.stringify(built)!==JSON.stringify(cfg))issues.push('Build configuration is stale. Rebuild after deployment.');
 if(/(?:src|href)="\/(?!\/)/.test(readFileSync('dist/index.html','utf8')))issues.push('Root-relative asset URL is not portable to IPFS paths.');
 const files=readdirSync('dist/assets');
 for(const worker of ['miner.worker-','gpu.worker-'])if(!files.some(f=>f.startsWith(worker)))issues.push(`Missing ${worker} bundle`);
}
if(cfg.chainId===8453&&!cfg.testDex&&issues.length===0){
 const client=createPublicClient({transport:http(cfg.rpcUrl)});
 if(await client.getChainId()!==8453)issues.push('RPC chain mismatch.');
 const abis=JSON.parse(readFileSync('frontend/abis.json','utf8'));
 for(const key of ['collection','renderer','token','vault'])if(!await client.getCode({address:cfg[key]}))issues.push(`No deployed code: ${key}`);
 for(const [fn,key] of [['renderer','renderer'],['bcatToken','token'],['buybackRouter','vault']]){
  const value=await client.readContract({address:cfg.collection,abi:abis.nft,functionName:fn});
  if(value.toLowerCase()!==cfg[key].toLowerCase())issues.push(`Contract mismatch: ${key}`);
 }
}
if(issues.length){console.error('NOT READY FOR PUBLIC LAUNCH\n'+issues.map(s=>'- '+s).join('\n'));process.exitCode=1;}
else console.log('Configuration checks passed. This does not replace source verification or a security review.');
