async(page)=>{
 const errors=[];const failures=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:5174/')&&r.status()>=400)failures.push(r.url());});
 await page.goto('http://127.0.0.1:5174/ipfs/local-preview/');
 await page.getByRole('button',{name:'Use local test wallet',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#mint-price').textContent==='0.001');
 for(const engine of ['cpu','gpu']){
  await page.locator('#engine').selectOption(engine);
  await page.getByRole('button',{name:'Start mining',exact:true}).click();
  await page.getByRole('button',{name:/^Mint this cat/}).waitFor({state:'visible',timeout:60000});
  if(!await page.locator('#submit').textContent().then(s=>s.includes('0.001 ETH')))throw Error('Missing quoted price');
  if(await page.locator('#engine').inputValue()!==engine)throw Error('Unexpected engine fallback');
  await page.getByRole('button',{name:'Discard proof',exact:true}).click();
 }
 if(errors.length||failures.length)throw Error(JSON.stringify({errors,failures}));
 await page.goto('http://127.0.0.1:5173/');
 return 'PASS: production build at nested IPFS-style path; config, assets, CPU and GPU proofs, explicit mint price. No paid transactions.';
}
