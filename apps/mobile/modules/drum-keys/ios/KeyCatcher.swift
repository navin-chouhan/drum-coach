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
  private var editing = 0
  private var observers: [NSObjectProtocol] = []
  private(set) var keysSent = 0
  private(set) var focusCalls = 0

  var onKey: ((String, Int, Bool, Bool, Bool, Double) -> Void)? {
    didSet {
      let send = onKey
      view.onKey = { [weak self] a, b, c, d, e, f in self?.keysSent += 1; send?(a, b, c, d, e, f) }
    }
  }

  init() {
    view.isAccessibilityElement = false
    view.accessibilityElementsHidden = true
    let nc = NotificationCenter.default
    let began: (Notification) -> Void = { [weak self] _ in self?.editing += 1 }
    let ended: (Notification) -> Void = { [weak self] _ in
      guard let self = self else { return }
      self.editing = max(0, self.editing - 1)
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

  /// Whether the last focus attempt made the catcher first responder (read off the main thread for debug info).
  private(set) var focused = false

  private func focus() {
    guard enabled, editing == 0, let window = KeyCatcher.keyWindow() else { return }
    if view.window !== window { window.addSubview(view) }
    focusCalls += 1
    if !view.isFirstResponder { view.becomeFirstResponder() }
    focused = view.isFirstResponder
  }

  private static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap { $0.windows }
    return windows.first(where: { $0.isKeyWindow }) ?? windows.first
  }
}
