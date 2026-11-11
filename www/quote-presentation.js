/* Customer document helpers. Business details are supplied by the private workspace. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayQuotePresentation=factory();})(globalThis,function(){
  'use strict';
  const defaults={name:'Proway',rfc:'',address:'',phone:'',website:'https://proway.com.mx'};
  const limits={name:200,rfc:20,address:500,phone:30,website:300};
  function normalizeBrand(value={}){const b={};for(const k of Object.keys(defaults))b[k]=String(value?.[k]??defaults[k]).trim();b.name=b.name||defaults.name;b.rfc=b.rfc.toUpperCase();if(b.website&&!/^https?:\/\//i.test(b.website))b.website='https://'+b.website;return b;}
  function validBrand(b){
    if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!Object.hasOwn(defaults,k))||!Object.entries(limits).every(([k,max])=>typeof b[k]==='string'&&b[k].length<=max))return false;
    if(b.rfc&&!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(b.rfc))return false;
    if(b.website){try{const u=new URL(b.website);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return false;}catch{return false;}}
    return Boolean(b.name.trim());
  }
  function brandRows(b){return [['Emisor',b.name],...(b.rfc?[['RFC',b.rfc]]:[]),...(b.address?[['Domicilio',b.address]]:[]),...(b.phone?[['Teléfono',b.phone]]:[]),...(b.website?[['Página web',b.website]]:[])];}
  function dayValid(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;}
  function dateText(day){return dayValid(day)?new Date(day+'T12:00:00Z').toLocaleDateString('es-MX',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}):'';}
  function revisionDay(rev,today){const s=new Map(rev.data?.summary||[]),day=s.get('Fecha de cotización');if(dayValid(day))return day;if(rev.issuedAt&&Number.isFinite(Date.parse(rev.issuedAt)))return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(rev.issuedAt));return today;}
  function brandFromRevision(rev,current){const s=new Map(rev.data?.summary||[]),b=normalizeBrand(current);for(const [key,label] of [['rfc','RFC'],['address','Domicilio'],['phone','Teléfono'],['website','Página web']])if(s.has(label))b[key]=s.get(label);return normalizeBrand(b);}
  const fingerprint=rev=>JSON.stringify({name:rev.name,data:rev.data,images:rev.images||null,additionalDesigns:rev.additionalDesigns||[]});
  return {defaults,normalizeBrand,validBrand,brandRows,dayValid,dateText,revisionDay,brandFromRevision,fingerprint};
});
