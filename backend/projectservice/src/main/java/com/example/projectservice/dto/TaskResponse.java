package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record TaskResponse(
        UUID id,
        UUID projectId,
        String projectName,
        UUID assignedTo,
        String assignedToUserName,
        String assignedToFullName,
        UUID assignedBy,
        String assignedByUserName,
        String assignedByFullName,
        String title,
        String description,
        int progressPercent,
        String progressNote,
        String status,
        Instant createdAt,
        Instant updatedAt
) {}

