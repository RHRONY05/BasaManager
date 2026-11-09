import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';
import { CircleCheck, AlertCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          role="region"
          aria-live="polite"
          aria-label="Notifications"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4"
        >
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex items-center gap-3 p-3 rounded-md bg-[var(--bg-inverse)] text-[var(--fg-inverse)] shadow-lg text-sm border border-[var(--border-default)]"
    >
      {toast.type === 'success' ? (
        <CircleCheck className="h-5 w-5 shrink-0 text-[var(--success-primary)]" aria-hidden="true" />
      ) : toast.type === 'error' ? (
        <AlertCircle className="h-5 w-5 shrink-0 text-[var(--danger-primary)]" aria-hidden="true" />
      ) : null}
      <span className="flex-1 min-w-0 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 text-[var(--fg-inverse)] hover:opacity-80 rounded min-h-tap min-w-tap flex items-center justify-center cursor-pointer shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {},
    };
  }
  return ctx;
}
