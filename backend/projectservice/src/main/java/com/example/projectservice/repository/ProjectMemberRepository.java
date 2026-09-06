package com.example.projectservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.ProjectMember;
import com.example.projectservice.entity.ProjectMember.ProjectMemberId;

public interface ProjectMemberRepository extends JpaRepository<ProjectMember, ProjectMemberId> {

    boolean existsByIdUserIdAndIdProjectId(UUID userId, UUID projectId);

    List<ProjectMember> findByIdProjectId(UUID projectId);

    List<ProjectMember> findByIdUserId(UUID userId);

    void deleteByIdUserIdAndIdProjectId(UUID userId, UUID projectId);

    long countByIdProjectId(UUID projectId);
}
