package com.example.communityservice.service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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

    private static final int MAX_COMMENT_DEPTH = 5;
    private static final int MAX_COMMENTS_PER_POST = 1000;

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
        postRepository.findByIdForUpdate(postId)
                .orElseThrow(() -> new ResourceNotFoundException("Post not found"));
        if (commentRepository.countByPostId(postId) >= MAX_COMMENTS_PER_POST) {
            throw new IllegalArgumentException("Maximum number of comments reached for this post");
        }
        if (request.body() == null || request.body().isBlank()) {
            throw new IllegalArgumentException("Comment body cannot be blank");
        }
        if (request.parentCommentId() != null) {
            validateParent(postId, request.parentCommentId());
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
        // Fetch a bounded comment set, then attach replies only to the supported depth.
        List<Comment> comments = commentRepository.findTop1000ByPostIdOrderByCreatedAtAsc(postId);
        Map<UUID, List<Comment>> repliesByParent = comments.stream()
                .filter(comment -> comment.getParentCommentId() != null)
                .collect(Collectors.groupingBy(Comment::getParentCommentId));
        return comments.stream()
                .filter(comment -> comment.getParentCommentId() == null)
                .map(comment -> toResponseWithReplies(comment, userId, 0, repliesByParent))
                .toList();
    }

    @Transactional
    public void deleteComment(UUID commentId, UUID userId) {
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));
        if (!comment.getAuthorId().equals(userId)) {
            throw new ForbiddenException("You can only delete your own comments");
        }
        deleteCommentAndReplies(comment);
    }

    // --- Private helpers ---

    private void deleteCommentAndReplies(Comment comment) {
        Deque<Comment> pending = new ArrayDeque<>();
        List<Comment> postOrder = new ArrayList<>();
        Set<UUID> visited = new HashSet<>();
        pending.push(comment);

        while (!pending.isEmpty()) {
            Comment current = pending.pop();
            if (!visited.add(current.getId())) continue;
            if (visited.size() > MAX_COMMENTS_PER_POST) {
                throw new IllegalArgumentException("Comment thread is too large to delete in one request");
            }
            postOrder.add(current);
            for (Comment reply : commentRepository.findTop1001ByParentCommentIdOrderByCreatedAtAsc(current.getId())) {
                pending.push(reply);
            }
            if (pending.size() + visited.size() > MAX_COMMENTS_PER_POST) {
                throw new IllegalArgumentException("Comment thread is too large to delete in one request");
            }
        }

        for (int index = postOrder.size() - 1; index >= 0; index--) {
            Comment current = postOrder.get(index);
            voteRepository.deleteAll(
                    voteRepository.findByTargetIdAndTargetType(current.getId(), TargetType.COMMENT)
            );
            commentRepository.delete(current);
        }
    }

    private void validateParent(UUID postId, UUID parentCommentId) {
        UUID currentId = parentCommentId;
        int depth = 0;
        Set<UUID> visited = new HashSet<>();

        while (currentId != null) {
            if (!visited.add(currentId)) {
                throw new IllegalArgumentException("Comment parent chain contains a cycle");
            }
            Comment parent = commentRepository.findById(currentId)
                    .orElseThrow(() -> new ResourceNotFoundException("Parent comment not found"));
            if (!postId.equals(parent.getPostId())) {
                throw new IllegalArgumentException("Parent comment must belong to the same post");
            }
            depth++;
            if (depth > MAX_COMMENT_DEPTH) {
                throw new IllegalArgumentException("Maximum comment nesting depth exceeded");
            }
            currentId = parent.getParentCommentId();
        }
    }

    private CommentResponse toResponseWithReplies(
            Comment comment,
            UUID userId,
            int depth,
            Map<UUID, List<Comment>> repliesByParent) {
        List<CommentResponse> replies = depth >= MAX_COMMENT_DEPTH
                ? List.of()
                : repliesByParent.getOrDefault(comment.getId(), List.of())
                        .stream()
                        .map(reply -> toResponseWithReplies(reply, userId, depth + 1, repliesByParent))
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
