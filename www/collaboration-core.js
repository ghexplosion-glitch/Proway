/* Pure synchronization rules. Shared by the app and meaningful offline tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwaySyncCore=factory();})(globalThis,function(){
  'use strict';
  const settingKeys=['basePrice','cutPrice','rates','shortCosts','issuer','calendar','isrControl','designs','expenses'];
  // JSONB may return object keys in a different order. Order is meaningful only in arrays.
  function equal(a,b){
    if(a===b||(a==null&&b==null))return true;
    if(a==null||b==null||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b)){
      if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
      for(let i=0;i<a.length;i++)if(!equal(a[i],b[i]))return false;
      return true;
    }
    const keys=Object.keys(a).filter(k=>a[k]!==undefined),other=Object.keys(b).filter(k=>b[k]!==undefined);
    return keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
  }
  const clone=x=>structuredClone(x);
  function settings(state){return Object.fromEntries(settingKeys.map(k=>[k,clone(state[k]??(['designs','expenses'].includes(k)?[]:null))]));}
  function difference(data,base){const patch={},expected={};for(const k of Object.keys(data)){if(k==='additionalDesigns'&&equal(data[k]??[],base?.[k]??[]))continue;if(!equal(data[k],base?.[k])){patch[k]=clone(data[k]);expected[k]=clone(base?.[k]??null);}}return {patch,expected};}
  function guardsFor(patch,base){
    const guards={};if(!base)return guards;
    const critical=['rows','images','additionalDesigns','name','contact','phone','address','orderDate','dataOk','confirmed','designOk','paymentOk','advance','advanceDate','advanceIsr','payerType','vatMode','startDate'];
    let keys=[];
    if(critical.some(k=>Object.hasOwn(patch,k)))keys=['dataOk','confirmed','designOk','paymentOk','startDate','released','sewn','packed','shipped','delivered'];
    else if(['released','sewn','packed','shipped','delivered','shipment'].some(k=>Object.hasOwn(patch,k)))keys=['rows','images','additionalDesigns','startDate','released','sewn','packed','shipped','delivered'];
    for(const k of keys)if(!Object.hasOwn(patch,k))guards[k]=clone(base[k]??null);
    return guards;
  }
  function pending(id,data,base,old,uuid){
    const diff=difference(data,base?.data);if(!Object.keys(diff.patch).length)return null;
    if(old?.operationId&&old?.patch&&equal(old.desired,data))return clone(old);
    return {operationId:uuid(),baseVersion:base?.version||0,expected:diff.expected,patch:diff.patch,
      guards:id==='settings'?{}:guardsFor(diff.patch,base?.data),desired:clone(data)};
  }
  function prepare(meta,state,uuid){
    const next=clone(meta);next.pending={};
    for(const data of state.orders){const q=pending(data.id,data,next.bases[data.id],meta.pending?.[data.id],uuid);if(q)next.pending[data.id]=q;}
    if(meta.role==='admin'){const q=pending('settings',settings(state),next.settingsBase,meta.pending?.settings,uuid);if(q)next.pending.settings=q;}
    return next;
  }
  function rebase(current,comparison,remote){
    if(!current)return clone(remote);const result=clone(remote);
    for(const k of Object.keys(current))if(!equal(current[k],comparison?.[k])&&!equal(current[k],remote[k]))result[k]=clone(current[k]);
    return result;
  }
  function stateFrom(baseState,meta){
    const state=clone(baseState),existing=new Map(state.orders.map(o=>[o.id,o]));
    const ids=new Set([...Object.keys(meta.bases),...Object.keys(meta.pending).filter(k=>k!=='settings')]);
    state.orders=[...ids].sort().map(id=>clone(meta.pending[id]?.desired||meta.bases[id]?.data||existing.get(id))).filter(Boolean);
    if(!state.orders.length)state.orders=baseState.orders;
    state.orders=state.orders.map(o=>({...o,additionalDesigns:o.additionalDesigns||[]}));
    if(meta.role==='admin')Object.assign(state,clone(meta.pending.settings?.desired||meta.settingsBase?.data||settings(state)));
    else{state.basePrice=0;state.cutPrice=0;state.rates=[];state.shortCosts={};state.designs=[];state.expenses=[];state.issuer={name:'',rfc:'',cp:'',regime:'626 · Régimen Simplificado de Confianza',legalType:'PF'};state.isrControl={month:new Date().toISOString().slice(0,7),external:{}};if(meta.settingsBase?.data?.calendar)state.calendar=clone(meta.settingsBase.data.calendar);state.jobs=[];state.revisions=[];state.exportsMade=[];}
    state.profile={id:meta.userId,name:meta.displayName||'Proway'};
    if(meta.events)state.activity=meta.events.map(e=>({client:e.client||state.orders[0].id,action:(e.actor?e.actor+' · ':'')+e.action,time:e.time,section:'equipo'}));
    return state;
  }
  return {equal,clone,settings,difference,guardsFor,prepare,rebase,stateFrom};
});
