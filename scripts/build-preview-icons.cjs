// Compose the approved Proway emblem into the existing app-icon system.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({headless:true,executablePath:process.env.PROWAY_CHROME});
 try{
  const page=await browser.newPage(),source='data:image/png;base64,'+fs.readFileSync(path.join(root,'www/logo.png')).toString('base64');
  const icons=await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return [192,512].map(size=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const c=canvas.getContext('2d');c.scale(size/512,size/512);c.fillStyle='#ffffff';c.fillRect(0,0,512,512);
   c.drawImage(image,30,0,134,139,116,64,280,290);c.fillStyle='#172a20';c.textAlign='center';c.font='bold 44px Arial';c.fillText('PROWAY',256,395);
   return {size,data:canvas.toDataURL('image/png').split(',')[1]};
  });},source);
  for(const icon of icons)fs.writeFileSync(path.join(root,'www/prueba/icons/prueba-'+icon.size+'.png'),Buffer.from(icon.data,'base64'));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
