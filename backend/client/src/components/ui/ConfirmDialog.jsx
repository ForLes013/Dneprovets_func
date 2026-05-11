import React from "react";
import { AlertTriangle } from "lucide-react";

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  tone = "default",
  onConfirm,
  onCancel,
  busy = false,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="app-confirm-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel?.();
        }
      }}
    >
      <div
        className={`app-confirm-dialog app-confirm-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
      >
        <div className="app-confirm-icon">
          <AlertTriangle size={22} />
        </div>
        <div className="app-confirm-content">
          <h3 id="app-confirm-title">{title}</h3>
          {message ? <p>{message}</p> : null}
        </div>
        <div className="app-confirm-actions">
          <button
            type="button"
            className="app-confirm-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="app-confirm-submit"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Секунду..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
