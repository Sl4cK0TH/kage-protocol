export type ToastVariant = "default" | "success" | "destructive";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();

export function subscribeToToasts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toast({ title, description, variant = "default" }: Omit<ToastMessage, "id">) {
  const message: ToastMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    variant
  };
  listeners.forEach((listener) => listener(message));
}
