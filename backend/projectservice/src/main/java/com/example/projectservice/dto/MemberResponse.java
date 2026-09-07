package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Enriched response for a project member — includes human-readable
 * username and full name instead of exposing only the raw userId.
 */
public record MemberResponse(
        UUID userId,
        String userName,
        String fullName,
        String role,
        Instant joinedAt
) {}
