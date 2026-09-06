package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record TaskResponse(
        UUID id,
        UUID projectId,
        UUID assignedTo,
        UUID assignedBy,
        String title,
        String description,
        int progressPercent,
        String progressNote,
        String status,
        Instant createdAt,
        Instant updatedAt
) {}
