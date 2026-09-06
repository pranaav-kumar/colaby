package com.example.projectservice.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.ProjectDoc;

public interface ProjectDocRepository extends JpaRepository<ProjectDoc, UUID> {

    Optional<ProjectDoc> findByProjectId(UUID projectId);
}
