import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const installed=join(homedir(),'.foundry','bin',process.platform==='win32'?'forge.exe':'forge');
const forge=process.env.FORGE_BIN||(existsSync(installed)?installed:'forge');
for(const [cmd,args] of [[forge,['test','--summary']],[process.execPath,['scripts/export-abi.mjs']],[process.execPath,['scripts/check.mjs']]]){
const result=spawnSync(cmd,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
