import {createGpuMiner} from './gpu.js';
import {makeInput,hashNonce} from './pow.js';
self.onmessage=async({data:job})=>{
 let gpu;
 try {
  gpu=await createGpuMiner(job);
  self.postMessage({ready:true});
  const input=makeInput(job),target=BigInt(job.target),start=performance.now();
  let nonce=0n,count=0;
  for(;;){
   const hashes=await gpu.batch(nonce);
   for(let i=0;i<hashes.length;i++){
    if(BigInt(hashes[i])<target){
     const found=nonce+BigInt(i);
     if(hashNonce(input,found)!==hashes[i]) throw Error('GPU proof failed CPU verification');
     self.postMessage({found:true,nonce:found.toString(),hash:hashes[i],count:count+i+1,elapsed:performance.now()-start});
     gpu.destroy();return;
    }
   }
   count+=hashes.length;nonce+=BigInt(hashes.length);
   self.postMessage({count,elapsed:performance.now()-start});
  }
 }catch(error){gpu?.destroy();self.postMessage({fallback:true,reason:error.message});}
};
