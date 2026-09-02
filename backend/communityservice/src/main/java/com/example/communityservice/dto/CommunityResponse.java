package com.example.communityservice.dto;

import java.time.Instant;
import java.util.UUID;

public record CommunityResponse(
    UUID id,
    String name,
    String description,
    UUID createdBy,
    Instant createdAt,
    long memberCount,
    boolean isMember
) {}
