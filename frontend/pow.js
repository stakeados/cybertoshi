import { encodePacked, hexToBytes, keccak256 } from "viem";
export function makeInput(job) {
  return hexToBytes(
    encodePacked(
      ["uint256", "address", "address", "uint256", "bytes32", "bytes32"],
      [
        BigInt(job.chainId),
        job.collection,
        job.account,
        0n,
        job.previous,
        job.anchorHash,
      ],
    ),
  );
}
export function hashNonce(input, nonce) {
  let n = nonce;
  for (let i = 103; i >= 72; i--) {
    input[i] = Number(n & 255n);
    n >>= 8n;
  }
  return keccak256(input);
}
