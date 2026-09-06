package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record ProjectInvitationResponse(
        UUID id,
        UUID projectId,
        UUID targetUserId,
        UUID initiatedBy,
        String type,
        String status,
        Instant createdAt,
        Instant resolvedAt
) {}
