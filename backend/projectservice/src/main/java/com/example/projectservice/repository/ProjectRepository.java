package com.example.projectservice.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.Project;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
    boolean existsByName(String name);
}
