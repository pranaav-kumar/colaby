import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Attach Access Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 & Automatic Refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Don't intercept auth endpoints to prevent endless loops
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/signup') ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        // No refresh token available; clear auth state and trigger redirect
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue the request until token refresh finishes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Use a direct axios call to avoid interceptor recursion
        const response = await axios.post(`${baseURL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data;

        if (accessToken) {
          localStorage.setItem('accessToken', accessToken);
        }
        if (newRefreshToken) {
          localStorage.setItem('refreshToken', newRefreshToken);
        }

        // Notify AuthContext of token update
        window.dispatchEvent(
          new CustomEvent('auth:token-refreshed', {
            detail: { accessToken, refreshToken: newRefreshToken || refreshToken },
          })
        );

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Refresh failed: clear storage and signal logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.dispatchEvent(new CustomEvent('auth:logout'));

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Extracts a user-friendly error message from various backend error shapes:
 *  - Spring validation errors (400) with field-level messages
 *  - Gateway unauthorized (401)
 *  - RuntimeException messages surfaced in Spring's default error body (500)
 *  - Circuit-breaker / fallback plain-text responses (503)
 *  - Network / timeout errors
 */
export function extractErrorMessage(error) {
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
    return 'Unable to connect to the server. Please check your network and try again.';
  }

  const { status, data } = error.response;

  // Spring validation errors (400) — may contain field errors
  if (status === 400) {
    if (data?.errors && Array.isArray(data.errors)) {
      return data.errors.map((e) => e.defaultMessage).join('. ');
    }
    if (data?.message) return data.message;
    if (typeof data === 'string') return data;
    return 'Invalid input. Please check your details and try again.';
  }

  // 401 — Unauthorized
  if (status === 401) {
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    return 'Session expired or invalid credentials. Please log in again.';
  }

  // 404 — Not found
  if (status === 404) {
    if (data?.message) return data.message;
    return 'The requested resource was not found.';
  }

  // 503 — circuit-breaker fallback from the gateway
  if (status === 503) {
    if (typeof data === 'string') return data;
    return 'Service is temporarily unavailable. Please try again shortly.';
  }

  // 500 — RuntimeException from backend (e.g. "Email already exists", "user profile not found")
  if (status === 500) {
    if (data?.message) return data.message;
    if (typeof data === 'string' && data.length < 200) return data;
    return 'Something went wrong on the server. Please try again.';
  }

  // Catch-all
  if (data?.message) return data.message;
  if (typeof data === 'string' && data.length < 200) return data;
  return 'An unexpected error occurred. Please try again.';
}

export default api;
