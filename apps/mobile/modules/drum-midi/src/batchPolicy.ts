// The native batching policy (B24), as pure functions. ios/BatchPolicy.swift is a line-by-line mirror of this file:
// change both together. The tests here (batchPolicy.test.ts) are the policy's tests; the Swift tests
// (ios/Tests/BatchPolicyTests.swift) check the mirror gives the same answers on the same vectors.
//
// Why: in the Gate 0 debug build every CoreMIDI packet (about 41 clock messages per second) was its own JS event, and
// the bridge delay p95 was 40–59 ms. Native code now collects packets and sends one `onPackets` event per batch:
//   - a packet with a note-on (velocity > 0) flushes the batch at once, with whatever is already in it (so a hit never
//     waits behind clock messages, and order is kept);
//   - any other non-realtime message (note-off, the hi-hat choke aftertouch, CC...) waits at most `maxWaitMs` (8);
//   - a batch of only system realtime bytes (clock F8, active sensing FE...) waits at most `realtimeMaxWaitMs` (33);
//   - a batch never grows past `maxPackets`.
// This is only about *when* JS hears about packets: every packet still reaches JS with its own host timestamp, and
// framing, channels and filtering (clock and active sensing too) stay in TypeScript (CLAUDE.md).

/** How urgent one packet is. Native code doesn't interpret MIDI beyond this. */
export type PacketKind = 'realtimeOnly' | 'other' | 'noteOn';

export type FlushReason = 'noteOn' | 'full' | 'deadline';

export type BatchPolicy = {
  /** Longest a batch holding a non-realtime message waits, ms. */
  maxWaitMs: number;
  /** Longest a batch of only realtime bytes (clock, active sensing) waits, ms. */
  realtimeMaxWaitMs: number;
  /** A batch this big is sent at once. */
  maxPackets: number;
};

export const defaultBatchPolicy: Readonly<BatchPolicy> = Object.freeze({ maxWaitMs: 8, realtimeMaxWaitMs: 33, maxPackets: 128 });

/**
 * Classifies one packet's MIDI 1.0 bytes. A note-on is status 0x9n with a velocity > 0 on any channel (channel 10 is
 * TypeScript's business); running status and realtime bytes interleaved inside a message are followed. Empty or
 * realtime-only (0xF8–0xFF) packets are 'realtimeOnly'. Each packet is classified on its own: with
 * MIDIInputPortCreateWithProtocol(._1_0) every UMP word is one complete message, so nothing is split across packets.
 */
export function classifyPacket(bytes: ArrayLike<number>): PacketKind {
  let kind: PacketKind = 'realtimeOnly';
  let status = 0; // the running status (0 = none, e.g. after sysex or a system common message)
  let dataIndex = 0; // data bytes seen since the status byte, mod 2 for note-on
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    if (b >= 0xf8) continue; // realtime: may sit anywhere, changes nothing
    kind = 'other';
    if (b >= 0x80) {
      status = b < 0xf0 ? b : 0; // system common/exclusive clears the running status
      dataIndex = 0;
      continue;
    }
    if ((status & 0xf0) !== 0x90) continue;
    dataIndex++;
    if (dataIndex === 2) {
      if (b > 0) return 'noteOn';
      dataIndex = 0; // velocity 0 = note-off; running status may follow
    }
  }
  return kind;
}

/** The longest a packet of this kind may wait in a batch, ms. */
export function maxWait(kind: PacketKind, policy: BatchPolicy = defaultBatchPolicy): number {
  switch (kind) {
    case 'noteOn':
      return 0;
    case 'other':
      return policy.maxWaitMs;
    case 'realtimeOnly':
      return policy.realtimeMaxWaitMs;
  }
}

/**
 * The batch's send deadline after adding a packet that reached native code at `arrivalMs`: the earliest of the
 * current deadline (null = the batch was empty) and the packet's own `arrivalMs + maxWait(kind)`.
 */
export function nextDeadline(currentMs: number | null, kind: PacketKind, arrivalMs: number, policy: BatchPolicy = defaultBatchPolicy): number {
  const own = arrivalMs + maxWait(kind, policy);
  return currentMs == null ? own : Math.min(currentMs, own);
}

/**
 * Whether to send the batch now. Called right after adding a packet (`kind` = that packet) and when the timer fires
 * (`kind` = null). `count` = packets in the batch, `deadlineMs` = from nextDeadline. null = keep waiting until the
 * deadline (the caller keeps one timer set for it).
 */
export function flushReason(
  kind: PacketKind | null,
  count: number,
  deadlineMs: number | null,
  nowMs: number,
  policy: BatchPolicy = defaultBatchPolicy,
): FlushReason | null {
  if (count <= 0) return null;
  if (kind === 'noteOn') return 'noteOn';
  if (count >= policy.maxPackets) return 'full';
  if (deadlineMs != null && deadlineMs <= nowMs) return 'deadline';
  return null;
}
