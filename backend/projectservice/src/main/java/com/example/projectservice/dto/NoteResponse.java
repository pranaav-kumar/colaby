package com.example.projectservice.dto;

import java.time.Instant;
import java.util.UUID;

public record NoteResponse(
        UUID id,
        UUID projectId,
        UUID folderId,
        String title,
        String content,
        UUID createdBy,
        UUID lastEditedBy,
        Instant createdAt,
        Instant updatedAt
) {}
