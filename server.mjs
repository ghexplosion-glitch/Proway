import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'www');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(u.pathname);
    const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const bytes=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(bytes);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Archivo no encontrado');}
});
const port=Number(process.env.PORT||4173);server.listen(port,'0.0.0.0',()=>console.log('Proway: http://localhost:'+port));
