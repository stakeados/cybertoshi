import { makeInput, hashNonce } from './pow.js';

// Keccak-f1600, using pairs of u32 because WGSL has no portable u64.
const rotations = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const constants = ['0000000000000001','0000000000008082','800000000000808a','8000000080008000','000000000000808b','0000000080000001','8000000080008081','8000000000008009','000000000000008a','0000000000000088','0000000080008009','000000008000000a','000000008000808b','800000000000008b','8000000000008089','8000000000008003','8000000000008002','8000000000000080','000000000000800a','800000008000000a','8000000080008081','8000000000008080','0000000080000001','8000000080008008'];
const shader = `
@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> base: vec4<u32>;
const ROT = array<u32,25>(${rotations.map(n=>n+'u').join(',')});
const RC = array<vec2<u32>,24>(${constants.map(h=>`vec2<u32>(0x${h.slice(8)}u,0x${h.slice(0,8)}u)`).join(',')});
fn rol(v:vec2<u32>, r:u32) -> vec2<u32> {
 if(r==0u){return v;} if(r==32u){return v.yx;}
 if(r<32u){return (v<<vec2<u32>(r)) | (v.yx>>vec2<u32>(32u-r));}
 let n=r-32u; return (v.yx<<vec2<u32>(n)) | (v>>vec2<u32>(32u-n));
}
fn permute(state:ptr<function,array<vec2<u32>,25>>) {
 for(var round=0u;round<24u;round++){
  var c:array<vec2<u32>,5>; var b:array<vec2<u32>,25>;
  for(var x=0u;x<5u;x++){c[x]=(*state)[x]^(*state)[x+5u]^(*state)[x+10u]^(*state)[x+15u]^(*state)[x+20u];}
  for(var x=0u;x<5u;x++){
   let d=c[(x+4u)%5u]^rol(c[(x+1u)%5u],1u);
   for(var y=0u;y<5u;y++){let i=x+5u*y;b[y+5u*((2u*x+3u*y)%5u)]=rol((*state)[i]^d,ROT[i]);}
  }
  for(var y=0u;y<5u;y++){for(var x=0u;x<5u;x++){(*state)[x+5u*y]=b[x+5u*y]^((~b[(x+1u)%5u+5u*y])&b[(x+2u)%5u+5u*y]);}}
  (*state)[0]=(*state)[0]^RC[round];
 }
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 if(gid.x>=base.y){return;}
 var a:array<vec2<u32>,25>;
 for(var i=0u;i<17u;i++){a[i]=vec2<u32>(input[2u*i],input[2u*i+1u]);}
 let n=base.x+gid.x;
 a[12].y=((n&255u)<<24u)|((n&65280u)<<8u)|((n>>8u)&65280u)|(n>>24u);
 permute(&a);
 for(var i=0u;i<17u;i++){a[i]=a[i]^vec2<u32>(input[34u+2u*i],input[35u+2u*i]);}
 permute(&a);
 for(var i=0u;i<4u;i++){output[gid.x*8u+2u*i]=a[i].x;output[gid.x*8u+2u*i+1u]=a[i].y;}
}`;

export async function createGpuMiner(job) {
 if (!navigator.gpu) throw Error('WebGPU is unavailable');
 const adapter = await navigator.gpu.requestAdapter();
 if (!adapter) throw Error('No WebGPU adapter');
 const device = await adapter.requestDevice();
 let lost = false;
 device.lost.then(()=>{lost=true;});
 try {
  const module = device.createShaderModule({code:shader});
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(m=>m.type==='error');
  if(errors.length) throw Error(errors.map(m=>m.message).join('; '));
  const pipeline = await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
  const capacity=1024;
  const inputBuffer=device.createBuffer({size:272,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const result=device.createBuffer({size:capacity*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const staging=device.createBuffer({size:capacity*32,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  const params=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:inputBuffer}},{binding:1,resource:{buffer:result}},{binding:2,resource:{buffer:params}}]});
  const input=makeInput(job);
  async function batch(nonce,count=capacity) {
   if(lost) throw Error('GPU device lost');
   if(count<1||count>capacity) throw Error('Invalid GPU batch');
   const low=Number(nonce&0xffffffffn);
   count=Math.min(count,0x100000000-low);
   hashNonce(input,nonce);
   const padded=new Uint8Array(272);padded.set(input);padded[168]=1;padded[271]=128;
   device.queue.writeBuffer(inputBuffer,0,padded);
   device.queue.writeBuffer(params,0,new Uint32Array([low,count,0,0]));
   const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();
   pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();
   encoder.copyBufferToBuffer(result,0,staging,0,count*32);device.queue.submit([encoder.finish()]);
   await staging.mapAsync(GPUMapMode.READ,0,count*32);
   const bytes=new Uint8Array(staging.getMappedRange(0,count*32).slice(0));staging.unmap();
   const hashes=Array.from({length:count},(_,i)=>'0x'+Array.from(bytes.subarray(i*32,i*32+32),b=>b.toString(16).padStart(2,'0')).join(''));
   if(hashes[0]!==hashNonce(input,nonce)) throw Error('GPU verification failed');
   return hashes;
  }
  // Verify the two-block digest, endian conversion and low-word boundary.
  for(const nonce of [0n,255n,0xfffffffen,0x100000000n]) {
   const hashes=await batch(nonce,2);
   for(let i=0;i<hashes.length;i++) if(hashes[i]!==hashNonce(input,nonce+BigInt(i))) throw Error('GPU self-test failed');
  }
  return {batch,destroy:()=>device.destroy()};
 } catch(error) {device.destroy();throw error;}
}
