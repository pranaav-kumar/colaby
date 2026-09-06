package com.example.projectservice.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.projectservice.entity.ProjectInvitation;

public interface ProjectInvitationRepository extends JpaRepository<ProjectInvitation, UUID> {

    List<ProjectInvitation> findByProjectIdAndStatus(UUID projectId, String status);

    List<ProjectInvitation> findByTargetUserIdAndStatus(UUID targetUserId, String status);

    boolean existsByProjectIdAndTargetUserIdAndTypeAndStatus(
            UUID projectId, UUID targetUserId, String type, String status);

    Optional<ProjectInvitation> findByProjectIdAndTargetUserIdAndTypeAndStatus(
            UUID projectId, UUID targetUserId, String type, String status);
}
