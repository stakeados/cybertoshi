async (page) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.reload();
  await page.getByText('Test environment: this DEX is a simulator. Test tokens have no monetary value.').waitFor();
  await page.getByRole('button',{name:'Use local test wallet',exact:true}).click();
  await page.getByRole('button',{name:'Start mining',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#mine').disabled);
  const initial=Number(await page.locator('#minted').textContent());
  const initialAlive=Number(await page.locator('#alive').textContent());
  await page.waitForFunction(()=>document.querySelector('#inventory-message').textContent.includes('in this wallet') || document.querySelector('#inventory-message').textContent.includes('does not own'));
  const owned=await page.locator('.cat').count();
  for(let i=1;i<=2;i++){
    await page.locator('#engine').selectOption(i===1?'cpu':'gpu');
    await page.getByRole('button',{name:'Start mining',exact:true}).click();
    await page.getByRole('button',{name:/^Mint this cat/}).waitFor({state:'visible',timeout:60000});
    if(i===2 && await page.locator('#engine').inputValue()!=='gpu') throw Error('GPU fell back: this run does not validate a GPU mint');
    await page.getByRole('button',{name:/^Mint this cat/}).click();
    await page.waitForFunction(n=>document.querySelector('#minted').textContent===String(n),initial+i,{timeout:30000});
    await page.waitForFunction(n=>document.querySelectorAll('.cat').length===n,owned+i);
  }
  await page.getByRole('button',{name:'Claim ETH',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.cat button')[0]?.disabled);
  await page.evaluate(async()=>{const cfg=await fetch('/deployment.json').then(r=>r.json());if(cfg.chainId!==31337)throw Error('Local test chain required');const rpc=async(method,params=[])=>{const r=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json());if(r.error)throw Error(r.error.message);return r.result;};const [from]=await rpc('eth_accounts');const balance=BigInt(await rpc('eth_getBalance',[cfg.vault,'latest']));await rpc('eth_sendTransaction',[{from,to:cfg.vault,value:'0x'+(20000000000000000n-balance).toString(16)}]);});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByRole('button',{name:'Launch community pool',exact:true}).click();
  await page.getByText('Pool launched',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Collect pool fees',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Confirmed:') && !document.querySelector('#collect-fees').disabled);
  await page.waitForFunction(()=>!document.querySelector('.cat button.danger').disabled);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Burn for BCAT',exact:true}).first().click();
  await page.waitForFunction(n=>document.querySelector('#alive').textContent===String(n),initialAlive+1);
  await page.waitForFunction(n=>document.querySelectorAll('.cat').length===n,owned+1);
  await page.setViewportSize({width:1280,height:1000});
  await page.screenshot({path:'output/playwright/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/mobile.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow||errors.length)throw Error(JSON.stringify({overflow,errors}));
  await page.setViewportSize({width:1280,height:1000});
  return 'PASS: CPU and GPU mined production-contract NFTs; wallet transactions, rent claim, community bootstrap, burn, desktop/mobile layout. Local chain and test DEX only.';
}

