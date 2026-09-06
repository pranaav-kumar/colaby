package com.example.projectservice.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import com.example.projectservice.dto.ProjectInvitationResponse;
import com.example.projectservice.service.InvitationService;

@RestController
@RequestMapping("/projects")
public class InvitationController {

    private final InvitationService invitationService;

    public InvitationController(InvitationService invitationService) {
        this.invitationService = invitationService;
    }

    /** Non-member requests to join a project */
    @PostMapping("/{projectId}/invitations/request")
    public ResponseEntity<ProjectInvitationResponse> requestToJoin(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        UUID userId = UUID.fromString(userIdHeader);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(invitationService.requestToJoin(projectId, userId));
    }

    /** Creator invites a specific user */
    @PostMapping("/{projectId}/invitations/invite/{targetUserId}")
    public ResponseEntity<ProjectInvitationResponse> inviteUser(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID targetUserId) {
        UUID creatorId = UUID.fromString(userIdHeader);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(invitationService.inviteUser(projectId, creatorId, targetUserId));
    }

    /** Creator views all pending invitations for their project */
    @GetMapping("/{projectId}/invitations")
    public List<ProjectInvitationResponse> getPendingForProject(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return invitationService.getPendingForProject(projectId, UUID.fromString(userIdHeader));
    }

    /** Authenticated user views invitations sent to them */
    @GetMapping("/invitations/my")
    public List<ProjectInvitationResponse> getMyInvitations(
            @RequestHeader("X-User-Id") String userIdHeader) {
        return invitationService.getMyPendingInvitations(UUID.fromString(userIdHeader));
    }

    /** Accept an invitation (invitee for INVITE; creator for JOIN_REQUEST) */
    @PostMapping("/invitations/{invitationId}/accept")
    public ProjectInvitationResponse accept(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID invitationId) {
        return invitationService.accept(invitationId, UUID.fromString(userIdHeader));
    }

    /** Decline an invitation (invitee for INVITE; creator for JOIN_REQUEST) */
    @PostMapping("/invitations/{invitationId}/decline")
    public ProjectInvitationResponse decline(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID invitationId) {
        return invitationService.decline(invitationId, UUID.fromString(userIdHeader));
    }
}
