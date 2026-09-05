import api from './axios';

// ─── Communities ─────────────────────────────────────────────

/**
 * GET /communities
 * Returns all communities with member count and isMember flag.
 * @returns {Promise<CommunityResponse[]>}
 */
export function getAllCommunities() {
  return api.get('/communities');
}

/**
 * POST /communities
 * Creates a new community. Creator automatically becomes a member.
 * @param {{ name: string, description: string }} data
 * @returns {Promise<CommunityResponse>} 201
 */
export function createCommunity(data) {
  return api.post('/communities', data);
}

/**
 * GET /communities/{communityId}
 * @param {string} communityId
 * @returns {Promise<CommunityResponse>}
 */
export function getCommunityById(communityId) {
  return api.get(`/communities/${communityId}`);
}

/**
 * POST /communities/{communityId}/join
 * @param {string} communityId
 * @returns {Promise<void>}
 */
export function joinCommunity(communityId) {
  return api.post(`/communities/${communityId}/join`);
}

/**
 * DELETE /communities/{communityId}/leave
 * @param {string} communityId
 * @returns {Promise<void>} 204
 */
export function leaveCommunity(communityId) {
  return api.delete(`/communities/${communityId}/leave`);
}

/**
 * GET /communities/{communityId}/posts
 * Returns all posts in a community, ordered by createdAt DESC.
 * @param {string} communityId
 * @returns {Promise<PostResponse[]>}
 */
export function getPostsByCommunity(communityId) {
  return api.get(`/communities/${communityId}/posts`);
}

// ─── Posts ───────────────────────────────────────────────────

/**
 * POST /posts/communities/{communityId}
 * Creates a post in a community. User must be a member.
 * @param {string} communityId
 * @param {{ title: string, body: string }} data
 * @returns {Promise<PostResponse>} 201
 */
export function createPost(communityId, data) {
  return api.post(`/posts/communities/${communityId}`, data);
}

/**
 * GET /posts/{postId}
 * @param {string} postId
 * @returns {Promise<PostResponse>}
 */
export function getPostById(postId) {
  return api.get(`/posts/${postId}`);
}

/**
 * DELETE /posts/{postId}
 * Only the author can delete their post.
 * @param {string} postId
 * @returns {Promise<void>} 204
 */
export function deletePost(postId) {
  return api.delete(`/posts/${postId}`);
}

/**
 * GET /posts/my
 * Returns all posts authored by the current user.
 * @returns {Promise<PostResponse[]>}
 */
export function getMyPosts() {
  return api.get('/posts/my');
}

// ─── Comments ───────────────────────────────────────────────

/**
 * POST /comments/posts/{postId}
 * Creates a comment on a post. parentCommentId can be null for top-level.
 * @param {string} postId
 * @param {{ body: string, parentCommentId: string|null }} data
 * @returns {Promise<CommentResponse>} 201
 */
export function createComment(postId, data) {
  return api.post(`/comments/posts/${postId}`, data);
}

/**
 * GET /comments/posts/{postId}
 * Returns threaded comments (top-level with nested replies).
 * @param {string} postId
 * @returns {Promise<CommentResponse[]>}
 */
export function getCommentsForPost(postId) {
  return api.get(`/comments/posts/${postId}`);
}

/**
 * DELETE /comments/{commentId}
 * Only the author can delete their comment.
 * @param {string} commentId
 * @returns {Promise<void>} 204
 */
export function deleteComment(commentId) {
  return api.delete(`/comments/${commentId}`);
}

// ─── Votes ──────────────────────────────────────────────────

/**
 * POST /votes/posts/{postId}
 * Upvote or downvote a post. Same vote type toggles (removes vote).
 * @param {string} postId
 * @param {"UP"|"DOWN"} voteType
 * @returns {Promise<{ upvotes: number, downvotes: number }>}
 */
export function voteOnPost(postId, voteType) {
  return api.post(`/votes/posts/${postId}`, { voteType });
}

/**
 * POST /votes/comments/{commentId}
 * Upvote or downvote a comment. Same vote type toggles (removes vote).
 * @param {string} commentId
 * @param {"UP"|"DOWN"} voteType
 * @returns {Promise<{ upvotes: number, downvotes: number }>}
 */
export function voteOnComment(commentId, voteType) {
  return api.post(`/votes/comments/${commentId}`, { voteType });
}
