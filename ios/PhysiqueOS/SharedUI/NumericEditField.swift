import SwiftUI
import UIKit

/// Decimal-pad field with web-style replacement editing. A populated value
/// is selected when focus begins, an empty string remains genuinely empty,
/// and parsing is left to the caller's edit-buffer boundary.
struct NumericEditField: UIViewRepresentable {
    @Binding var text: String
    var accessibilityLabel: String
    var placeholder: String? = nil
    var fieldID: String? = nil
    var focusedFieldID: Binding<String?>? = nil
    var previousFieldID: String? = nil
    var nextFieldID: String? = nil
    var onEditingChanged: (Bool) -> Void = { _ in }
    /// Optional surface styling for redesigned hosts; nil keeps the legacy look.
    var fieldBackground: Color? = nil
    var font: UIFont? = nil
    var textColor: Color? = nil
    var placeholderColor: Color? = nil
    /// Daily capture's large weight field is leading-aligned; every other
    /// host keeps the centered default.
    var textAlignment: NSTextAlignment = .center

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.delegate = context.coordinator
        field.keyboardType = .decimalPad
        field.textAlignment = textAlignment
        field.borderStyle = .none
        field.backgroundColor = UIColor(fieldBackground ?? PhysiqueOSTheme.surfaceMuted)
        if let font { field.font = font }
        if let textColor { field.textColor = UIColor(textColor) }
        field.layer.cornerRadius = 8
        field.clipsToBounds = true
        field.accessibilityLabel = accessibilityLabel
        applyPlaceholder(to: field)
        field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)

        let toolbar = UIToolbar()
        toolbar.sizeToFit()
        context.coordinator.refreshToolbar(toolbar)
        field.inputAccessoryView = toolbar
        return field
    }

    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
        if field.text != text { field.text = text }
        field.accessibilityLabel = accessibilityLabel
        applyPlaceholder(to: field)
        if let fieldID, let focusedFieldID {
            if focusedFieldID.wrappedValue == fieldID, !field.isFirstResponder {
                field.becomeFirstResponder()
            } else if focusedFieldID.wrappedValue != fieldID, field.isFirstResponder {
                field.resignFirstResponder()
            }
        }
        if let toolbar = field.inputAccessoryView as? UIToolbar {
            context.coordinator.refreshToolbar(toolbar)
        }
    }

    private func applyPlaceholder(to field: UITextField) {
        guard let placeholder, let placeholderColor else {
            field.placeholder = placeholder
            return
        }
        var attributes: [NSAttributedString.Key: Any] = [.foregroundColor: UIColor(placeholderColor)]
        if let font { attributes[.font] = font }
        field.attributedPlaceholder = NSAttributedString(string: placeholder, attributes: attributes)
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: NumericEditField
        private weak var activeField: UITextField?
        private var configuredPreviousFieldID: String?
        private var configuredNextFieldID: String?
        private var hasConfiguredToolbar = false

        init(_ parent: NumericEditField) { self.parent = parent }

        @objc func changed(_ sender: UITextField) {
            parent.text = sender.text ?? ""
        }

        func toolbarItems() -> [UIBarButtonItem] {
            let previous = UIBarButtonItem(
                title: "Previous",
                style: .plain,
                target: self,
                action: #selector(retreat)
            )
            previous.isEnabled = parent.previousFieldID != nil
            previous.accessibilityLabel = "Previous field"
            let next = UIBarButtonItem(
                title: "Next",
                style: .plain,
                target: self,
                action: #selector(advance)
            )
            next.isEnabled = parent.nextFieldID != nil
            next.accessibilityLabel = "Next field"
            let done = UIBarButtonItem(
                title: "Done",
                style: .done,
                target: self,
                action: #selector(done)
            )
            return [previous, next, UIBarButtonItem(systemItem: .flexibleSpace), done]
        }

        func refreshToolbar(_ toolbar: UIToolbar) {
            guard !hasConfiguredToolbar ||
                    configuredPreviousFieldID != parent.previousFieldID ||
                    configuredNextFieldID != parent.nextFieldID else { return }
            toolbar.items = toolbarItems()
            configuredPreviousFieldID = parent.previousFieldID
            configuredNextFieldID = parent.nextFieldID
            hasConfiguredToolbar = true
        }

        func textFieldDidBeginEditing(_ textField: UITextField) {
            activeField = textField
            parent.focusedFieldID?.wrappedValue = parent.fieldID
            parent.onEditingChanged(true)
            guard NumericEditingContract.shouldSelectAllOnFocus(textField.text ?? "") else { return }
            DispatchQueue.main.async { textField.selectAll(nil) }
        }

        func textFieldDidEndEditing(_ textField: UITextField) {
            if parent.focusedFieldID?.wrappedValue == parent.fieldID {
                parent.focusedFieldID?.wrappedValue = nil
            }
            parent.onEditingChanged(false)
        }

        @objc func advance() {
            if let next = parent.nextFieldID {
                parent.focusedFieldID?.wrappedValue = next
            }
        }

        @objc func retreat() {
            if let previous = parent.previousFieldID {
                parent.focusedFieldID?.wrappedValue = previous
            }
        }

        @objc func done() {
            parent.focusedFieldID?.wrappedValue = nil
            activeField?.resignFirstResponder()
        }
    }
}

enum KeyboardFocusOrder {
    static func previous(before id: String, in ids: [String]) -> String? {
        guard let index = ids.firstIndex(of: id), index > ids.startIndex else { return nil }
        return ids[ids.index(before: index)]
    }

    static func next(after id: String, in ids: [String]) -> String? {
        guard let index = ids.firstIndex(of: id), ids.index(after: index) < ids.endIndex else { return nil }
        return ids[ids.index(after: index)]
    }
}

@MainActor
enum PhysiqueOSKeyboard {
    static func dismiss() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}
