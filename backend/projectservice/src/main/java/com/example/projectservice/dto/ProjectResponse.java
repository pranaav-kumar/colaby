package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record ProjectResponse(
        UUID id,
        String name,
        String description,
        String githubRepoUrl,
        String techStack,
        String status,
        UUID createdBy,
        String createdByUserName,
        String createdByFullName,
        Instant createdAt,
        Instant updatedAt,
        long memberCount,
        boolean isMember
) {}

