async (page) => {
 await page.route('**/gpu.worker.js*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:"Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});\n"+await response.text()});
 });
 await page.reload();
 await page.getByRole('button',{name:'Use local test wallet',exact:true}).click();
 await page.locator('#engine').selectOption('gpu');
 await page.getByRole('button',{name:'Start mining',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#engine').value==='cpu');
 await page.getByRole('button',{name:'Mint this cat',exact:true}).waitFor({state:'visible',timeout:60000});
 await page.getByRole('button',{name:'Discard proof',exact:true}).click();
 if(!await page.locator('#submit').isHidden())throw Error('Proof was not discarded');
 await page.unroute('**/gpu.worker.js*');
 return 'PASS: unavailable GPU automatically falls back to CPU, finds a verified proof and discards it without a transaction.';
}
