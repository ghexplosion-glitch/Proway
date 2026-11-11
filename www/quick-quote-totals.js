/* Estimate customer totals in cents; this never registers money received. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayQuickQuoteTotals=factory();})(globalThis,function(){
  'use strict';
  function calculate(goods,shipping,payerType,vat){
    if(!['pending','PF','PM'].includes(payerType)||typeof vat!=='boolean')throw Error('Revisa el tipo de cliente y el IVA.');
    if([goods,shipping].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1000000000))throw Error('Revisa el importe de las prendas y del envío.');
    const cents=n=>Math.round((n+Number.EPSILON)*100),g=cents(goods),s=cents(shipping),base=g+s;
    const iva=vat?Math.round(base*16/100):0,total=base+iva,retention=payerType==='PM'?Math.round(base/80):0;
    if(total>100000000000)throw Error('El total no puede superar 1,000,000,000 MXN.');
    return {goods:g/100,shipping:s/100,subtotal:base/100,iva:iva/100,total:total/100,retention:retention/100,net:(total-retention)/100};
  }
  return {calculate};
});
