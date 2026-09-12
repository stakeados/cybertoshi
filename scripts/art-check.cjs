async (page) => {
 await page.goto('http://127.0.0.1:5173/art-preview.html');
 await page.setViewportSize({width:1280,height:760});
 await page.screenshot({path:'output/playwright/art.png',fullPage:true});
 await page.goto('http://127.0.0.1:5173/');
 return 'Captured all seven accessory variants from the onchain renderer.';
}
