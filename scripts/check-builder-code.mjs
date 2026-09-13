import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, custom, encodeFunctionData, decodeFunctionData } from 'viem';
import { base, baseSepolia, foundry } from 'viem/chains';
import { Attribution } from 'ox/erc8021';
import { BUILDER_CODE, builderDataSuffix } from '../frontend/builder-code.js';

const abis = JSON.parse(readFileSync(new URL('../frontend/abis.json', import.meta.url)));
const account = '0x1111111111111111111111111111111111111111';
const address = '0x2222222222222222222222222222222222222222';
const calls = [
  ['nft', 'mine', [17n, 123n, `0x${'ab'.repeat(32)}`], 1000000000000000n],
  ['nft', 'burn', [1n]],
  ...['bootstrapCommunityLiquidity', 'checkpoint', 'collectPoolFees', 'executeBuyback'].map(fn => ['vault', fn, []]),
];
for (const chain of [base, baseSepolia, foundry]) {
  const captured = [];
  let callResult = '0x';
  const transport = custom({ request: async ({method, params}) => {
    if (method === 'eth_chainId') return `0x${chain.id.toString(16)}`;
    if (method === 'eth_call' || method === 'eth_sendTransaction') {
      captured.push({method, tx: params[0]});
      // Supply ABI-shaped mock results. This test checks transaction encoding,
      // not contract execution or Base's external attribution indexer.
      return method === 'eth_call' ? callResult : `0x${'12'.repeat(32)}`;
    }
    throw Error(`Unexpected RPC method: ${method}`);
  }});
  const client = createPublicClient({chain, transport});
  const wallet = createWalletClient({chain, transport, dataSuffix: builderDataSuffix(chain.id)});
  for (const [kind, functionName, args, value] of calls) {
    const abi = abis[kind];
    callResult = functionName === 'mine' ? `0x${'0'.repeat(63)}1` : '0x';
    const plain = encodeFunctionData({abi, functionName, args});
    const {request} = await client.simulateContract({address, abi, functionName, args, value, account, dataSuffix: builderDataSuffix(chain.id)});
    await wallet.writeContract(request);
    const [simulation, submission] = captured.splice(0);
    const suffix = builderDataSuffix(chain.id);
    const expected = plain + (suffix?.slice(2) ?? '');
    assert.equal(simulation.tx.data, expected);
    assert.equal(submission.tx.data, expected, 'suffix must appear exactly once');
    assert.equal(submission.tx.to.toLowerCase(), address);
    assert.equal(BigInt(submission.tx.value ?? 0), value ?? 0n);
    assert.deepEqual(decodeFunctionData({abi, data: submission.tx.data}), decodeFunctionData({abi, data: plain}));
    if (suffix) assert.deepEqual(Attribution.fromData(submission.tx.data)?.codes, [BUILDER_CODE]);
    else assert.equal(Attribution.fromData(submission.tx.data), undefined);
  }
}
console.log('PASS: all 6 app actions simulate and submit identical calldata; builder attribution once on Base and Sepolia, absent locally; destinations, arguments and ETH unchanged. No transactions broadcast.');
