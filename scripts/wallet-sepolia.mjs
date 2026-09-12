import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import { createPublicClient, http, encodeDeployData, formatEther } from 'viem';
import { baseSepolia } from 'viem/chains';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(repo, 'output/wallet-sepolia');
const account = '0x12B967b8b9eddB5185922375F1f7dC1F3791d9Dc';
const origin = 'http://127.0.0.1:5180';
const secret = randomBytes(32).toString('hex');
const client = createPublicClient({ chain: baseSepolia, transport: http() });
if (await client.getChainId() !== 84532) throw Error('Expected Base Sepolia');
const names = ['TestDex', 'CyberToshiRenderer', 'CyberToshiNFT'];
const artifacts = Object.fromEntries([...names, 'BasedCatToken', 'ToshiBuybackRouter'].map(name => {
  const a = JSON.parse(readFileSync(resolve(repo, `out/${name}.sol/${name}.json`), 'utf8'));
  return [name, { abi: a.abi, bytecode: a.bytecode.object }];
}));
const manifestPath = resolve(repo, 'deployments/wallet-84532.json');
let state = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { chainId: 84532, account, receipts: [] };
if (state.chainId !== 84532 || state.account.toLowerCase() !== account.toLowerCase()) throw Error('Manifest account or chain mismatch');
mkdirSync(root, { recursive: true });
cpSync(resolve(repo, 'frontend'), root, { recursive: true });
cpSync(resolve(repo, 'scripts/wallet-sepolia.html'), resolve(root, 'deploy.html'));
cpSync(resolve(repo, 'scripts/wallet-sepolia-client.js'), resolve(root, 'deploy.js'));
// This isolated copy can mine on Sepolia; the tracked production preview remains closed.
function writeConfig() {
  writeFileSync(resolve(root, 'public/deployment.json'), JSON.stringify(state.config || {
    chainId: 84532, collection: null, renderer: null, token: null, vault: null,
    testDex: true, rpcUrl: baseSepolia.rpcUrls.default.http[0],
  }, null, 2));
}
writeConfig();
function argsFor(name) {
  if (name !== 'CyberToshiNFT') return [];
  if (!state.TestDex || !state.CyberToshiRenderer) throw Error('Deploy dependencies first');
  return [state.CyberToshiRenderer, state.TestDex, state.TestDex, state.TestDex];
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
    const [token, vault, renderer, interval, supply] = await Promise.all(['bcatToken','buybackRouter','renderer','MIN_MINT_INTERVAL','MAX_SUPPLY'].map(fn => read('CyberToshiNFT', state.CyberToshiNFT, fn)));
    if (interval !== 60n || supply !== 16384n || renderer.toLowerCase() !== state.CyberToshiRenderer.toLowerCase()) throw Error('Collection settings mismatch');
    const [collection, tokenVault, vaultToken, router, weth, factory] = await Promise.all([
      read('BasedCatToken', token, 'collection'), read('BasedCatToken', token, 'vault'),
      ...['token','router','weth','factory'].map(fn => read('ToshiBuybackRouter', vault, fn)),
    ]);
    for (const [actual, expected] of [[collection,state.CyberToshiNFT],[tokenVault,vault],[vaultToken,token],[router,state.TestDex],[weth,state.TestDex],[factory,state.TestDex]])
      if (actual.toLowerCase() !== expected.toLowerCase()) throw Error('Contract binding mismatch');
    state.config = { chainId: 84532, collection: state.CyberToshiNFT, renderer, token, vault, testDex: true, rpcUrl: baseSepolia.rpcUrls.default.http[0] };
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(state, null, 2));
  writeConfig();
  console.log(`Verified ${name}: ${hash}`);
  return state;
}
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5180, strictPort: true }, plugins: [{
  name: 'local-sepolia-wallet',
  configureServer(server) {
    server.middlewares.use('/__test', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.headers.host !== '127.0.0.1:5180' || (req.headers.origin && req.headers.origin !== origin)) throw Error('Local origin required');
        if (req.method === 'GET' && req.url === '/plan') {
          res.end(JSON.stringify({ account, chainId: 84532, secret, artifacts: Object.fromEntries(names.map(n => [n, artifacts[n]])), state, balance: formatEther(await client.getBalance({ address: account })) }));
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
console.log(`MetaMask test deployment: ${origin}/deploy.html`);
console.log(`Expected account: ${account}. Base Sepolia ONLY. No keys requested or stored.`);
