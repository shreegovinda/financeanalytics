export function notifyFinanceChanged() {
  localStorage.setItem('finlytix-data-updated', String(Date.now()));
  window.dispatchEvent(new Event('finlytix-data-updated'));
}

export function subscribeFinanceChanges(refresh: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === 'finlytix-data-updated') refresh();
  };
  window.addEventListener('finlytix-data-updated', refresh);
  window.addEventListener('storage', storage);
  window.addEventListener('focus', refresh);
  return () => {
    window.removeEventListener('finlytix-data-updated', refresh);
    window.removeEventListener('storage', storage);
    window.removeEventListener('focus', refresh);
  };
}
