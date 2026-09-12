import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { encodePacked, keccak256 } from "viem";
import { makeInput, hashNonce } from "../frontend/pow.js";
const job = {
  chainId: 8453,
  collection: "0x1111111111111111111111111111111111111111",
  account: "0x2222222222222222222222222222222222222222",
  previous: "0x" + "ab".repeat(32),
  anchorHash: "0x" + "cd".repeat(32),
};
for (const nonce of [
  0n,
  1n,
  255n,
  256n,
  2n ** 64n,
  2n ** 255n,
  2n ** 256n - 1n,
]) {
  const expected = keccak256(
    encodePacked(
      ["uint256", "address", "address", "uint256", "bytes32", "bytes32"],
      [8453n, job.collection, job.account, nonce, job.previous, job.anchorHash],
    ),
  );
  assert.equal(hashNonce(makeInput(job), nonce), expected);
}
const root = "contracts";
for (const f of readdirSync(root)) {
  const content = readFileSync(root + "/" + f, "utf8");
  assert(!/on-chain/i.test(content));
}
for (const name of [
  "CyberToshiNFT",
  "CyberToshiRenderer",
  "ToshiBuybackRouter",
  "BasedCatToken",
]) {
  const a = JSON.parse(readFileSync(`out/${name}.sol/${name}.json`));
  const runtime = (a.deployedBytecode.object.length - 2) / 2,
    init = (a.bytecode.object.length - 2) / 2;
  assert(runtime <= 24576, `${name}: runtime too large`);
  assert(init <= 49152, `${name}: init code too large`);
  console.log(`${name}: runtime ${runtime} bytes; creation ${init} bytes`);
}
console.log(
  "PASS: 7 worker/ABI hash vectors, contract size limits and terminology. Run forge test separately for EVM behavior.",
);
