import api from './axios';

/**
 * POST /auth/signup
 * @param {string} email
 * @param {string} password — min 8 characters
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
export function signup(email, password) {
  return api.post('/auth/signup', { email, password });
}

/**
 * POST /auth/login
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
export function login(email, password) {
  return api.post('/auth/login', { email, password });
}

/**
 * POST /auth/refresh
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
export function refreshAccessToken(refreshToken) {
  return api.post('/auth/refresh', { refreshToken });
}

/**
 * POST /auth/logout
 * @param {string} refreshToken
 * @returns {Promise<string>}
 */
export function logout(refreshToken) {
  return api.post('/auth/logout', { refreshToken });
}
