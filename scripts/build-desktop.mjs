import {build} from 'esbuild';import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
await mkdir('desktop-build',{recursive:true});await build({entryPoints:['desktop/main.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:'desktop-build/main.cjs',external:['electron','bufferutil','utf-8-validate']});await copyFile('desktop/preload.cjs','desktop-build/preload.cjs');await cp('desktop/ui','desktop-build/ui',{recursive:true});console.log('Desktop bundle ready');

await writeFile('desktop-build/package.json',JSON.stringify({name:'remote-desktop-companion',version:'0.2.0',private:true,main:'main.cjs',description:'Remote desktop companion preview',author:'Remote Desktop',dependencies:{}}));
