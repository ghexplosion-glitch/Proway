/* Production checks and cancellation accounting; usable without a connection. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayOperations=factory();})(globalThis,function(){
  'use strict';
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const emptyQuality=()=>({counts:{},names:false,design:false,notes:'',checkedAt:''});
  function cashReceived(o){return round((o.advanceRecord&&!o.advanceRecord.simulated?o.advanceRecord.amount:0)+(o.payments||[]).filter(p=>!p.simulated).reduce((n,p)=>n+p.amount,0));}
  const refunded=o=>round((o.refunds||[]).reduce((n,p)=>n+p.amount,0));
  const netReceived=o=>round(cashReceived(o)-refunded(o));
  function qualityReady(o){const q=o.quality;return !!q&&o.rows.length>0&&q.names&&q.design&&o.rows.every(r=>q.counts[String(r.id)]===r.qty);}
  function validQuality(q,rows){
    if(q===undefined)return true;
    if(!q||typeof q!=='object'||Array.isArray(q)||!q.counts||typeof q.counts!=='object'||Array.isArray(q.counts)||typeof q.names!=='boolean'||typeof q.design!=='boolean'||typeof q.notes!=='string'||q.notes.length>1000||typeof q.checkedAt!=='string'||(q.checkedAt!==''&&!validDate(q.checkedAt)))return false;
    if(Object.keys(q).some(k=>!['counts','names','design','notes','checkedAt'].includes(k)))return false;
    return Object.entries(q.counts).every(([id,n])=>rows.some(r=>String(r.id)===id)&&Number.isInteger(n)&&n>=0&&n<=10000);
  }
  function validRefunds(o){
    if(o.refunds===undefined)return true;
    if(!Array.isArray(o.refunds)||o.refunds.length>1000)return false;const ids=new Set();
    return o.refunds.every(p=>{if(!p||typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)||ids.has(p.id)||typeof p.amount!=='number'||!Number.isFinite(p.amount)||p.amount<=0||p.amount>1000000000||typeof p.note!=='string'||p.note.length>500||typeof p.date!=='string'||!validDate(p.date)||Object.keys(p).some(k=>!['id','date','amount','note'].includes(k)))return false;ids.add(p.id);return true;})&&refunded(o)<=cashReceived(o);
  }
  function validCancellation(c,status){return c===undefined?status!=='cancelled':!!c&&typeof c==='object'&&!Array.isArray(c)&&typeof c.date==='string'&&(c.date===''||validDate(c.date))&&typeof c.reason==='string'&&c.reason.length<=500&&Object.keys(c).every(k=>['date','reason'].includes(k))&&(status!=='cancelled'||!!c.date&&!!c.reason.trim());}
  function validMilestones(m){return m===undefined||!!m&&typeof m==='object'&&!Array.isArray(m)&&['design','sewing','packing','shipping'].every(k=>typeof m[k]==='string'&&(m[k]===''||validDate(m[k])))&&Object.keys(m).every(k=>['design','sewing','packing','shipping'].includes(k));}
  function timeline(o,businessDue,today){return [['design','Diseño e impresión',5,'released'],['sewing','Costura y armado',15,'sewn'],['packing','Calidad y empaque',18,'packed'],['shipping','Salida del paquete',20,'shipped']].map(([key,label,days,flag])=>{const due=o.startDate?businessDue(o.startDate,days):null,done=!!o[flag],date=o.milestones?.[key]||'';return {key,label,days,due,done,date,status:o.quoteStatus==='cancelled'?'Cancelado':done?'Completado':!due?'Inicio pendiente':today>due?'Atrasado':today===due?'Vence hoy':'Pendiente'};});}
  return {round,emptyQuality,cashReceived,refunded,netReceived,qualityReady,validQuality,validRefunds,validCancellation,validMilestones,timeline};
});
