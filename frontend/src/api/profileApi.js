import api from './axios';

/**
 * Profile Service — Friend / Friend-Request API
 *
 * Base path (via API Gateway): /profiles/friends/**
 * Authentication: JWT Bearer token (attached automatically by axios interceptor).
 * The gateway injects X-User-Id from the token; the frontend does NOT send it manually.
 */

/**
 * POST /profiles/friends/request/{receiverId}
 * Send a friend request to another user.
 *
 * @param {string} receiverId - UUID of the user to send the request to
 * @returns {Promise<FriendRequestResponse>}
 *   { id, senderId, receiverId, status, createdAt, resolvedAt }
 */
export function sendFriendRequest(receiverId) {
  return api.post(`/profiles/friends/request/${receiverId}`);
}

/**
 * PUT /profiles/friends/request/{requestId}/accept
 * Accept an incoming friend request (only the receiver may call this).
 *
 * @param {string} requestId - UUID of the friend request
 * @returns {Promise<FriendRequestResponse>}
 */
export function acceptFriendRequest(requestId) {
  return api.put(`/profiles/friends/request/${requestId}/accept`);
}

/**
 * PUT /profiles/friends/request/{requestId}/reject
 * Reject an incoming friend request (only the receiver may call this).
 *
 * @param {string} requestId - UUID of the friend request
 * @returns {Promise<FriendRequestResponse>}
 */
export function rejectFriendRequest(requestId) {
  return api.put(`/profiles/friends/request/${requestId}/reject`);
}

/**
 * GET /profiles/friends/requests/incoming
 * List all PENDING friend requests sent TO the authenticated user.
 *
 * @returns {Promise<FriendRequestResponse[]>}
 */
export function getIncomingRequests() {
  return api.get('/profiles/friends/requests/incoming');
}

/**
 * GET /profiles/friends/requests/sent
 * List all PENDING friend requests sent BY the authenticated user.
 *
 * @returns {Promise<FriendRequestResponse[]>}
 */
export function getSentRequests() {
  return api.get('/profiles/friends/requests/sent');
}

/**
 * GET /profiles/friends
 * List all accepted friends of the authenticated user.
 *
 * @returns {Promise<FriendSummary[]>}
 *   [{ friendId, since }]
 */
export function getFriends() {
  return api.get('/profiles/friends');
}
