package com.example.projectservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.NoteFolder;

public interface NoteFolderRepository extends JpaRepository<NoteFolder, UUID> {

    List<NoteFolder> findByProjectIdOrderByNameAsc(UUID projectId);

    void deleteByProjectId(UUID projectId);
}
