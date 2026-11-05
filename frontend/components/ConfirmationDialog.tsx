'use client';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-surface rounded-lg shadow-xl max-w-sm w-full mx-4">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-ink mb-2">{title}</h2>
          <p className="text-ink-2 text-sm mb-6">{message}</p>
        </div>

        <div className="flex gap-3 px-6 py-4 bg-surface-2 rounded-b-lg">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-medium text-ink-2 bg-surface border border-line-strong rounded-md hover:bg-surface-2 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${
              isDangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
