import Foundation

/// Fixed unpack of Universal MIDI Packet words (what `MIDIInputPortCreateWithProtocol(._1_0)` delivers) back to the
/// MIDI 1.0 bytes they carry. Not a parser: each word's layout is fixed by its message type, so there is no state.
/// Splitting byte runs into messages (framing) is TypeScript's job (src/shared/framing.ts).
enum UmpUnpack {
  /// Words per UMP by message type (UMP spec 1.1, table 1).
  static func wordCount(messageType mt: UInt32) -> Int {
    switch mt {
    case 0x0, 0x1, 0x2, 0x6, 0x7: return 1
    case 0x3, 0x4, 0x8, 0x9, 0xA: return 2
    case 0xB, 0xC: return 3
    default: return 4 // 0x5, 0xD, 0xE, 0xF
    }
  }

  /// Data bytes after a system status byte (F1, F3: 1; F2: 2; the rest: 0).
  static func systemDataCount(_ status: UInt32) -> Int {
    switch status {
    case 0xF1, 0xF3: return 1
    case 0xF2: return 2
    default: return 0
    }
  }

  /// Appends the MIDI 1.0 bytes of `words` to `out`. Utility (JR timestamps, NOOP), MIDI 2.0 and stream messages
  /// carry no MIDI 1.0 bytes and are skipped; with protocol 1.0 a MIDI 1.0 device does not produce them.
  static func append(_ words: UnsafeBufferPointer<UInt32>, to out: inout [Int]) {
    var i = 0
    while i < words.count {
      let w = words[i]
      let mt = w >> 28
      switch mt {
      case 0x1: // system common and realtime: [mt|group][status][data1][data2]
        let status = (w >> 16) & 0xFF
        out.append(Int(status))
        let n = systemDataCount(status)
        if n >= 1 { out.append(Int((w >> 8) & 0x7F)) }
        if n >= 2 { out.append(Int(w & 0x7F)) }
      case 0x2: // MIDI 1.0 channel voice: [mt|group][status][data1][data2]
        let status = (w >> 16) & 0xFF
        out.append(Int(status))
        out.append(Int((w >> 8) & 0x7F))
        let type = status & 0xF0
        if type != 0xC0 && type != 0xD0 { out.append(Int(w & 0x7F)) }
      case 0x3: // 7-bit sysex, 2 words: [mt|group][kind|count][b1][b2] [b3][b4][b5][b6]
        guard i + 1 < words.count else { break }
        let w2 = words[i + 1]
        let kind = (w >> 20) & 0xF, count = min(6, Int((w >> 16) & 0xF))
        let data: [UInt32] = [(w >> 8) & 0x7F, w & 0x7F, (w2 >> 24) & 0x7F, (w2 >> 16) & 0x7F, (w2 >> 8) & 0x7F, w2 & 0x7F]
        if kind == 0x0 || kind == 0x1 { out.append(0xF0) } // complete, start
        for k in 0..<count { out.append(Int(data[k])) }
        if kind == 0x0 || kind == 0x3 { out.append(0xF7) } // complete, end
      default:
        break
      }
      i += wordCount(messageType: mt)
    }
  }
}
