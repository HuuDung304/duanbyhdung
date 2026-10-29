import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function files(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]))).flat();}
for(const file of (await files('src/js')).filter(p=>p.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log('JavaScript syntax checked.');
