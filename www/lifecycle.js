/* Derived work queues. Closing a job never deletes or moves its accounting records. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayLifecycle=factory();})(globalThis,function(){
  'use strict';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const quantity=o=>(o.rows||[]).reduce((n,r)=>n+r.qty,0);
  const active=o=>(o.quoteStatus||'active')==='active';
  const closed=(o,balance)=>active(o)&&quantity(o)>0&&o.confirmed&&o.delivered&&Number.isFinite(balance)&&balance<=.005;
  function closedDate(o){return [...(o.shipment?.events||[]).filter(e=>e.status==='Entregado').map(e=>e.date),...(o.advanceRecord&&!o.advanceRecord.simulated?[o.advanceRecord.date]:[]),...(o.payments||[]).filter(p=>!p.simulated).map(p=>p.date)].filter(Boolean).map(s=>s.slice(0,10)).sort().at(-1)||'';}
  function nextStage(o){
    if(!active(o)||o.delivered)return null;
    if(!o.startDate)return {key:'validation',label:'Validar inicio',department:'diseño',flag:''};
    return [{key:'design',label:'Diseño e impresión',department:'diseño',flag:'released',days:5},{key:'sewing',label:'Costura y armado',department:'costura',flag:'sewn',days:15},{key:'packing',label:'Calidad y empaque',department:'empaque',flag:'packed',days:18},{key:'shipping',label:'Salida del paquete',department:'envío',flag:'shipped',days:20},{key:'delivery',label:'Entrega de paquetería',department:'envío',flag:'delivered'}].find(s=>!o[s.flag])||null;
  }
  function alerts(orders,businessDue,day=today()){
    const soon=businessDue(day,2);
    return orders.filter(o=>active(o)&&quantity(o)>0&&!o.delivered).map(o=>{
      const stage=nextStage(o);if(!stage||stage.key==='validation')return null;
      const due=stage.key==='delivery'?(o.shipment?.eta||''):businessDue(o.startDate,stage.days);
      if(!due||due>soon)return null;
      return {id:o.id,name:o.name,...stage,due,status:due<day?'Atrasado':due===day?'Vence hoy':'Próximo a vencer'};
    }).filter(Boolean).sort((a,b)=>a.due.localeCompare(b.due)||a.name.localeCompare(b.name));
  }
  function repeat(order,fresh,nextRowId,day=today()){
    for(const key of ['name','contact','phone','address','payerType','vatMode','showVat','fiscal','images','additionalDesigns','shippingQuote'])if(order[key]!==undefined)fresh[key]=structuredClone(order[key]);
    fresh.rows=(order.rows||[]).map(row=>({...structuredClone(row),id:nextRowId()}));
    fresh.orderDate=day;fresh.source='Pedido repetido';fresh.sourceNote='Plantilla del pedido '+order.id+'. Revisa prendas, precios y diseño antes de aprobar.';
    return fresh;
  }
  function period(mode,anchor,month,from,to){
    const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
    if(mode==='week'){
      if(!valid(anchor))throw Error('Elige una fecha válida de la semana.');
      const d=new Date(anchor+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);to=d.toISOString().slice(0,10);
    }else if(mode==='month'){
      if(!/^\d{4}-\d{2}$/.test(month||'')||!valid(month+'-01'))throw Error('Elige un mes válido.');
      from=month+'-01';const [y,m]=month.split('-').map(Number);to=new Date(Date.UTC(y,m,0,12)).toISOString().slice(0,10);
    }
    if(!valid(from)||!valid(to)||from>to)throw Error('Revisa las fechas del corte: Desde debe ser anterior o igual a Hasta.');
    return {mode,from,to,label:mode==='week'?'Semanal':mode==='month'?'Mensual':'Personalizado'};
  }
  return {today,quantity,active,closed,closedDate,nextStage,alerts,repeat,period};
});
