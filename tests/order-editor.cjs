/* Use the same visible person editor as the customer; no legacy add-form shim. */
async function beginSingle(page){
 const parent=page.locator('#pia-person-order');if(!await parent.evaluate(e=>e.open))await parent.locator(':scope > summary').click();
 if(!await page.locator('#pia-person-editor').evaluate(e=>e.open))await page.locator('[data-person-action="new"]').click();await page.locator('[data-person-action="single"]').click();
}
async function addGarment(page,{product='Butarga',cut='Hombre',size='M',qty=1,name='PERSONA DE PRUEBA',color='',design='',notes=''}={}){
 await beginSingle(page);const first=page.locator('[data-person-item]').first();
 for(const [key,value] of Object.entries({product,cut,size}))await first.locator('[data-person-item-field="'+key+'"]').selectOption(value);
 await first.locator('[data-person-item-field="qty"]').fill(String(qty));
 for(const [key,value] of Object.entries({name,color,design,notes}))await page.locator('#pia-person-'+key).fill(value);
 await page.locator('#pia-person-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.getElementById('pia-feedback').textContent.includes(' agregado: ')&&!document.getElementById('pia-person-name').value);
}
module.exports={beginSingle,addGarment};
