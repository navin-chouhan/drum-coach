import Foundation

/// What WordRenderer does with one buffer from `AVSpeechSynthesizer.write` (pure, tested in WordChunksTests): an empty
/// buffer marks the end, but only once some audio came. Some iOS versions hand an empty buffer first; ending there
/// left every count-in word "missing", so takes played the clicks with no "one, two, three, four".
enum WordChunks {
  enum Action: Equatable { case append, end, skip }

  static func action(frameLength: Int, haveAudio: Bool) -> Action {
    if frameLength > 0 { return .append }
    return haveAudio ? .end : .skip
  }
}
