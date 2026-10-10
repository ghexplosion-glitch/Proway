/* Folios and touch intent. No shared counter is needed while offline. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayWorkflow=factory();})(globalThis,function(){
  'use strict';
  const departments=['diseño','costura','empaque','etiquetas','envío'];
  function newFolio(day,uuid,existing=[]){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Fecha inválida para el folio.');
    for(let i=0;i<20;i++){
      const token=uuid().replace(/-/g,'').toUpperCase();
      if(!/^[0-9A-F]{32}$/.test(token))throw Error('Identificador inválido para el folio.');
      const folio='PRW-'+day.slice(0,4)+'-'+token.slice(0,12);
      if(!existing.includes(folio))return folio;
    }
    throw Error('No se pudo generar un folio único. Vuelve a intentar.');
  }
  function documentFolio(source,client){return /^PRW-\d{4}-[0-9A-F]{12}$/.test(client)?client:(source==='cotizacion'?'COT':'DOC')+'-'+client;}
  function missingShipping(order){return [['address','Dirección'],['carrier','Paquetería'],['guide','Número de guía'],['date','Fecha de envío']].filter(([key])=>!String(key==='address'?order.address:order.shipment?.[key]||'').trim()).map(([,label])=>label);}
  function swipeTarget(department,dx,dy,duration){
    if(!Number.isFinite(duration)||duration<30||duration>900||Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.6)return null;
    const index=departments.indexOf(department),next=index+(dx<0?1:-1);
    return index<0?null:departments[next]||null;
  }
  return {departments,newFolio,documentFolio,missingShipping,swipeTarget};
});
