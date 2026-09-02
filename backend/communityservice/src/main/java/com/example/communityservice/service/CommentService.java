package com.example.communityservice.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.communityservice.dto.CommentResponse;
import com.example.communityservice.dto.CreateCommentRequest;
import com.example.communityservice.entity.Comment;
import com.example.communityservice.entity.Vote;
import com.example.communityservice.entity.Vote.TargetType;
import com.example.communityservice.exception.ForbiddenException;
import com.example.communityservice.exception.ResourceNotFoundException;
import com.example.communityservice.repository.CommentRepository;
import com.example.communityservice.repository.PostRepository;
import com.example.communityservice.repository.VoteRepository;

@Service
public class CommentService {

    private final CommentRepository commentRepository;
    private final PostRepository postRepository;
    private final VoteRepository voteRepository;

    public CommentService(CommentRepository commentRepository,
                          PostRepository postRepository,
                          VoteRepository voteRepository) {
        this.commentRepository = commentRepository;
        this.postRepository = postRepository;
        this.voteRepository = voteRepository;
    }

    @Transactional
    public CommentResponse createComment(UUID postId, UUID authorId, CreateCommentRequest request) {
        if (!postRepository.existsById(postId)) {
            throw new ResourceNotFoundException("Post not found");
        }
        if (request.body() == null || request.body().isBlank()) {
            throw new IllegalArgumentException("Comment body cannot be blank");
        }
        // Validate parent comment exists if provided
        if (request.parentCommentId() != null &&
                !commentRepository.existsById(request.parentCommentId())) {
            throw new ResourceNotFoundException("Parent comment not found");
        }

        Comment comment = new Comment();
        comment.setPostId(postId);
        comment.setAuthorId(authorId);
        comment.setParentCommentId(request.parentCommentId());
        comment.setBody(request.body().trim());
        comment.setUpvotes(0);
        comment.setDownvotes(0);
        comment.setCreatedAt(Instant.now());

        comment = commentRepository.save(comment);
        return toResponse(comment, authorId);
    }

    @Transactional(readOnly = true)
    public List<CommentResponse> getCommentsForPost(UUID postId, UUID userId) {
        if (!postRepository.existsById(postId)) {
            throw new ResourceNotFoundException("Post not found");
        }
        // Fetch top-level comments, then attach replies recursively
        return commentRepository.findByPostIdAndParentCommentIdIsNullOrderByCreatedAtAsc(postId)
                .stream()
                .map(c -> toResponseWithReplies(c, userId))
                .toList();
    }

    @Transactional
    public void deleteComment(UUID commentId, UUID userId) {
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));
        if (!comment.getAuthorId().equals(userId)) {
            throw new ForbiddenException("You can only delete your own comments");
        }
        // Delete replies and votes recursively
        deleteCommentAndReplies(comment);
    }

    // --- Private helpers ---

    private void deleteCommentAndReplies(Comment comment) {
        List<Comment> replies = commentRepository.findByParentCommentIdOrderByCreatedAtAsc(comment.getId());
        for (Comment reply : replies) {
            deleteCommentAndReplies(reply);
        }
        voteRepository.deleteAll(
                voteRepository.findByTargetIdAndTargetType(comment.getId(), TargetType.COMMENT)
        );
        commentRepository.delete(comment);
    }

    private CommentResponse toResponseWithReplies(Comment comment, UUID userId) {
        List<CommentResponse> replies = commentRepository
                .findByParentCommentIdOrderByCreatedAtAsc(comment.getId())
                .stream()
                .map(r -> toResponseWithReplies(r, userId))
                .toList();
        String userVote = getUserVote(userId, comment.getId(), TargetType.COMMENT);
        return new CommentResponse(
                comment.getId(),
                comment.getPostId(),
                comment.getAuthorId(),
                comment.getParentCommentId(),
                comment.getBody(),
                comment.getUpvotes(),
                comment.getDownvotes(),
                userVote,
                comment.getCreatedAt(),
                replies
        );
    }

    private CommentResponse toResponse(Comment comment, UUID userId) {
        String userVote = getUserVote(userId, comment.getId(), TargetType.COMMENT);
        return new CommentResponse(
                comment.getId(),
                comment.getPostId(),
                comment.getAuthorId(),
                comment.getParentCommentId(),
                comment.getBody(),
                comment.getUpvotes(),
                comment.getDownvotes(),
                userVote,
                comment.getCreatedAt(),
                List.of()
        );
    }

    private String getUserVote(UUID userId, UUID targetId, TargetType targetType) {
        if (userId == null) return null;
        Optional<Vote> vote = voteRepository.findByUserIdAndTargetIdAndTargetType(userId, targetId, targetType);
        return vote.map(v -> v.getVoteType().name()).orElse(null);
    }
}
