package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record NoteFolderResponse(
        UUID id,
        UUID projectId,
        UUID parentFolderId,
        String name,
        UUID createdBy,
        Instant createdAt
) {}
