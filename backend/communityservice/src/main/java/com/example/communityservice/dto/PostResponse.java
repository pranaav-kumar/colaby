package com.example.communityservice.dto;

import java.time.Instant;
import java.util.UUID;

public record PostResponse(
    UUID id,
    UUID communityId,
    String communityName,
    UUID authorId,
    String title,
    String body,
    int upvotes,
    int downvotes,
    int commentCount,
    String userVote,  // "UP", "DOWN", or null
    Instant createdAt,
    Instant updatedAt
) {}
