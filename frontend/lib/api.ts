import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (email: string, password: string, name: string) =>
    api.post('/api/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
};

export const transactionAPI = {
  getTransactions: () => api.get('/api/transactions'),
  getStats: () => api.get('/api/transactions/stats'),
};

export const analyticsAPI = {
  getPieChart: () => api.get('/api/analytics/pie'),
  getBarChart: () => api.get('/api/analytics/bar'),
  getTrends: () => api.get('/api/analytics/trends'),
};

export default api;
