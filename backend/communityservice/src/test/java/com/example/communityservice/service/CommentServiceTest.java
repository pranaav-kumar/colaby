package com.example.communityservice.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.example.communityservice.dto.CreateCommentRequest;
import com.example.communityservice.dto.CommentResponse;
import com.example.communityservice.entity.Comment;
import com.example.communityservice.entity.Vote.TargetType;
import com.example.communityservice.repository.CommentRepository;
import com.example.communityservice.repository.PostRepository;
import com.example.communityservice.repository.VoteRepository;

class CommentServiceTest {

    private final CommentRepository commentRepository = org.mockito.Mockito.mock(CommentRepository.class);
    private final PostRepository postRepository = org.mockito.Mockito.mock(PostRepository.class);
    private final VoteRepository voteRepository = org.mockito.Mockito.mock(VoteRepository.class);
    private final CommentService commentService = new CommentService(commentRepository, postRepository, voteRepository);
    private final UUID postId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(postRepository.existsById(postId)).thenReturn(true);
        when(postRepository.findByIdForUpdate(postId)).thenReturn(Optional.of(new com.example.communityservice.entity.Post()));
        when(commentRepository.countByPostId(postId)).thenReturn(0L);
        when(voteRepository.findByUserIdAndTargetIdAndTargetType(userId, null, TargetType.COMMENT))
                .thenReturn(Optional.empty());
    }

    @Test
    void rejectsParentFromAnotherPost() {
        UUID parentId = UUID.randomUUID();
        Comment parent = comment(UUID.randomUUID(), UUID.randomUUID(), null);
        when(commentRepository.findById(parentId)).thenReturn(Optional.of(parent));

        assertThrows(IllegalArgumentException.class, () -> commentService.createComment(
                postId, userId, new CreateCommentRequest("reply", parentId)));
        verify(commentRepository, never()).save(any(Comment.class));
    }

    @Test
    void rejectsRepliesDeeperThanTheSupportedLimit() {
        Map<UUID, Comment> chain = chain(6);
        UUID deepestParentId = chain.values().stream()
                .filter(comment -> comment.getParentCommentId() != null)
                .max((left, right) -> Integer.compare(depth(left, chain), depth(right, chain)))
                .orElseThrow()
                .getId();
        when(commentRepository.findById(any(UUID.class)))
                .thenAnswer(invocation -> Optional.ofNullable(chain.get(invocation.getArgument(0))));

        assertThrows(IllegalArgumentException.class, () -> commentService.createComment(
                postId, userId, new CreateCommentRequest("too deep", deepestParentId)));
        verify(commentRepository, never()).save(any(Comment.class));
    }

    @Test
    void preservesRepliesUpToTheSupportedDepth() {
        Map<UUID, Comment> chain = chain(5);
        Comment deepestParent = chain.values().stream()
                .filter(comment -> comment.getParentCommentId() != null)
                .max((left, right) -> Integer.compare(depth(left, chain), depth(right, chain)))
                .orElseThrow();
        when(commentRepository.findById(any(UUID.class)))
                .thenAnswer(invocation -> Optional.ofNullable(chain.get(invocation.getArgument(0))));
        when(commentRepository.save(any(Comment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(voteRepository.findByUserIdAndTargetIdAndTargetType(userId, null, TargetType.COMMENT))
                .thenReturn(Optional.empty());

        commentService.createComment(postId, userId, new CreateCommentRequest("within limit", deepestParent.getId()));

        verify(commentRepository).save(any(Comment.class));
    }

    @Test
    void rejectsCommentsWhenPostLimitIsReached() {
        when(commentRepository.countByPostId(postId)).thenReturn(1000L);

        assertThrows(IllegalArgumentException.class, () -> commentService.createComment(
                postId, userId, new CreateCommentRequest("one too many", null)));
        verify(commentRepository, never()).save(any(Comment.class));
    }

    @Test
    void refusesToDeleteAnOversizedCommentTreeBeforeDeletingAnyRows() {
        UUID rootId = UUID.randomUUID();
        Comment root = comment(rootId, postId, null);
        when(commentRepository.findById(rootId)).thenReturn(Optional.of(root));
        when(commentRepository.findTop1001ByParentCommentIdOrderByCreatedAtAsc(rootId))
                .thenReturn(java.util.Collections.nCopies(1001, comment(UUID.randomUUID(), postId, rootId)));

        assertThrows(IllegalArgumentException.class, () -> commentService.deleteComment(rootId, userId));
        verify(commentRepository, never()).delete(any(Comment.class));
    }

    @Test
    void limitsTreeRetrievalDepthForPreviouslyStoredComments() {
        Map<UUID, Comment> chain = chain(8);
        when(commentRepository.findTop1000ByPostIdOrderByCreatedAtAsc(postId))
                .thenReturn(chain.values().stream().toList());

        var response = commentService.getCommentsForPost(postId, null);

        assertEquals(1, response.size());
        assertEquals(6, count(response.get(0)));
        verify(commentRepository).findTop1000ByPostIdOrderByCreatedAtAsc(postId);
    }

    private Map<UUID, Comment> chain(int length) {
        Map<UUID, Comment> chain = new HashMap<>();
        UUID parentId = null;
        for (int index = 0; index < length; index++) {
            Comment current = comment(UUID.randomUUID(), postId, parentId);
            chain.put(current.getId(), current);
            parentId = current.getId();
        }
        return chain;
    }

    private Comment comment(UUID id, UUID commentPostId, UUID parentId) {
        Comment comment = new Comment();
        comment.setId(id);
        comment.setPostId(commentPostId);
        comment.setAuthorId(userId);
        comment.setParentCommentId(parentId);
        comment.setBody("body");
        comment.setCreatedAt(Instant.now());
        return comment;
    }

    private int depth(Comment comment, Map<UUID, Comment> chain) {
        int depth = 0;
        while (comment.getParentCommentId() != null) {
            depth++;
            comment = chain.get(comment.getParentCommentId());
        }
        return depth;
    }

    private int count(CommentResponse comment) {
        return 1 + comment.replies().stream().mapToInt(this::count).sum();
    }
}
