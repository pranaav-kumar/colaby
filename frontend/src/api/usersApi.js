import api from './axios';

/**
 * PUT /users/details
 * Updates or creates profile information for the authenticated user.
 * The userId is extracted from the JWT token at the API gateway.
 *
 * @param {object} profileData
 * @param {string} [profileData.fullName]
 * @param {string} [profileData.userName]
 * @param {string} [profileData.profileUrl]
 * @param {string} [profileData.bio]
 * @param {string} [profileData.githubUrl]
 * @param {string[]} [profileData.skills]
 * @param {string} [profileData.linkedinUrl]
 * @param {string} [profileData.portfolioUrl]
 * @param {boolean} [profileData.openToCollaborate]
 * @returns {Promise<object>} Saved UserDetail object
 */
export function updateProfile(profileData) {
  // Ensure we don't send userId or exp (handled server-side)
  const { userId: _userId, exp: _exp, createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = profileData;
  return api.put('/users/details', payload);
}

/**
 * GET /users/details/{id}
 * Retrieves profile information for a user by UUID.
 *
 * @param {string} id - User UUID
 * @returns {Promise<object>} UserDetail object
 */
export function getProfileById(id) {
  return api.get(`/users/details/${id}`);
}

/**
 * GET /users/allprofiles
 * Retrieves all user profiles.
 *
 * @returns {Promise<Array<object>>} List of UserDetail objects
 */
export function getAllProfiles() {
  return api.get('/users/allprofiles');
}
