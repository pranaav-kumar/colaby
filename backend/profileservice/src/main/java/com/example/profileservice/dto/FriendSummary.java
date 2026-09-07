package com.example.profileservice.dto;

import java.time.Instant;
import java.util.UUID;

public record FriendSummary(
    UUID friendId,
    String userName,
    String fullName,
    Instant since
) {}
