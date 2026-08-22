/**
 * Safely parses and decodes the payload of a JWT.
 * @param {string} token - JWT access token
 * @returns {object|null} - Decoded JSON payload or null if invalid
 */
export function parseJwt(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Base64URL to Base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Checks if a JWT token is expired.
 * @param {string} token - JWT access token
 * @param {number} offsetSeconds - Optional buffer in seconds (default 10s)
 * @returns {boolean}
 */
export function isTokenExpired(token, offsetSeconds = 10) {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;

  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime + offsetSeconds;
}
