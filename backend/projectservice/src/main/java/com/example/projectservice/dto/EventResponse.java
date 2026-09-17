package com.example.projectservice.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record EventResponse(
        UUID id,
        UUID projectId,
        UUID createdBy,
        String createdByUserName,
        String createdByFullName,
        String title,
        String description,
        Instant startTime,
        Instant endTime,
        String visibility,
        List<UUID> participantIds,
        List<String> participantNames,
        Instant createdAt
) {}
