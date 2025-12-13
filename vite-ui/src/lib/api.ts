import axios from 'axios';

// API Base URL - use env var in production, empty string for development (uses Vite proxy)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Create axios instance with base URL
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
});

// Helper to get full URL for redirects (e.g., OAuth)
export const getApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

// Helper to get API path (for axios calls using this instance)
export const getApiPath = (path: string): string => {
  // Remove /api prefix if present since baseURL already has it
  return path.startsWith('/api/') ? path.substring(4) : path;
};

export default api;
