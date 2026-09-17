package com.example.projectservice.dto;

import java.util.UUID;

public record CreateNoteRequest(
        String title,
        String content,
        UUID folderId
) {}
