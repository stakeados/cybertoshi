import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
const $ = id => document.getElementById(id);
const names = ['CyberToshiRenderer', 'CyberToshiNFT'];
const labels = ['Generador de imágenes', 'Colección + BCAT + tesorería'];
const discovered = new Map();
let plan, provider, wallet, connected = false, busy = false;
function discover(info, value) {
  if (!discovered.has(info.uuid)) {
    discovered.set(info.uuid, value);
    const option = document.createElement('option'); option.value = info.uuid; option.textContent = info.name;
    $('providers').append(option);
    if (info.rdns === 'io.metamask') $('providers').value = info.uuid;
  }
  $('connect').disabled = !plan || busy;
}
addEventListener('eip6963:announceProvider', event => discover(event.detail.info, event.detail.provider));
dispatchEvent(new Event('eip6963:requestProvider'));
setTimeout(() => {
  if (!discovered.size && window.ethereum) discover({ uuid: 'injected', name: 'Wallet del navegador' }, window.ethereum);
  if (!discovered.size && !plan?.state.config) $('status').textContent = 'Abre esta dirección en el navegador donde tienes MetaMask instalado.';
}, 800);
function render() {
  $('steps').replaceChildren(...names.map((name, i) => {
    const item = document.createElement('li'); item.textContent = labels[i] + (plan.state[name] ? ' — verificado ' : ' — pendiente');
    const receipt = plan.state.receipts.find(r => r.name === name);
    if (receipt) { const link = document.createElement('a'); link.href = `https://basescan.org/tx/${receipt.hash}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Ver transacción'; item.append(link); }
    return item;
  }));
  $('deploy').disabled = !connected || busy || !!plan.state.config;
  $('connect').disabled = busy || !discovered.size;
  $('providers').disabled = busy || connected;
  $('open').hidden = !plan.state.config;
  if (plan.state.config) $('status').textContent = 'Despliegue verificado en Base mainnet. Las direcciones están guardadas; falta verificar el código en el explorador y publicar la configuración de la web.';
}
async function guard() {
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (accounts[0]?.toLowerCase() !== plan.account.toLowerCase()) throw Error('Selecciona la cuenta autorizada en MetaMask.');
  if (Number(await provider.request({ method: 'eth_chainId' })) !== 8453) throw Error('Selecciona Base mainnet en MetaMask.');
}
async function save(name, hash) {
  const response = await fetch('/__test/receipt', { method: 'POST', headers: { 'content-type': 'application/json', 'x-local-token': plan.secret }, body: JSON.stringify({ name, hash }) });
  const result = await response.json(); if (!response.ok) throw Error(result.error);
  plan.state = result; localStorage.removeItem(`cybertoshi:8453:${plan.account}:${name}`);
}
$('connect').onclick = async () => {
  busy = true; render();
  try {
    provider = discovered.get($('providers').value);
    await provider.request({ method: 'eth_requestAccounts' });
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] }); }
    catch (error) {
      if (error.code !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x2105', chainName: 'Base mainnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
    }
    await guard(); wallet = createWalletClient({ account: plan.account, chain: base, transport: custom(provider) });
    connected = true;
    const changed = () => { connected = false; $('status').textContent = 'La cuenta o red cambió. Vuelve a conectar.'; render(); };
    provider.on?.('accountsChanged', changed); provider.on?.('chainChanged', changed);
    $('status').textContent = 'MetaMask conectado. Firma el siguiente despliegue cuando estés listo.';
  } catch (error) { connected = false; $('status').textContent = error.shortMessage || error.message; }
  finally { busy = false; render(); }
};
$('deploy').onclick = async () => {
  busy = true; render();
  try {
    await guard();
    const name = names.find(n => !plan.state[n]) || 'CyberToshiNFT';
    const key = `cybertoshi:8453:${plan.account}:${name}`;
    let hash = plan.state.receipts.find(r => r.name === name)?.hash || localStorage.getItem(key);
    if (!hash) {
      if (Date.now() >= plan.launch.mintStartsAt * 1000) throw Error('La hora de apertura ya pasó. Revisa el lanzamiento antes de firmar.');
      const args = name === 'CyberToshiNFT' ? [plan.state.CyberToshiRenderer, plan.dex.router, plan.dex.weth, plan.dex.factory, BigInt(plan.launch.mintStartsAt)] : [];
      $('status').textContent = `Confirma ${labels[names.indexOf(name)]} en MetaMask. Valor enviado: 0 ETH; solo gas real de Base.`;
      hash = await wallet.deployContract({ ...plan.artifacts[name], args });
      localStorage.setItem(key, hash);
    }
    $('status').textContent = `Esperando dos confirmaciones y verificando el contrato…\n${hash}`;
    await save(name, hash);
    $('status').textContent = 'Contrato verificado. Puedes firmar el siguiente.';
  } catch (error) { $('status').textContent = error.shortMessage || error.message; }
  finally { busy = false; render(); }
};
try {
  const response = await fetch('/__test/plan'); plan = await response.json();
  if (!response.ok) throw Error(plan.error);
  $('account').textContent = plan.account; $('balance').textContent = `${plan.balance} ETH en Base`;
  $('opening').textContent = `Apertura fija: ${plan.launch.opensAtMadrid} (${plan.launch.opensAtUTC}). El contrato impide mintear antes.`;
  $('status').textContent = 'Conecta MetaMask para continuar.'; render();
} catch (error) { $('status').textContent = error.message; }
