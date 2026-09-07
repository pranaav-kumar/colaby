package com.example.profileservice.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.example.profileservice.dto.FriendRequestResponse;
import com.example.profileservice.dto.FriendSummary;
import com.example.profileservice.service.FriendService;

@RestController
@RequestMapping("/profiles/friends")
public class FriendController {

    private final FriendService friendService;

    public FriendController(FriendService friendService) {
        this.friendService = friendService;
    }

    /**
     * Send a friend request to another user.
     * POST /profiles/friends/request/{receiverId}
     */
    @PostMapping("/request/{receiverId}")
    @ResponseStatus(HttpStatus.CREATED)
    public FriendRequestResponse sendRequest(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID receiverId) {
        UUID senderId = UUID.fromString(userIdHeader);
        return friendService.sendRequest(senderId, receiverId);
    }

    /**
     * Accept an incoming friend request.
     * PUT /profiles/friends/request/{requestId}/accept
     */
    @PutMapping("/request/{requestId}/accept")
    public FriendRequestResponse acceptRequest(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID requestId) {
        UUID currentUserId = UUID.fromString(userIdHeader);
        return friendService.acceptRequest(requestId, currentUserId);
    }

    /**
     * Reject an incoming friend request.
     * PUT /profiles/friends/request/{requestId}/reject
     */
    @PutMapping("/request/{requestId}/reject")
    public FriendRequestResponse rejectRequest(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID requestId) {
        UUID currentUserId = UUID.fromString(userIdHeader);
        return friendService.rejectRequest(requestId, currentUserId);
    }

    /**
     * List all pending friend requests sent TO the current user (their inbox).
     * GET /profiles/friends/requests/incoming
     */
    @GetMapping("/requests/incoming")
    public List<FriendRequestResponse> getIncomingRequests(
            @RequestHeader("X-User-Id") String userIdHeader) {
        UUID currentUserId = UUID.fromString(userIdHeader);
        return friendService.getIncomingRequests(currentUserId);
    }

    /**
     * List all pending friend requests sent BY the current user.
     * GET /profiles/friends/requests/sent
     */
    @GetMapping("/requests/sent")
    public List<FriendRequestResponse> getSentRequests(
            @RequestHeader("X-User-Id") String userIdHeader) {
        UUID currentUserId = UUID.fromString(userIdHeader);
        return friendService.getSentRequests(currentUserId);
    }

    /**
     * List all accepted friends of the current user.
     * GET /profiles/friends
     */
    @GetMapping
    public List<FriendSummary> getFriends(
            @RequestHeader("X-User-Id") String userIdHeader) {
        UUID currentUserId = UUID.fromString(userIdHeader);
        return friendService.getFriends(currentUserId);
    }
}
