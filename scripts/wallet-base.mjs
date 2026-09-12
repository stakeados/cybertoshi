import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import { createPublicClient, http, encodeDeployData, formatEther } from 'viem';
import { base } from 'viem/chains';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(repo, 'output/wallet-base');
const account = '0x12B967b8b9eddB5185922375F1f7dC1F3791d9Dc';
const launch = JSON.parse(readFileSync(resolve(repo, 'launch-config.json')));
if (launch.chainId !== 8453 || launch.account.toLowerCase() !== account.toLowerCase() ||
    Date.parse(launch.opensAtUTC) / 1000 !== launch.mintStartsAt) throw Error('Invalid launch configuration');
const origin = 'http://127.0.0.1:5181';
const secret = randomBytes(32).toString('hex');
const client = createPublicClient({ chain: base, transport: http() });
if (await client.getChainId() !== 8453) throw Error('Expected Base mainnet');
const dex = {
  router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
  weth: '0x4200000000000000000000000000000000000006',
  factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
};
for (const address of Object.values(dex)) {
  const code = await client.getCode({address});
  if (!code || code === '0x') throw Error('Missing mainnet DEX code');
}
const names = ['CyberToshiRenderer', 'CyberToshiNFT'];
const artifacts = Object.fromEntries([...names, 'BasedCatToken', 'ToshiBuybackRouter'].map(name => {
  const a = JSON.parse(readFileSync(resolve(repo, `out/${name}.sol/${name}.json`), 'utf8'));
  return [name, { abi: a.abi, bytecode: a.bytecode.object }];
}));
const manifestPath = resolve(repo, 'deployments/wallet-8453.json');
let state = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { chainId: 8453, account, receipts: [] };
if (state.chainId !== 8453 || state.account.toLowerCase() !== account.toLowerCase()) throw Error('Manifest account or chain mismatch');
mkdirSync(root, { recursive: true });
cpSync(resolve(repo, 'frontend'), root, { recursive: true });
cpSync(resolve(repo, 'scripts/wallet-base.html'), resolve(root, 'deploy.html'));
cpSync(resolve(repo, 'scripts/wallet-base-client.js'), resolve(root, 'deploy.js'));
// Isolated mainnet configuration. Publishing the public app is a separate step.
function writeConfig() {
  writeFileSync(resolve(root, 'public/deployment.json'), JSON.stringify(state.config || {
    chainId: 8453, collection: null, renderer: null, token: null, vault: null,
    testDex: false, rpcUrl: base.rpcUrls.default.http[0],
  }, null, 2));
}
writeConfig();
function argsFor(name) {
  if (name !== 'CyberToshiNFT') return [];
  if (!state.CyberToshiRenderer) throw Error('Deploy renderer first');
  return [state.CyberToshiRenderer, dex.router, dex.weth, dex.factory, BigInt(launch.mintStartsAt)];
}
async function verify(name, hash) {
  if (!names.includes(name) || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw Error('Invalid deployment');
  const tx = await client.getTransaction({ hash });
  const a = artifacts[name];
  if (tx.from.toLowerCase() !== account.toLowerCase() || tx.to !== null || tx.value !== 0n || tx.input.toLowerCase() !== encodeDeployData({ ...a, args: argsFor(name) }).toLowerCase())
    throw Error('Deployment transaction does not match the expected account and compiled contract');
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 120_000 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw Error('Deployment reverted');
  if (!await client.getCode({ address: receipt.contractAddress })) throw Error('No deployed code');
  return receipt;
}
for (const entry of state.receipts) {
  const receipt = await verify(entry.name, entry.hash);
  if (receipt.contractAddress.toLowerCase() !== state[entry.name]?.toLowerCase()) throw Error('Saved address mismatch');
}
async function saveDeployment(name, hash) {
  const r = await verify(name, hash);
  if (state[name] && state[name].toLowerCase() !== r.contractAddress.toLowerCase()) throw Error('A different deployment is already saved');
  state[name] = r.contractAddress;
  if (!state.receipts.some(x => x.hash === hash)) state.receipts.push({ name, hash, block: r.blockNumber.toString(), gasUsed: r.gasUsed.toString() });
  if (names.every(name => state[name])) {
    const read = (name, address, functionName) => client.readContract({ address, abi: artifacts[name].abi, functionName });
    const [token, vault, renderer, interval, supply, opensAt] = await Promise.all(['bcatToken','buybackRouter','renderer','MIN_MINT_INTERVAL','MAX_SUPPLY','mintStartsAt'].map(fn => read('CyberToshiNFT', state.CyberToshiNFT, fn)));
    if (opensAt !== BigInt(launch.mintStartsAt)) throw Error('Opening time mismatch');
    if (interval !== 60n || supply !== 16384n || renderer.toLowerCase() !== state.CyberToshiRenderer.toLowerCase()) throw Error('Collection settings mismatch');
    const [collection, tokenVault, vaultToken, router, weth, factory] = await Promise.all([
      read('BasedCatToken', token, 'collection'), read('BasedCatToken', token, 'vault'),
      ...['token','router','weth','factory'].map(fn => read('ToshiBuybackRouter', vault, fn)),
    ]);
    for (const [actual, expected] of [[collection,state.CyberToshiNFT],[tokenVault,vault],[vaultToken,token],[router,dex.router],[weth,dex.weth],[factory,dex.factory]])
      if (actual.toLowerCase() !== expected.toLowerCase()) throw Error('Contract binding mismatch');
    state.config = { chainId: 8453, collection: state.CyberToshiNFT, renderer, token, vault, testDex: false, rpcUrl: base.rpcUrls.default.http[0] };
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(state, null, 2));
  writeConfig();
  console.log(`Verified ${name}: ${hash}`);
  return state;
}
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5181, strictPort: true }, plugins: [{
  name: 'local-mainnet-wallet',
  configureServer(server) {
    // The local root must guide the user to wallet setup until the replacement
    // collection is verified, rather than showing the production Coming soon screen.
    server.middlewares.use((req, res, next) => {
      const path = req.url?.split('?')[0];
      if (!state.config && (path === '/' || path === '/index.html')) {
        res.statusCode = 302;
        res.setHeader('Location', '/deploy.html');
        res.setHeader('Cache-Control', 'no-store');
        res.end();
        return;
      }
      next();
    });
    server.middlewares.use('/__test', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.headers.host !== '127.0.0.1:5181' || (req.headers.origin && req.headers.origin !== origin)) throw Error('Local origin required');
        if (req.method === 'GET' && req.url === '/plan') {
          res.end(JSON.stringify({ account, chainId: 8453, dex, launch, secret, artifacts: Object.fromEntries(names.map(n => [n, artifacts[n]])), state, balance: formatEther(await client.getBalance({ address: account })) }));
        } else if (req.method === 'POST' && req.url === '/receipt') {
          if (req.headers['x-local-token'] !== secret || req.headers.origin !== origin) throw Error('Invalid local session');
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 2048) throw Error('Request too large'); }
          const { name, hash } = JSON.parse(body);
          res.end(JSON.stringify(await saveDeployment(name, hash)));
        } else { res.statusCode = 404; res.end('{}'); }
      } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.shortMessage || error.message })); }
    });
  },
}] });
await server.listen();
console.log(`MetaMask mainnet deployment: ${origin}/deploy.html`);
console.log(`Expected account: ${account}. Base mainnet: real gas. No keys requested or stored.`);
