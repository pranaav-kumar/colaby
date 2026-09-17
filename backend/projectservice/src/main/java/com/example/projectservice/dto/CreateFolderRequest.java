package com.example.projectservice.dto;

import java.util.UUID;

public record CreateFolderRequest(
        String name,
        UUID parentFolderId
) {}
