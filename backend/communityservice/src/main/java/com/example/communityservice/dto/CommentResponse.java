package com.example.communityservice.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CommentResponse(
    UUID id,
    UUID postId,
    UUID authorId,
    UUID parentCommentId,
    String body,
    int upvotes,
    int downvotes,
    String userVote,      // "UP", "DOWN", or null
    Instant createdAt,
    List<CommentResponse> replies
) {}
