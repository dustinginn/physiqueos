import SwiftUI
import UIKit

/// Decimal-pad field with web-style replacement editing. A populated value
/// is selected when focus begins, an empty string remains genuinely empty,
/// and parsing is left to the caller's edit-buffer boundary.
struct NumericEditField: UIViewRepresentable {
    @Binding var text: String
    var accessibilityLabel: String
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
        field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)

        let toolbar = UIToolbar()
        toolbar.sizeToFit()
        toolbar.items = [
            UIBarButtonItem(systemItem: .flexibleSpace),
            UIBarButtonItem(title: "Done", style: .done, target: context.coordinator, action: #selector(Coordinator.done)),
        ]
        field.inputAccessoryView = toolbar
        return field
    }

    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
        if field.text != text { field.text = text }
        field.accessibilityLabel = accessibilityLabel
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
            parent.onEditingChanged(true)
            guard NumericEditingContract.shouldSelectAllOnFocus(textField.text ?? "") else { return }
            DispatchQueue.main.async { textField.selectAll(nil) }
        }

        func textFieldDidEndEditing(_ textField: UITextField) {
            parent.onEditingChanged(false)
        }

        @objc func done() { activeField?.resignFirstResponder() }
    }
}
