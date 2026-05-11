import React from "react";
import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const ToastStack = ({ toasts = [], onDismiss }) => {
  if (!Array.isArray(toasts) || toasts.length === 0) {
    return null;
  }

  return (
    <div className="app-toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || ICONS.info;

        return (
          <div
            key={toast.id}
            className={`app-toast app-toast-${toast.type || "info"}`}
            role="status"
          >
            <div className="app-toast-icon">
              <Icon size={18} />
            </div>
            <div className="app-toast-body">
              {toast.title ? (
                <strong className="app-toast-title">{toast.title}</strong>
              ) : null}
              <span className="app-toast-message">{toast.message}</span>
            </div>
            <button
              type="button"
              className="app-toast-close"
              onClick={() => onDismiss?.(toast.id)}
              aria-label="Закрыть уведомление"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastStack;
