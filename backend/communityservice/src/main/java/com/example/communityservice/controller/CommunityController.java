package com.example.communityservice.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.communityservice.dto.CommunityResponse;
import com.example.communityservice.dto.CreateCommunityRequest;
import com.example.communityservice.dto.PostResponse;
import com.example.communityservice.service.CommunityService;
import com.example.communityservice.service.PostService;

@RestController
@RequestMapping("/communities")
public class CommunityController {

    private final CommunityService communityService;
    private final PostService postService;

    public CommunityController(CommunityService communityService, PostService postService) {
        this.communityService = communityService;
        this.postService = postService;
    }

    @PostMapping
    public ResponseEntity<CommunityResponse> createCommunity(
            @RequestHeader("X-User-Id") String userIdHeader,
            @RequestBody CreateCommunityRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        CommunityResponse response = communityService.createCommunity(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public List<CommunityResponse> getAllCommunities(
            @RequestHeader("X-User-Id") String userIdHeader) {
        UUID userId = UUID.fromString(userIdHeader);
        return communityService.getAllCommunities(userId);
    }

    @GetMapping("/{communityId}")
    public CommunityResponse getCommunity(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID communityId) {
        UUID userId = UUID.fromString(userIdHeader);
        return communityService.getCommunityById(communityId, userId);
    }

    @PostMapping("/{communityId}/join")
    public ResponseEntity<Void> joinCommunity(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID communityId) {
        UUID userId = UUID.fromString(userIdHeader);
        communityService.joinCommunity(communityId, userId);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{communityId}/leave")
    public ResponseEntity<Void> leaveCommunity(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID communityId) {
        UUID userId = UUID.fromString(userIdHeader);
        communityService.leaveCommunity(communityId, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{communityId}/posts")
    public List<PostResponse> getPostsInCommunity(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID communityId) {
        UUID userId = UUID.fromString(userIdHeader);
        return postService.getPostsByCommunity(communityId, userId);
    }
}
