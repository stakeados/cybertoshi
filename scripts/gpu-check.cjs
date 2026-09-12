async (page) => {
 await page.reload();
 await page.locator('#engine').waitFor();
 const result=await page.evaluate(async()=>{
  const {createGpuMiner}=await import('/gpu.js');
  const {makeInput,hashNonce}=await import('/pow.js');
  const job={chainId:31337,collection:'0x1234567890123456789012345678901234567890',account:'0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',previous:'0x'+'12'.repeat(32),anchorHash:'0x'+'34'.repeat(32)};
  const miner=await createGpuMiner(job);
  try {
   const input=makeInput(job);let checked=0;
   for(const nonce of [0n,0xfffffff0n,0x12345678900000000n]) {
    const hashes=await miner.batch(nonce,128);
    for(let i=0;i<hashes.length;i++) {if(hashes[i]!==hashNonce(input,nonce+BigInt(i)))throw Error('Digest mismatch');checked++;}
   }
   return {checked,webgpu:true};
  }finally{miner.destroy();}
 });
 return result;
}
