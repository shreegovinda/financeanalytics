'use client';

import { useEffect } from 'react';

export default function AuthSessionGuard(): null {
  useEffect(() => {
    const ensureAuthenticated = (): void => {
      if (!localStorage.getItem('token')) {
        window.location.replace('/auth');
      }
    };

    window.addEventListener('pageshow', ensureAuthenticated);
    window.addEventListener('focus', ensureAuthenticated);

    return () => {
      window.removeEventListener('pageshow', ensureAuthenticated);
      window.removeEventListener('focus', ensureAuthenticated);
    };
  }, []);

  return null;
}
