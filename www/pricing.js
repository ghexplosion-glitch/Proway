/* Unit sale prices are captured in each garment; catalog edits do not rewrite orders. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayPricing=factory();})(globalThis,function(){
  'use strict';
  const products=['Butarga','Playera','Short'];
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const defaults=base=>({Butarga:base,Playera:null,Short:null});
  function validPrices(value){return value===undefined||!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===3&&products.every(p=>Object.hasOwn(value,p)&&(value[p]===null||typeof value[p]==='number'&&Number.isFinite(value[p])&&value[p]>=0&&value[p]<=1000000000));}
  function validRow(row){return row.priceMode===undefined||['auto','manual','pending'].includes(row.priceMode)&&typeof row.special==='number'&&Number.isFinite(row.special)&&row.special>=0&&row.special<=1000000000&&(row.priceMode!=='pending'||row.special===0);}
  function capture(row,prices){
    if(row.priceMode==='manual'||row.priceMode===undefined&&row.special!==''&&row.special!==undefined)return {...row,special:Number(row.special),priceMode:'manual'};
    const price=prices[row.product];return {...row,special:price===null||price===undefined?0:round(price),priceMode:price===null||price===undefined?'pending':'auto'};
  }
  const hasPending=order=>(order.rows||[]).some(r=>r.priceMode==='pending');
  function missing(order){const groups=new Map();for(const row of order.rows||[])if(row.priceMode==='pending'){const k=[row.product,row.size,row.cut].join('|');if(!groups.has(k))groups.set(k,{product:row.product,size:row.size,cut:row.cut,qty:0});groups.get(k).qty+=row.qty;}return [...groups.values()];}
  function reprice(order,prices){return (order.rows||[]).map(row=>capture(row,prices));}
  function review(order,prices,legacyBase){const next=reprice(order,prices),unit=r=>r.special===''?legacyBase:r.special;return {id:order.id,rows:next,changed:next.some((r,i)=>r.special!==order.rows[i].special||r.priceMode!==order.rows[i].priceMode),before:round(order.rows.reduce((n,r)=>n+r.qty*unit(r),0)),after:round(next.reduce((n,r)=>n+r.qty*unit(r),0)),missing:missing({rows:next})};}
  return {products,defaults,validPrices,validRow,capture,hasPending,missing,reprice,review};
});
