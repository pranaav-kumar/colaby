package com.example.projectservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.ProjectEvent;

public interface ProjectEventRepository extends JpaRepository<ProjectEvent, UUID> {

    List<ProjectEvent> findByProjectId(UUID projectId);
}
