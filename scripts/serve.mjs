import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=Number(process.env.PORT||8080);
const host=process.env.HOST||'127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'};

createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname);
    const safe=normalize(pathname).replace(/^([/\\]*\.\.[/\\])+/, '');
    let target=join(root,safe==='/'?'index.html':safe.replace(/^[/\\]/,''));
    let info=await stat(target);
    if(info.isDirectory()){target=join(target,'index.html');info=await stat(target)}
    const body=await readFile(target);
    res.writeHead(200,{'content-type':mime[extname(target).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  }catch{
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');
  }
}).listen(port,host,()=>console.log(`Tichu: http://${host}:${port}`));
