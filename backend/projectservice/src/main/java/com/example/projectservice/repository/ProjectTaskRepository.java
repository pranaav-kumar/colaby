package com.example.projectservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.ProjectTask;

public interface ProjectTaskRepository extends JpaRepository<ProjectTask, UUID> {

    List<ProjectTask> findByProjectId(UUID projectId);

    List<ProjectTask> findByProjectIdAndAssignedTo(UUID projectId, UUID assignedTo);
}
