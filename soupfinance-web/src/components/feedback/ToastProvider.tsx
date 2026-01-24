/**
 * ToastProvider Component
 * React context for managing toast notification stack
 * Provides useToast hook for showing/hiding toasts from anywhere in the app
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Toast } from './Toast';
import type { AlertVariant } from './AlertBanner';

// Added: Toast data type (without onClose which is handled internally)
export interface ToastData {
  id: string;
  variant: AlertVariant;
  message: string;
  duration?: number;
}

// Added: Options for showing a toast
export interface ShowToastOptions {
  variant?: AlertVariant;
  message: string;
  duration?: number;
}

// Added: Context value type
interface ToastContextValue {
  /** Show a new toast notification */
  showToast: (options: ShowToastOptions) => string;
  /** Hide a specific toast by ID */
  hideToast: (id: string) => void;
  /** Hide all toasts */
  hideAllToasts: () => void;
}

// Added: Create context with undefined default
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Added: Props for ToastProvider
interface ToastProviderProps {
  children: ReactNode;
  /** Maximum number of toasts to show at once */
  maxToasts?: number;
}

/**
 * Toast provider component - wrap your app with this to enable toast notifications
 * Usage: <ToastProvider><App /></ToastProvider>
 */
export function ToastProvider({ children, maxToasts = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Added: Generate unique ID for each toast
  const generateId = useCallback(() => {
    return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  // Added: Show toast handler
  const showToast = useCallback(
    ({ variant = 'info', message, duration = 5000 }: ShowToastOptions): string => {
      const id = generateId();

      setToasts((prev) => {
        // Limit number of toasts shown
        const newToasts = [...prev, { id, variant, message, duration }];
        if (newToasts.length > maxToasts) {
          return newToasts.slice(-maxToasts);
        }
        return newToasts;
      });

      return id;
    },
    [generateId, maxToasts]
  );

  // Added: Hide specific toast handler
  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Added: Hide all toasts handler
  const hideAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast, hideAllToasts }}>
      {children}

      {/* Toast stack - positioned fixed at bottom-right */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            variant={toast.variant}
            message={toast.message}
            duration={toast.duration}
            onClose={hideToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Hook to access toast functions from any component
 * Must be used within ToastProvider
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error(
      'useToast must be used within a ToastProvider. ' +
      'Wrap your app with <ToastProvider> to use toast notifications.'
    );
  }

  return context;
}
