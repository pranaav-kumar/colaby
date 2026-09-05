import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import {
  getCommunityById,
  getPostsByCommunity,
  createPost,
  joinCommunity,
  leaveCommunity,
  voteOnPost,
  deletePost,
} from '../api/communityApi';
import { extractErrorMessage } from '../api/axios';

export default function CommunityDetail() {
  const { communityId } = useParams();
  const { user } = useAuth();

  const [community, setCommunity] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create post form
  const [showPostForm, setShowPostForm] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postCreating, setPostCreating] = useState(false);
  const [postError, setPostError] = useState('');

  // Membership loading
  const [membershipLoading, setMembershipLoading] = useState(false);

  // Vote loading tracker
  const [voteLoading, setVoteLoading] = useState({});

  // Delete loading tracker
  const [deleteLoading, setDeleteLoading] = useState({});

  useEffect(() => {
    loadCommunityAndPosts();
  }, [communityId]);

  async function loadCommunityAndPosts() {
    try {
      setLoading(true);
      setError('');
      const [communityRes, postsRes] = await Promise.all([
        getCommunityById(communityId),
        getPostsByCommunity(communityId),
      ]);
      setCommunity(communityRes.data);
      setPosts(Array.isArray(postsRes.data) ? postsRes.data : []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePost(e) {
    e.preventDefault();
    setPostError('');

    if (!postTitle.trim()) {
      setPostError('Post title is required.');
      return;
    }

    setPostCreating(true);
    try {
      const response = await createPost(communityId, {
        title: postTitle.trim(),
        body: postBody.trim() || null,
      });
      setPosts((prev) => [response.data, ...prev]);
      setPostTitle('');
      setPostBody('');
      setShowPostForm(false);
    } catch (err) {
      setPostError(extractErrorMessage(err));
    } finally {
      setPostCreating(false);
    }
  }

  async function handleJoin() {
    setMembershipLoading(true);
    try {
      await joinCommunity(communityId);
      setCommunity((prev) =>
        prev ? { ...prev, isMember: true, memberCount: prev.memberCount + 1 } : prev
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setMembershipLoading(false);
    }
  }

  async function handleLeave() {
    setMembershipLoading(true);
    try {
      await leaveCommunity(communityId);
      setCommunity((prev) =>
        prev
          ? { ...prev, isMember: false, memberCount: Math.max(0, prev.memberCount - 1) }
          : prev
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setMembershipLoading(false);
    }
  }

  async function handleVote(postId, voteType) {
    setVoteLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const response = await voteOnPost(postId, voteType);
      const { upvotes, downvotes } = response.data;
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          // Determine new userVote state
          let newUserVote;
          if (p.userVote === voteType) {
            // Toggled off
            newUserVote = null;
          } else {
            newUserVote = voteType;
          }
          return { ...p, upvotes, downvotes, userVote: newUserVote };
        })
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setVoteLoading((prev) => ({ ...prev, [postId]: false }));
    }
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    setDeleteLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      await deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleteLoading((prev) => ({ ...prev, [postId]: false }));
    }
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  function timeAgo(isoString) {
    if (!isoString) return '';
    const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(isoString);
  }

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container">
          <div className="back-nav-bar">
            <Link to="/community" className="back-link">
              ← Back to Communities
            </Link>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading community...</p>
            </div>
          ) : error && !community ? (
            <div className="message message-error">{error}</div>
          ) : community ? (
            <>
              {/* Community Header */}
              <div className="community-detail-header">
                <div className="community-detail-info">
                  <h1 className="page-title">{community.name}</h1>
                  {community.description && (
                    <p className="page-subtitle">{community.description}</p>
                  )}
                  <div className="community-detail-stats">
                    <span className="community-stat-pill">
                      {community.memberCount}{' '}
                      {community.memberCount === 1 ? 'member' : 'members'}
                    </span>
                    <span className="community-stat-pill">
                      {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                    </span>
                    <span className="community-date-pill">
                      Created {formatDate(community.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="community-detail-actions">
                  {community.isMember ? (
                    <>
                      <button
                        type="button"
                        className="btn-community-leave"
                        onClick={handleLeave}
                        disabled={membershipLoading}
                      >
                        {membershipLoading ? 'Leaving...' : 'Leave'}
                      </button>
                      <button
                        type="button"
                        className="btn-edit-profile"
                        onClick={() => {
                          setShowPostForm(!showPostForm);
                          setPostError('');
                        }}
                        id="create-post-btn"
                      >
                        {showPostForm ? 'Cancel' : '+ New Post'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-community-join"
                      onClick={handleJoin}
                      disabled={membershipLoading}
                    >
                      {membershipLoading ? 'Joining...' : 'Join Community'}
                    </button>
                  )}
                </div>
              </div>

              {error && <div className="message message-error" style={{ marginBottom: 16 }}>{error}</div>}

              {/* Create Post Form */}
              {showPostForm && community.isMember && (
                <div className="community-create-card" style={{ marginBottom: 24 }}>
                  <h2 className="card-title">Create a Post</h2>
                  <form onSubmit={handleCreatePost} className="community-create-form">
                    {postError && (
                      <div className="message message-error">{postError}</div>
                    )}
                    <div className="input-group">
                      <label htmlFor="post-title" className="input-label">
                        Title
                      </label>
                      <input
                        id="post-title"
                        type="text"
                        className="input-field"
                        placeholder="Post title"
                        value={postTitle}
                        onChange={(e) => setPostTitle(e.target.value)}
                        disabled={postCreating}
                        maxLength={300}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="post-body" className="input-label">
                        Body
                      </label>
                      <textarea
                        id="post-body"
                        className="input-field textarea-field"
                        placeholder="Share your thoughts..."
                        value={postBody}
                        onChange={(e) => setPostBody(e.target.value)}
                        disabled={postCreating}
                        rows={5}
                      />
                    </div>
                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn-primary btn-save"
                        disabled={postCreating || !postTitle.trim()}
                        id="submit-post-btn"
                      >
                        <span className="btn-content">
                          {postCreating && <span className="spinner" />}
                          {postCreating ? 'Posting...' : 'Create Post'}
                        </span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Posts List */}
              {posts.length === 0 ? (
                <div className="empty-state">
                  <h2 className="empty-title">No posts yet</h2>
                  <p className="empty-desc">
                    {community.isMember
                      ? 'Be the first to share something with this community!'
                      : 'Join the community to start posting.'}
                  </p>
                </div>
              ) : (
                <div className="posts-list">
                  {posts.map((post) => (
                    <article key={post.id} className="post-card">
                      <div className="post-vote-column">
                        <button
                          type="button"
                          className={`vote-btn vote-up${post.userVote === 'UP' ? ' voted' : ''}`}
                          onClick={() => handleVote(post.id, 'UP')}
                          disabled={voteLoading[post.id]}
                          aria-label="Upvote"
                          title="Upvote"
                        >
                          ▲
                        </button>
                        <span className="vote-score">
                          {post.upvotes - post.downvotes}
                        </span>
                        <button
                          type="button"
                          className={`vote-btn vote-down${post.userVote === 'DOWN' ? ' voted' : ''}`}
                          onClick={() => handleVote(post.id, 'DOWN')}
                          disabled={voteLoading[post.id]}
                          aria-label="Downvote"
                          title="Downvote"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="post-content">
                        <h3 className="post-title">
                          <Link
                            to={`/community/${post.communityId}/posts/${post.id}`}
                            className="post-title-link"
                          >
                            {post.title}
                          </Link>
                        </h3>
                        {post.body && (
                          <p className="post-excerpt">
                            {post.body.length > 200
                              ? post.body.slice(0, 200) + '...'
                              : post.body}
                          </p>
                        )}
                        <div className="post-meta">
                          <Link
                            to={`/users/${post.authorId}`}
                            className="post-author-link"
                          >
                            {post.authorId.slice(0, 8)}...
                          </Link>
                          <span className="post-meta-dot">·</span>
                          <span>{timeAgo(post.createdAt)}</span>
                          <span className="post-meta-dot">·</span>
                          <Link
                            to={`/community/${post.communityId}/posts/${post.id}`}
                            className="post-comments-link"
                          >
                            {post.commentCount}{' '}
                            {post.commentCount === 1 ? 'comment' : 'comments'}
                          </Link>
                          {post.authorId === user?.userId && (
                            <>
                              <span className="post-meta-dot">·</span>
                              <button
                                type="button"
                                className="post-delete-btn"
                                onClick={() => handleDeletePost(post.id)}
                                disabled={deleteLoading[post.id]}
                              >
                                {deleteLoading[post.id] ? 'Deleting...' : 'Delete'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
