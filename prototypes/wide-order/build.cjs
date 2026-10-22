const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),output=process.argv[2]||path.join(root,'test-results','Proway_Prueba_Pantalla_Amplia.html');
let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
html=html.replace('/*__STYLE__*/',fs.readFileSync(path.join(__dirname,'style.css'),'utf8')).replace('/*__LOGO__*/','data:image/png;base64,'+fs.readFileSync(path.join(root,'www/logo.png')).toString('base64'));
for(const [key,location] of [['JSPDF','www/vendor/jspdf.umd.min.js'],['AUTOTABLE','www/vendor/jspdf.plugin.autotable.min.js'],['EXCELJS','www/vendor/exceljs.min.js'],['PRESENTATION','www/presentation-order.js'],['APP','prototypes/wide-order/app.js']])html=html.replace('/*__'+key+'__*/',()=>fs.readFileSync(path.join(root,location),'utf8').replace(/<\/script/gi,'<\\/script'));
if(html.includes('/*__'))throw Error('Unresolved template marker');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,html);console.log(output);
