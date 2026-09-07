package com.example.profileservice.dto;

import java.time.Instant;
import java.util.UUID;

public record FriendRequestResponse(
    UUID id,
    UUID senderId,
    UUID receiverId,
    String status,
    Instant createdAt,
    Instant resolvedAt
) {}
