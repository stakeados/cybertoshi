import { Attribution } from 'ox/erc8021';

export const BUILDER_CODE = 'bc_u6c8h11k';
export const BUILDER_DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

export function builderDataSuffix(chainId) {
  return chainId === 8453 || chainId === 84532 ? BUILDER_DATA_SUFFIX : undefined;
}
