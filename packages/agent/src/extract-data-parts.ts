import type { Message } from '@a2a-js/sdk';

/** Extract JSON object blobs from A2A data parts (typically one DNP envelope). */
export function extractDataPartRecords(message: Message): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const part of message.parts) {
    if (part.kind !== 'data') {
      continue;
    }
    const dataUnknown: unknown = part.data;
    if (typeof dataUnknown === 'object' && dataUnknown !== null && !Array.isArray(dataUnknown)) {
      out.push(dataUnknown as Record<string, unknown>);
    }
  }
  return out;
}
