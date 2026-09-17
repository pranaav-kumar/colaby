package com.example.projectservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.ProjectNote;

public interface ProjectNoteRepository extends JpaRepository<ProjectNote, UUID> {

    List<ProjectNote> findByProjectIdOrderByUpdatedAtDesc(UUID projectId);

    List<ProjectNote> findByProjectIdAndFolderIdOrderByUpdatedAtDesc(UUID projectId, UUID folderId);

    List<ProjectNote> findByProjectIdAndFolderIdIsNullOrderByUpdatedAtDesc(UUID projectId);

    void deleteByProjectId(UUID projectId);

    void deleteByFolderId(UUID folderId);
}
