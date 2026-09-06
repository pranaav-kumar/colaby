package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record DocResponse(
        UUID id,
        UUID projectId,
        String content,
        UUID lastEditedBy,
        Instant updatedAt
) {}
