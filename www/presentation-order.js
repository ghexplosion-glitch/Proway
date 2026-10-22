/* Presentation order only: never mutates stored garment rows or their prices. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayPresentation=factory();})(globalThis,function(){
  'use strict';
  const collator=new Intl.Collator('es-MX',{numeric:true,sensitivity:'base'});
  const names=['XCH','CH','M','G','XG','XXG','XXXG','4XG','5XG','6XG'];
  const aliases={XS:'XCH',S:'CH',SM:'CH',L:'G',XL:'XG',XXL:'XXG','2XL':'XXG','2XG':'XXG','3XL':'XXXG','3XG':'XXXG','4XL':'4XG','5XL':'5XG','6XL':'6XG'};
  function sizeKey(value){let s=String(value??'').trim().toUpperCase().replace(/^TALLA\s*/,'').replace(/\s+/g,'');s=aliases[s]||s;if(/^\d+(\.\d+)?$/.test(s))return [0,Number(s),''];const n=names.indexOf(s);if(n>=0)return [1,n,''];if(s==='AMEDIDA'||!s)return [3,0,s];return [2,0,s];}
  function compareSizes(a,b){const x=sizeKey(a),y=sizeKey(b);return x[0]-y[0]||x[1]-y[1]||collator.compare(x[2],y[2]);}
  function person(row){return String(row.person||row.printed||'Sin nombre').trim();}
  function sorted(rows,mode='size'){
    return rows.map((row,index)=>({row,index})).sort((a,b)=>{
      const bySize=compareSizes(a.row.size,b.row.size),byPerson=collator.compare(person(a.row),person(b.row));
      return (mode==='person'?byPerson||bySize:bySize||byPerson)||collator.compare(a.row.product,b.row.product)||a.index-b.index;
    }).map(x=>({...x.row}));
  }
  function numbered(rows,mode='size'){return sorted(rows,mode).map((row,index)=>({...row,lineNo:index+1}));}
  function pieces(rows,mode='size'){
    const result=[];for(const row of sorted(rows,mode))for(let unit=0;unit<row.qty;unit++)result.push({...row,lineNo:result.length+1,unit:unit+1,qty:1});return result;
  }
  return {sizeKey,compareSizes,sorted,numbered,pieces,person};
});
