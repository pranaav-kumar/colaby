package com.example.communityservice.dto;

import java.util.UUID;

public record CreateCommentRequest(
    String body,
    UUID parentCommentId  // null for top-level comment
) {}
