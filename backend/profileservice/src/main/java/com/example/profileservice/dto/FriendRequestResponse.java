package com.example.profileservice.dto;

import java.time.Instant;
import java.util.UUID;

public record FriendRequestResponse(
    UUID id,
    UUID senderId,
    String senderUsername,
    String senderFullName,
    UUID receiverId,
    String receiverUsername,
    String receiverFullName,
    String status,
    Instant createdAt,
    Instant resolvedAt
) {}
