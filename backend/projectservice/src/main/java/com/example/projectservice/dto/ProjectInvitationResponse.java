package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record ProjectInvitationResponse(
        UUID id,
        UUID projectId,
        String projectName,
        UUID targetUserId,
        String targetUserName,
        String targetUserFullName,
        UUID initiatedBy,
        String initiatedByUserName,
        String initiatedByFullName,
        String type,
        String status,
        Instant createdAt,
        Instant resolvedAt
) {}

