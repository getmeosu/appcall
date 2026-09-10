import contract from "../../budget-contract.json";

export type OperationBudgetLike = {
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
};

type BudgetContract = {
  maxOperationTimeoutMs: number;
  maxOperationInputBytes: number;
  maxOperationResponseBytes: number;
  rpcEnvelopeOverheadBytes: number;
  connectionGraceMs: number;
};

const configured = contract as BudgetContract;

for (const value of Object.values(configured)) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Runner budget contract must contain positive safe integers.");
  }
}

export const maxOperationTimeoutMs = configured.maxOperationTimeoutMs;
export const maxOperationInputBytes = configured.maxOperationInputBytes;
export const maxOperationResponseBytes = configured.maxOperationResponseBytes;
export const rpcEnvelopeOverheadBytes = configured.rpcEnvelopeOverheadBytes;
export const connectionGraceMs = configured.connectionGraceMs;
export const rpcRequestLimitBytes = maxOperationInputBytes + rpcEnvelopeOverheadBytes;
export const rpcResponseLimitBytes = maxOperationResponseBytes + rpcEnvelopeOverheadBytes;

export function supportsOperationBudget(operation: OperationBudgetLike | undefined): boolean {
  return !!operation
    && Number.isSafeInteger(operation.timeoutMs)
    && operation.timeoutMs > 0
    && operation.timeoutMs <= maxOperationTimeoutMs
    && Number.isSafeInteger(operation.maxInputBytes)
    && operation.maxInputBytes > 0
    && operation.maxInputBytes <= maxOperationInputBytes
    && Number.isSafeInteger(operation.maxResponseBytes)
    && operation.maxResponseBytes > 0
    && operation.maxResponseBytes <= maxOperationResponseBytes;
}

export function operationWireResponseLimit(maxResponseBytes = maxOperationResponseBytes): number {
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > maxOperationResponseBytes) {
    throw new Error("Operation response budget is outside the runner contract.");
  }
  return maxResponseBytes + rpcEnvelopeOverheadBytes;
}

export function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "null");
}
