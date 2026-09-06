package com.example.projectservice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.projectservice.dto.ProjectInvitationResponse;
import com.example.projectservice.entity.Project;
import com.example.projectservice.entity.ProjectInvitation;
import com.example.projectservice.exception.ForbiddenException;
import com.example.projectservice.exception.ResourceNotFoundException;
import com.example.projectservice.repository.ProjectInvitationRepository;
import com.example.projectservice.repository.ProjectMemberRepository;

@Service
public class InvitationService {

    private final ProjectInvitationRepository invitationRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectService projectService;

    public InvitationService(ProjectInvitationRepository invitationRepository,
                             ProjectMemberRepository projectMemberRepository,
                             ProjectService projectService) {
        this.invitationRepository = invitationRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.projectService = projectService;
    }

    /**
     * A non-member requests to join a project.
     */
    @Transactional
    public ProjectInvitationResponse requestToJoin(UUID projectId, UUID requesterId) {
        Project project = projectService.findProjectOrThrow(projectId);

        if (projectMemberRepository.existsByIdUserIdAndIdProjectId(requesterId, projectId)) {
            throw new IllegalStateException("You are already a member of this project");
        }
        if (invitationRepository.existsByProjectIdAndTargetUserIdAndTypeAndStatus(
                projectId, requesterId, "JOIN_REQUEST", "PENDING")) {
            throw new IllegalStateException("You already have a pending join request for this project");
        }

        ProjectInvitation invitation = new ProjectInvitation();
        invitation.setProjectId(projectId);
        invitation.setTargetUserId(requesterId);
        invitation.setInitiatedBy(requesterId);
        invitation.setType("JOIN_REQUEST");
        invitation.setStatus("PENDING");
        invitation.setCreatedAt(Instant.now());

        return toResponse(invitationRepository.save(invitation));
    }

    /**
     * Creator invites a specific user to their project.
     */
    @Transactional
    public ProjectInvitationResponse inviteUser(UUID projectId, UUID creatorId, UUID targetUserId) {
        Project project = projectService.findProjectOrThrow(projectId);
        projectService.requireCreator(project, creatorId);

        if (projectMemberRepository.existsByIdUserIdAndIdProjectId(targetUserId, projectId)) {
            throw new IllegalStateException("This user is already a member of the project");
        }
        if (invitationRepository.existsByProjectIdAndTargetUserIdAndTypeAndStatus(
                projectId, targetUserId, "INVITE", "PENDING")) {
            throw new IllegalStateException("This user already has a pending invitation to this project");
        }

        ProjectInvitation invitation = new ProjectInvitation();
        invitation.setProjectId(projectId);
        invitation.setTargetUserId(targetUserId);
        invitation.setInitiatedBy(creatorId);
        invitation.setType("INVITE");
        invitation.setStatus("PENDING");
        invitation.setCreatedAt(Instant.now());

        return toResponse(invitationRepository.save(invitation));
    }

    /**
     * Creator views all pending invitations (both types) for their project.
     */
    @Transactional(readOnly = true)
    public List<ProjectInvitationResponse> getPendingForProject(UUID projectId, UUID creatorId) {
        Project project = projectService.findProjectOrThrow(projectId);
        projectService.requireCreator(project, creatorId);
        return invitationRepository.findByProjectIdAndStatus(projectId, "PENDING")
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * A user views all pending invitations sent to them.
     */
    @Transactional(readOnly = true)
    public List<ProjectInvitationResponse> getMyPendingInvitations(UUID userId) {
        return invitationRepository.findByTargetUserIdAndStatus(userId, "PENDING")
                .stream()
                .filter(inv -> inv.getType().equals("INVITE"))
                .map(this::toResponse)
                .toList();
    }

    /**
     * Accepts an invitation.
     * - INVITE:        the targetUser accepts → they join the project
     * - JOIN_REQUEST:  the creator accepts → the requester joins the project
     */
    @Transactional
    public ProjectInvitationResponse accept(UUID invitationId, UUID actorId) {
        ProjectInvitation invitation = findInvitationOrThrow(invitationId);
        validatePending(invitation);
        authorizeResolution(invitation, actorId);

        invitation.setStatus("ACCEPTED");
        invitation.setResolvedAt(Instant.now());
        invitationRepository.save(invitation);

        // Add the joining user as a member
        projectService.addMember(invitation.getProjectId(), invitation.getTargetUserId());

        return toResponse(invitation);
    }

    /**
     * Declines an invitation.
     * - INVITE:        the targetUser declines
     * - JOIN_REQUEST:  the creator declines
     */
    @Transactional
    public ProjectInvitationResponse decline(UUID invitationId, UUID actorId) {
        ProjectInvitation invitation = findInvitationOrThrow(invitationId);
        validatePending(invitation);
        authorizeResolution(invitation, actorId);

        invitation.setStatus("DECLINED");
        invitation.setResolvedAt(Instant.now());
        return toResponse(invitationRepository.save(invitation));
    }

    // ---- Private helpers ----

    private ProjectInvitation findInvitationOrThrow(UUID invitationId) {
        return invitationRepository.findById(invitationId)
                .orElseThrow(() -> new ResourceNotFoundException("Invitation not found: " + invitationId));
    }

    private void validatePending(ProjectInvitation invitation) {
        if (!invitation.getStatus().equals("PENDING")) {
            throw new IllegalStateException("This invitation has already been " + invitation.getStatus().toLowerCase());
        }
    }

    /**
     * Enforces who is allowed to resolve each invitation type:
     * - INVITE      → only the target user can accept/decline
     * - JOIN_REQUEST → only the project creator can accept/decline
     */
    private void authorizeResolution(ProjectInvitation invitation, UUID actorId) {
        if (invitation.getType().equals("INVITE")) {
            if (!invitation.getTargetUserId().equals(actorId)) {
                throw new ForbiddenException("Only the invited user can respond to this invitation");
            }
        } else {
            // JOIN_REQUEST — creator must resolve
            Project project = projectService.findProjectOrThrow(invitation.getProjectId());
            projectService.requireCreator(project, actorId);
        }
    }

    private ProjectInvitationResponse toResponse(ProjectInvitation inv) {
        return new ProjectInvitationResponse(
                inv.getId(),
                inv.getProjectId(),
                inv.getTargetUserId(),
                inv.getInitiatedBy(),
                inv.getType(),
                inv.getStatus(),
                inv.getCreatedAt(),
                inv.getResolvedAt()
        );
    }
}
