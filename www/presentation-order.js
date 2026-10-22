/* Presentation order only: never mutates stored garment rows or their prices. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayPresentation=factory();})(globalThis,function(){
  'use strict';
  const collator=new Intl.Collator('es-MX',{numeric:true,sensitivity:'base'});
  const names=['XCH','CH','M','G','XG','XXG','XXXG','4XG','5XG','6XG'];
  const aliases={XS:'XCH',S:'CH',SM:'CH',L:'G',XL:'XG',XXL:'XXG','2XL':'XXG','2XG':'XXG','3XL':'XXXG','3XG':'XXXG','4XL':'4XG','5XL':'5XG','6XL':'6XG'};
  function sizeKey(value){let s=String(value??'').trim().toUpperCase().replace(/^TALLA\s*/,'').replace(/\s+/g,'');s=aliases[s]||s;if(/^\d+(\.\d+)?$/.test(s))return [0,Number(s),''];const n=names.indexOf(s);if(n>=0)return [1,n,''];if(s==='AMEDIDA'||!s)return [3,0,s];return [2,0,s];}
  function compareSizes(a,b){const x=sizeKey(a),y=sizeKey(b);return x[0]-y[0]||x[1]-y[1]||collator.compare(x[2],y[2]);}
  function person(row){return String(row.person||row.printed||'Sin nombre').trim();}
  function sorted(rows,mode=orderMode){
    return rows.map((row,index)=>({row,index})).sort((a,b)=>{
      const bySize=compareSizes(a.row.size,b.row.size),byPerson=collator.compare(person(a.row),person(b.row));
      return (mode==='person'?byPerson||bySize:bySize||byPerson)||collator.compare(a.row.product,b.row.product)||a.index-b.index;
    }).map(x=>({...x.row}));
  }
  function numbered(rows,mode=orderMode){return sorted(rows,mode).map((row,index)=>({...row,lineNo:index+1}));}
  function pieces(rows,mode=orderMode){
    const result=[];for(const row of sorted(rows,mode))for(let unit=0;unit<row.qty;unit++)result.push({...row,lineNo:result.length+1,unit:unit+1,qty:1});return result;
  }
  let orderMode='size',app;
  try{orderMode=localStorage.getItem('proway-list-order')==='person'?'person':'size';}catch{}
  function control(){return '<div class="pia-order-control"><label>Orden de listados<select id="pia-list-order"><option value="size" '+(orderMode==='size'?'selected':'')+'>Talla → Persona</option><option value="person" '+(orderMode==='person'?'selected':'')+'>Persona → Talla</option></select></label><small>N.º es el consecutivo del listado. El número impreso se conserva.</small></div>';}
  function withNumbers(data){return {...data,heads:['N.º',...data.heads],rows:data.rows.map((row,i)=>[i+1,...row]),money:(data.money||[]).map(i=>i+1)};}
  function bind(bridge){app=bridge;document.getElementById('proway-pedidos-preview').addEventListener('change',e=>{if(e.target.id!=='pia-list-order')return;orderMode=e.target.value==='person'?'person':'size';try{localStorage.setItem('proway-list-order',orderMode);}catch{}app.repaint();});
    // One accessible image viewer works for every department and the client quote.
    document.addEventListener('click',e=>{const img=e.target.closest('.pia-art img,.pia-design-card img');if(!img)return;const dialog=document.createElement('dialog');dialog.className='pia-image-dialog';const close=document.createElement('button');close.type='button';close.textContent='Cerrar imagen ×';const view=document.createElement('img');view.src=img.src;view.alt=img.alt;dialog.append(close,view);document.body.append(dialog);close.onclick=()=>dialog.close();dialog.addEventListener('click',ev=>{if(ev.target===dialog)dialog.close();});dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();});
    document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.pia-art img,.pia-design-card img')){e.preventDefault();e.target.click();}});
  }
  function images(){document.querySelectorAll('.pia-art img,.pia-design-card img').forEach(img=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Ampliar '+img.alt);});}
  return {control,withNumbers,bind,images,getMode:()=>orderMode,sizeKey,compareSizes,sorted,numbered,pieces,person};
});
