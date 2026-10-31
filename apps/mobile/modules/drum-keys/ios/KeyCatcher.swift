import UIKit

/// An invisible view in the key window that holds first responder while no text field is being edited, so a
/// hardware keyboard's presses reach it (React Native gives JS no global key events). Typing in a text field still
/// goes to the field, as on the web (src/input/keyboard.ts skips inputs); when editing ends the catcher takes the
/// keys back. Main thread only.
final class KeyCatcherView: UIView {
  /// key, HID usage, down, shift, alt, time (HostClock ms).
  var onKey: ((String, Int, Bool, Bool, Bool, Double) -> Void)?

  override var canBecomeFirstResponder: Bool { true }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    super.pressesBegan(forward(presses, down: true), with: event)
  }

  override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    super.pressesEnded(forward(presses, down: false), with: event)
  }

  override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    super.pressesCancelled(forward(presses, down: false), with: event)
  }

  /// Sends the presses it takes and returns the rest for the responder chain.
  private func forward(_ presses: Set<UIPress>, down: Bool) -> Set<UIPress> {
    var rest = Set<UIPress>()
    let nowMs = HostClock.nowMs(), uptime = ProcessInfo.processInfo.systemUptime
    for press in presses {
      guard let key = press.key else { rest.insert(press); continue }
      let usage = key.keyCode.rawValue
      let flags = key.modifierFlags
      if KeyPress.passesThrough(hidUsage: usage, command: flags.contains(.command), control: flags.contains(.control)) {
        rest.insert(press); continue
      }
      let name = KeyPress.name(hidUsage: usage, charactersIgnoringModifiers: key.charactersIgnoringModifiers)
      if name.isEmpty { rest.insert(press); continue }
      let t = KeyPress.hostMs(pressTimestamp: press.timestamp, uptimeNow: uptime, nowMs: nowMs)
      onKey?(name, usage, down, flags.contains(.shift), flags.contains(.alternate), t)
    }
    return rest
  }
}

/// Installs the catcher in the key window and keeps it first responder while enabled and nothing is being edited.
final class KeyCatcher {
  private let view = KeyCatcherView(frame: .zero)
  private var enabled = false
  /// The text fields being edited (weak: a field torn down without textDidEndEditing must not hold the keys forever).
  private var editors: [WeakView] = []
  private var observers: [NSObjectProtocol] = []
  /// Debug counters, locked: written here on main, read from the JS thread by getDebugInfo (QA2 m9).
  let counters = DebugCounters()

  private final class WeakView {
    weak var view: UIView?
    init(_ view: UIView) { self.view = view }
  }

  var onKey: ((String, Int, Bool, Bool, Bool, Double) -> Void)? {
    didSet {
      let send = onKey
      view.onKey = { [weak self] a, b, c, d, e, f in self?.counters.keySent(); send?(a, b, c, d, e, f) }
    }
  }

  init() {
    view.isAccessibilityElement = false
    view.accessibilityElementsHidden = true
    let nc = NotificationCenter.default
    let began: (Notification) -> Void = { [weak self] n in
      guard let self = self, let field = n.object as? UIView else { return }
      if !self.editors.contains(where: { $0.view === field }) { self.editors.append(WeakView(field)) }
    }
    let ended: (Notification) -> Void = { [weak self] n in
      guard let self = self else { return }
      let field = n.object as? UIView
      self.editors.removeAll { $0.view == nil || $0.view === field }
      self.refocusSoon()
    }
    observers.append(nc.addObserver(forName: UITextField.textDidBeginEditingNotification, object: nil, queue: .main, using: began))
    observers.append(nc.addObserver(forName: UITextView.textDidBeginEditingNotification, object: nil, queue: .main, using: began))
    observers.append(nc.addObserver(forName: UITextField.textDidEndEditingNotification, object: nil, queue: .main, using: ended))
    observers.append(nc.addObserver(forName: UITextView.textDidEndEditingNotification, object: nil, queue: .main, using: ended))
    observers.append(nc.addObserver(forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main) { [weak self] _ in self?.refocusSoon() })
  }

  deinit {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  func setEnabled(_ on: Bool) {
    DispatchQueue.main.async {
      self.enabled = on
      if on { self.focus() } else if self.view.isFirstResponder { self.view.resignFirstResponder() }
    }
  }

  /// Takes the keys again (after a modal, a route change, coming back to the foreground). No-op while editing.
  func refocus() {
    DispatchQueue.main.async { self.focus() }
  }

  func refocusSoon() {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.focus() }
  }

  func shutdown() {
    DispatchQueue.main.async {
      self.enabled = false
      self.view.resignFirstResponder()
      self.view.removeFromSuperview()
    }
  }

  /// Whether a text field is really being edited now: drops fields that are gone, out of a window or no longer first
  /// responder (KeyPress.stillEditing), so a missed textDidEndEditing can't keep the keys away until relaunch.
  private func isEditing() -> Bool {
    editors.removeAll { e in
      let v = e.view
      return !KeyPress.stillEditing(alive: v != nil, inWindow: v?.window != nil, firstResponder: v?.isFirstResponder ?? false)
    }
    return !editors.isEmpty
  }

  private func focus() {
    guard enabled, !isEditing(), let window = KeyCatcher.keyWindow() else { return }
    if view.window !== window { window.addSubview(view) }
    if !view.isFirstResponder { view.becomeFirstResponder() }
    counters.focusCall(focused: view.isFirstResponder)
  }

  private static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap { $0.windows }
    return windows.first(where: { $0.isKeyWindow }) ?? windows.first
  }
}
