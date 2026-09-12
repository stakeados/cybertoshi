import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createPublicClient,http,toHex,keccak256} from 'viem';
const cfg=JSON.parse(readFileSync('frontend/public/deployment.json','utf8'));
if(cfg.chainId!==31337) throw Error('Use the local renderer for preview generation');
const abi=JSON.parse(readFileSync('out/CyberToshiRenderer.sol/CyberToshiRenderer.json','utf8')).abi;
const client=createPublicClient({transport:http(cfg.rpcUrl)});
mkdirSync('output/art',{recursive:true});
const seen=new Set();let images=[];
for(let i=1;seen.size<7&&i<1000;i++){
 const seed=keccak256(toHex(i,{size:32}));
 const traits=await client.readContract({address:cfg.renderer,abi,functionName:'traits',args:[seed]});
 const gear=Number(traits[5]);if(seen.has(gear))continue;seen.add(gear);
 const svg=await client.readContract({address:cfg.renderer,abi,functionName:'renderSVG',args:[BigInt(i),seed]});
 writeFileSync(`output/art/gear-${gear}.svg`,svg);
 if(gear===0)writeFileSync('frontend/public/cat.svg',svg);
 images.push(`<figure>${svg}<figcaption>Gear ${gear} · Tier ${traits[0]} · Seed ${i}</figcaption></figure>`);
}
writeFileSync('frontend/art-preview.html',`<!doctype html><html lang="en"><meta charset="utf-8"><title>Renderer inspection</title><style>body{background:#0b1525;color:white;font:14px system-ui;display:flex;flex-wrap:wrap;gap:20px}figure{margin:0;width:220px}svg{width:100%}</style>${images.join('')}</html>`);
console.log('Exported seven accessory examples from the deployed immutable renderer.');
