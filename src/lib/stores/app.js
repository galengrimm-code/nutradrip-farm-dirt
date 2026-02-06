import { writable } from 'svelte/store';

// Authentication state
export const isSignedIn = writable(false);
export const userName = writable('');
export const isLoading = writable(false);
export const isDemoMode = writable(false);

// Toast notifications
export const toasts = writable([]);

let toastId = 0;

export function showToast(message, type = 'success', duration = 4000) {
  const id = ++toastId;
  toasts.update(t => [...t, { id, message, type }]);

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }

  return id;
}

export function removeToast(id) {
  toasts.update(t => t.filter(toast => toast.id !== id));
}
