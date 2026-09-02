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

import com.example.communityservice.dto.CreatePostRequest;
import com.example.communityservice.dto.PostResponse;
import com.example.communityservice.service.PostService;

@RestController
@RequestMapping("/posts")
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    @PostMapping("/communities/{communityId}")
    public ResponseEntity<PostResponse> createPost(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID communityId,
            @RequestBody CreatePostRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        PostResponse response = postService.createPost(communityId, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{postId}")
    public PostResponse getPost(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID postId) {
        UUID userId = UUID.fromString(userIdHeader);
        return postService.getPostById(postId, userId);
    }

    @DeleteMapping("/{postId}")
    public ResponseEntity<Void> deletePost(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID postId) {
        UUID userId = UUID.fromString(userIdHeader);
        postService.deletePost(postId, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/my")
    public List<PostResponse> getMyPosts(
            @RequestHeader("X-User-Id") String userIdHeader) {
        UUID userId = UUID.fromString(userIdHeader);
        return postService.getMyPosts(userId);
    }
}
