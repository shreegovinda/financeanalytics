'use client';

import { useEffect } from 'react';

export default function AuthSessionGuard(): null {
  useEffect(() => {
    const ensureAuthenticated = (): void => {
      if (!localStorage.getItem('token')) {
        window.location.replace('/auth');
      }
    };

    ensureAuthenticated();

    window.addEventListener('pageshow', ensureAuthenticated);
    window.addEventListener('focus', ensureAuthenticated);
    window.addEventListener('storage', ensureAuthenticated);

    return () => {
      window.removeEventListener('pageshow', ensureAuthenticated);
      window.removeEventListener('focus', ensureAuthenticated);
      window.removeEventListener('storage', ensureAuthenticated);
    };
  }, []);

  return null;
}
