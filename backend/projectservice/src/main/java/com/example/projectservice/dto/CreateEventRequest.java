package com.example.projectservice.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record CreateEventRequest(
        @NotBlank(message = "Event title is required")
        String title,

        String description,

        @NotNull(message = "Start time is required")
        Instant startTime,

        @NotNull(message = "End time is required")
        Instant endTime,

        @NotNull(message = "Visibility is required")
        @Pattern(regexp = "ALL|SPECIFIC", message = "Visibility must be ALL or SPECIFIC")
        String visibility,

        /** Required (non-empty) when visibility=SPECIFIC, ignored when visibility=ALL */
        List<UUID> participantIds
) {}
