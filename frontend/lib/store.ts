import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  login: async (email: string, password: string): Promise<void> => {
    // Will be implemented with API call
    set({ token: 'temp-token' });
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register: async (email: string, password: string, name: string): Promise<void> => {
    // Will be implemented with API call
    set({ token: 'temp-token' });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  setUser: (user) => {
    set({ user });
  },
}));
