import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/useAuth';
import {
  getPostById,
  deletePost,
  voteOnPost,
  getCommentsForPost,
  createComment,
  deleteComment,
  voteOnComment,
} from '../api/communityApi';
import { extractErrorMessage } from '../api/axios';

export default function PostDetail() {
  const { communityId, postId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Vote loading
  const [postVoteLoading, setPostVoteLoading] = useState(false);

  // Comment form
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');

  // Reply form state (keyed by parent comment id)
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  // Delete post loading
  const [deletePostLoading, setDeletePostLoading] = useState(false);

  useEffect(() => {
    loadPostAndComments();
  }, [postId]);

  async function loadPostAndComments() {
    try {
      setLoading(true);
      setError('');
      const [postRes, commentsRes] = await Promise.all([
        getPostById(postId),
        getCommentsForPost(postId),
      ]);
      setPost(postRes.data);
      setComments(Array.isArray(commentsRes.data) ? commentsRes.data : []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePostVote(voteType) {
    if (!post) return;
    setPostVoteLoading(true);
    try {
      const response = await voteOnPost(postId, voteType);
      const { upvotes, downvotes } = response.data;
      setPost((prev) => {
        if (!prev) return prev;
        let newUserVote;
        if (prev.userVote === voteType) {
          newUserVote = null;
        } else {
          newUserVote = voteType;
        }
        return { ...prev, upvotes, downvotes, userVote: newUserVote };
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPostVoteLoading(false);
    }
  }

  async function handleDeletePost() {
    if (!window.confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    setDeletePostLoading(true);
    try {
      await deletePost(postId);
      navigate(`/community/${communityId}`, { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
      setDeletePostLoading(false);
    }
  }

  async function handleSubmitComment(e) {
    e.preventDefault();
    setCommentError('');
    if (!commentBody.trim()) {
      setCommentError('Comment cannot be empty.');
      return;
    }

    setCommentSubmitting(true);
    try {
      await createComment(postId, {
        body: commentBody.trim(),
        parentCommentId: null,
      });
      setCommentBody('');
      // Reload comments to get proper threaded structure
      const res = await getCommentsForPost(postId);
      setComments(Array.isArray(res.data) ? res.data : []);
      // Update comment count on post
      setPost((prev) => prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev);
    } catch (err) {
      setCommentError(extractErrorMessage(err));
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleSubmitReply(parentCommentId) {
    if (!replyBody.trim()) return;
    setReplySubmitting(true);
    try {
      await createComment(postId, {
        body: replyBody.trim(),
        parentCommentId,
      });
      setReplyBody('');
      setReplyingTo(null);
      // Reload comments
      const res = await getCommentsForPost(postId);
      setComments(Array.isArray(res.data) ? res.data : []);
      setPost((prev) => prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setReplySubmitting(false);
    }
  }

  async function handleDeleteComment(commentId) {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteComment(commentId);
      const res = await getCommentsForPost(postId);
      setComments(Array.isArray(res.data) ? res.data : []);
      setPost((prev) => prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount || 1) - 1) } : prev);
    } catch (err) {
      setError(extractErrorMessage(err));
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

  // Recursive comment renderer
  function renderComment(comment, depth = 0) {
    return (
      <div
        key={comment.id}
        className="comment-item"
        style={{ marginLeft: depth > 0 ? Math.min(depth * 24, 96) : 0 }}
      >
        <div className="comment-main">
          <CommentVote comment={comment} />
          <div className="comment-body-area">
            <div className="comment-header">
              <Link to={`/users/${comment.authorId}`} className="comment-author-link">
                {comment.authorId.slice(0, 8)}...
              </Link>
              <span className="post-meta-dot">·</span>
              <span className="comment-time">{timeAgo(comment.createdAt)}</span>
            </div>
            <p className="comment-body-text">{comment.body}</p>
            <div className="comment-actions">
              <button
                type="button"
                className="comment-action-btn"
                onClick={() => {
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyBody('');
                }}
              >
                Reply
              </button>
              {comment.authorId === user?.userId && (
                <button
                  type="button"
                  className="comment-action-btn comment-delete-btn"
                  onClick={() => handleDeleteComment(comment.id)}
                >
                  Delete
                </button>
              )}
            </div>

            {/* Reply form */}
            {replyingTo === comment.id && (
              <div className="reply-form">
                <textarea
                  className="input-field textarea-field reply-input"
                  placeholder="Write a reply..."
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  disabled={replySubmitting}
                  rows={2}
                />
                <div className="reply-form-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyBody('');
                    }}
                    disabled={replySubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => handleSubmitReply(comment.id)}
                    disabled={replySubmitting || !replyBody.trim()}
                    style={{ width: 'auto', padding: '6px 16px' }}
                  >
                    {replySubmitting ? 'Replying...' : 'Reply'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nested replies */}
        {Array.isArray(comment.replies) &&
          comment.replies.map((reply) => renderComment(reply, depth + 1))}
      </div>
    );
  }

  // Comment vote sub-component (inline for simplicity)
  function CommentVote({ comment }) {
    const [cvLoading, setCvLoading] = useState(false);
    const [localComment, setLocalComment] = useState(comment);

    // Sync with parent data
    useEffect(() => {
      setLocalComment(comment);
    }, [comment]);

    async function handleCommentVote(voteType) {
      setCvLoading(true);
      try {
        const response = await voteOnComment(localComment.id, voteType);
        const { upvotes, downvotes } = response.data;
        setLocalComment((prev) => ({
          ...prev,
          upvotes,
          downvotes,
          userVote: prev.userVote === voteType ? null : voteType,
        }));
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setCvLoading(false);
      }
    }

    return (
      <div className="comment-vote-col">
        <button
          type="button"
          className={`vote-btn vote-btn-sm vote-up${localComment.userVote === 'UP' ? ' voted' : ''}`}
          onClick={() => handleCommentVote('UP')}
          disabled={cvLoading}
          aria-label="Upvote comment"
        >
          ▲
        </button>
        <span className="vote-score vote-score-sm">
          {localComment.upvotes - localComment.downvotes}
        </span>
        <button
          type="button"
          className={`vote-btn vote-btn-sm vote-down${localComment.userVote === 'DOWN' ? ' voted' : ''}`}
          onClick={() => handleCommentVote('DOWN')}
          disabled={cvLoading}
          aria-label="Downvote comment"
        >
          ▼
        </button>
      </div>
    );
  }

  return (
    <div className="page-layout">
      <Navbar />

      <main className="main-content">
        <div className="container post-detail-container">
          <div className="back-nav-bar">
            <Link to={`/community/${communityId}`} className="back-link">
              ← Back to Community
            </Link>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" style={{ width: 36, height: 36 }} />
              <p className="text-secondary">Loading post...</p>
            </div>
          ) : error && !post ? (
            <div className="message message-error">{error}</div>
          ) : post ? (
            <>
              {error && <div className="message message-error" style={{ marginBottom: 16 }}>{error}</div>}

              {/* Post Card */}
              <article className="post-detail-card">
                <div className="post-vote-column">
                  <button
                    type="button"
                    className={`vote-btn vote-up${post.userVote === 'UP' ? ' voted' : ''}`}
                    onClick={() => handlePostVote('UP')}
                    disabled={postVoteLoading}
                    aria-label="Upvote"
                  >
                    ▲
                  </button>
                  <span className="vote-score">
                    {post.upvotes - post.downvotes}
                  </span>
                  <button
                    type="button"
                    className={`vote-btn vote-down${post.userVote === 'DOWN' ? ' voted' : ''}`}
                    onClick={() => handlePostVote('DOWN')}
                    disabled={postVoteLoading}
                    aria-label="Downvote"
                  >
                    ▼
                  </button>
                </div>
                <div className="post-detail-content">
                  <div className="post-detail-meta">
                    <Link to={`/community/${post.communityId}`} className="post-community-badge">
                      {post.communityName}
                    </Link>
                    <span className="post-meta-dot">·</span>
                    <span>Posted by </span>
                    <Link to={`/users/${post.authorId}`} className="post-author-link">
                      {post.authorId.slice(0, 8)}...
                    </Link>
                    <span className="post-meta-dot">·</span>
                    <span>{timeAgo(post.createdAt)}</span>
                  </div>
                  <h1 className="post-detail-title">{post.title}</h1>
                  {post.body && (
                    <div className="post-detail-body">{post.body}</div>
                  )}
                  <div className="post-detail-actions">
                    <span className="post-detail-stat">
                      {post.commentCount}{' '}
                      {post.commentCount === 1 ? 'comment' : 'comments'}
                    </span>
                    {post.authorId === user?.userId && (
                      <button
                        type="button"
                        className="post-delete-btn"
                        onClick={handleDeletePost}
                        disabled={deletePostLoading}
                      >
                        {deletePostLoading ? 'Deleting...' : 'Delete Post'}
                      </button>
                    )}
                  </div>
                </div>
              </article>

              {/* Add Comment Form */}
              <div className="comments-section">
                <form onSubmit={handleSubmitComment} className="comment-form">
                  {commentError && (
                    <div className="message message-error">{commentError}</div>
                  )}
                  <textarea
                    className="input-field textarea-field"
                    placeholder="Write a comment..."
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    disabled={commentSubmitting}
                    rows={3}
                  />
                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn-primary btn-sm"
                      disabled={commentSubmitting || !commentBody.trim()}
                      style={{ width: 'auto', padding: '8px 20px' }}
                      id="submit-comment-btn"
                    >
                      <span className="btn-content">
                        {commentSubmitting && <span className="spinner" />}
                        {commentSubmitting ? 'Posting...' : 'Comment'}
                      </span>
                    </button>
                  </div>
                </form>

                {/* Comments List */}
                {comments.length === 0 ? (
                  <p className="text-secondary" style={{ textAlign: 'center', padding: '32px 0' }}>
                    No comments yet. Be the first to share your thoughts!
                  </p>
                ) : (
                  <div className="comments-list">
                    {comments.map((comment) => renderComment(comment, 0))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
