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
    var nextFieldID: String? = nil
    var onEditingChanged: (Bool) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.delegate = context.coordinator
        field.keyboardType = .decimalPad
        field.textAlignment = .center
        field.borderStyle = .none
        field.backgroundColor = UIColor(PhysiqueOSTheme.surfaceMuted)
        field.layer.cornerRadius = 8
        field.clipsToBounds = true
        field.accessibilityLabel = accessibilityLabel
        field.placeholder = placeholder
        field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)

        let toolbar = UIToolbar()
        toolbar.sizeToFit()
        toolbar.items = [
            UIBarButtonItem(systemItem: .flexibleSpace),
            UIBarButtonItem(title: nextFieldID == nil ? "Done" : "Next", style: .done, target: context.coordinator, action: #selector(Coordinator.advance)),
        ]
        field.inputAccessoryView = toolbar
        return field
    }

    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
        if field.text != text { field.text = text }
        field.accessibilityLabel = accessibilityLabel
        field.placeholder = placeholder
        if let fieldID, let focusedFieldID {
            if focusedFieldID.wrappedValue == fieldID, !field.isFirstResponder {
                field.becomeFirstResponder()
            } else if focusedFieldID.wrappedValue != fieldID, field.isFirstResponder {
                field.resignFirstResponder()
            }
        }
        if let toolbar = field.inputAccessoryView as? UIToolbar,
           let action = toolbar.items?.last {
            action.title = nextFieldID == nil ? "Done" : "Next"
        }
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: NumericEditField
        private weak var activeField: UITextField?

        init(_ parent: NumericEditField) { self.parent = parent }

        @objc func changed(_ sender: UITextField) {
            parent.text = sender.text ?? ""
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
            } else {
                activeField?.resignFirstResponder()
            }
        }
    }
}
