import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPublicClient,http,parseAbi,formatEther} from 'viem';
const config=JSON.parse(readFileSync('frontend/public/deployment.json'));
assert.equal(config.chainId,31337,'Only verifies the local sandbox');
const client=createPublicClient({transport:http('http://127.0.0.1:8545')});
assert.equal(await client.getChainId(),31337);
const abis=JSON.parse(readFileSync('frontend/abis.json'));
const read=(kind,fn,args=[])=>client.readContract({address:config[kind==='nft'?'collection':kind],abi:abis[kind],functionName:fn,args});
const [minted,alive,burned,boot]=await Promise.all([read('nft','totalMinted'),read('nft','totalSupply'),read('nft','burnedCount'),read('vault','bootstrapped')]);
assert(minted>=2n&&burned>=1n&&alive===minted-burned&&boot);
const deployment=JSON.parse(readFileSync('deployments/31337.json'));
for(const {name,hash} of deployment.receipts){const tx=await client.getTransaction({hash});const artifact=JSON.parse(readFileSync(`out/${name}.sol/${name}.json`));assert(tx.input.startsWith(artifact.bytecode.object),name+' deployment must match final compiled creation bytecode');}
const pool=await read('vault','pool');
const lp=await client.readContract({address:pool,abi:parseAbi(['function balanceOf(address) view returns (uint256)']),functionName:'balanceOf',args:[config.vault]});assert(lp>0n);
let liveImages=0;
for(let id=1n;id<=minted;id++){try{const uri=await read('nft','tokenURI',[id]);const meta=JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());const svg=Buffer.from(meta.image.split(',')[1],'base64').toString();assert(svg.startsWith('<svg')&&svg.endsWith('</svg>'));assert(meta.attributes.some(a=>a.trait_type==='Serial'&&a.value===String(id)));liveImages++;}catch(error){try{await read('nft','ownerOf',[id]);}catch{continue;}throw error;}}
assert.equal(liveImages,Number(alive));
const sources=Object.fromEntries(['CyberToshiNFT','CyberToshiRenderer','BasedCatToken','ToshiBuybackRouter','TestDex'].map(name=>[name,createHash('sha256').update(readFileSync(`contracts/${name}.sol`)).digest('hex')]));
const report={verifiedAt:new Date().toISOString(),network:'local sandbox only',contracts:config,checks:{deployedCreationBytecodeMatchesArtifacts:true,lifetimeMints:String(minted),livingCats:String(alive),burnedCats:String(burned),poolBootstrapped:boot,lpPermanentlyHeldByVault:formatEther(lp),decodedOnchainImages:liveImages},sourceSHA256:sources};
writeFileSync('output/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.checks,null,2));

