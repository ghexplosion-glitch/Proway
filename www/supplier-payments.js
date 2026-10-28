/* Supplier payment balances use the existing expense ledger, including synchronized entries. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwaySupplierPayments=factory();})(globalThis,function(){
  'use strict';
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const category='Sublimación y corte';
  function entries(order,state){return (state.expenses||[]).filter(e=>e.client===order.id&&e.category===category);}
  function status(order,state,settlement){
    const payments=entries(order,state),paidBase=round(payments.reduce((n,e)=>n+(typeof e.baseAmount==='number'?e.baseAmount:e.amount),0));
    const paidTotal=round(payments.reduce((n,e)=>n+e.amount,0)),credit=settlement.base===null?null:round(Math.min(settlement.base,paidBase));
    const remaining=credit===null?null:round(Math.max(0,settlement.base-credit));
    return {payments,paidBase,paidTotal,credit,remaining,paid:remaining===0&&paidBase>0,zero:remaining===0&&!paidBase,
      label:remaining===null?'Tarifa pendiente':remaining===0?(paidBase>0?'Pagado':'Sin costo'):paidBase>0?'Pago parcial':'Pendiente',
      lastDate:payments.map(e=>e.date).sort().at(-1)||''};
  }
  function snapshot(state,ids){
    const wanted=new Set(ids);
    return structuredClone({profile:state.profile?.id||'',orders:state.orders.filter(o=>wanted.has(o.id)).map(o=>({id:o.id,name:o.name,status:o.quoteStatus||'active',rows:o.rows.map(r=>({product:r.product,size:r.size,cut:r.cut,qty:r.qty})),supplier:o.supplier})),
      rates:state.rates,cutPrice:state.cutPrice,shortCosts:state.shortCosts,expenses:(state.expenses||[]).filter(e=>wanted.has(e.client)&&e.category===category)});
  }
  function plan(state,ids,mode,calculate){
    if(!Array.isArray(ids)||!ids.length||ids.length>1000||new Set(ids).size!==ids.length||!['none','added'].includes(mode))throw Error('Selecciona trabajos pendientes.');
    const items=ids.map(id=>{
      const order=state.orders.find(o=>o.id===id);
      if(!order||(order.quoteStatus||'active')!=='active')throw Error('Un pedido ya no está disponible para pagar.');
      const s=status(order,state,calculate(order,state));
      if(s.remaining===null)throw Error('Completa las tarifas de '+order.name+'.');
      if(s.remaining<=0)throw Error(order.name+' ya no tiene saldo pendiente.');
      return {id:order.id,name:order.name,base:s.remaining};
    });
    const base=round(items.reduce((n,item)=>n+item.base,0)),iva=mode==='added'?round(base*.16):0,total=round(base+iva);
    if(!Number.isFinite(total)||total<=0||total>1000000000)throw Error('El importe del pago está fuera del límite permitido.');
    // Cumulative rounding keeps the per-order expenses exactly equal to the combined bill.
    let cumulative=0,previous=0;
    for(const item of items){cumulative=round(cumulative+item.base);const tax=mode==='added'?round(cumulative*.16):0;item.iva=round(tax-previous);item.amount=round(item.base+item.iva);previous=tax;}
    return {items,mode,base,iva,total};
  }
  function paymentEntries(payment,date,note,uuid){
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Escribe una fecha válida.');
    if(typeof note!=='string'||note.length>300)throw Error('La referencia admite hasta 300 caracteres.');
    return payment.items.map(item=>({id:'SP-'+uuid(),date,category,amount:item.amount,baseAmount:item.base,iva:item.iva,client:item.id,
      note:('Pago de trabajo · '+item.name+(note.trim()?' · '+note.trim():'')).slice(0,500)}));
  }
  return {category,entries,status,snapshot,plan,paymentEntries};
});
