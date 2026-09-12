import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist'),prefix='/ipfs/local-preview/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
createServer((req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  let file=resolve(root,pathname.slice(prefix.length)||'index.html');
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(statSync(file).isDirectory())file=resolve(file,'index.html');
  res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch{res.writeHead(404);res.end();}
}).listen(5174,'127.0.0.1',()=>console.log('Local IPFS-path simulation: http://127.0.0.1:5174'+prefix));
