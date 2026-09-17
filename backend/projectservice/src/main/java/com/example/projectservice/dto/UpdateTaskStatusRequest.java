package com.example.projectservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UpdateTaskStatusRequest(
        @NotBlank(message = "Status is required")
        @Pattern(regexp = "PENDING|ONGOING|DONE",
                 message = "Status must be PENDING, ONGOING, or DONE")
        String status
) {}
