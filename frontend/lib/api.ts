import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const GA_URL = process.env.NEXT_PUBLIC_GA_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: API_URL });
const gaApi = axios.create({ baseURL: GA_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('finanmap_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('finanmap_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const apiClient = {
  login: (email: string, senha: string) =>
    api.post('/api/auth/login', { email, senha }).then(r => r.data),
  register: (email: string, nome: string, senha: string) =>
    api.post('/api/auth/register', { email, nome, senha }).then(r => r.data),
  getMe: () => api.get('/api/auth/me').then(r => r.data),
  getPortfolio: () => api.get('/api/portfolio').then(r => r.data),
  getStrategies: () => api.get('/api/strategies').then(r => r.data),
  getTrades: () => api.get('/api/trades').then(r => r.data),
  calculateFire: (params: object) => api.post('/api/fire/calculate', params).then(r => r.data),
  runOptimize: (params: object) => gaApi.post('/optimize', params).then(r => r.data),
  runBacktest: (params: object) => gaApi.post('/backtest', params).then(r => r.data),
};

export default api;
