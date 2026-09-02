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

import com.example.communityservice.dto.CommentResponse;
import com.example.communityservice.dto.CreateCommentRequest;
import com.example.communityservice.service.CommentService;

@RestController
@RequestMapping("/comments")
public class CommentController {

    private final CommentService commentService;

    public CommentController(CommentService commentService) {
        this.commentService = commentService;
    }

    @PostMapping("/posts/{postId}")
    public ResponseEntity<CommentResponse> createComment(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID postId,
            @RequestBody CreateCommentRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        CommentResponse response = commentService.createComment(postId, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/posts/{postId}")
    public List<CommentResponse> getCommentsForPost(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID postId) {
        UUID userId = UUID.fromString(userIdHeader);
        return commentService.getCommentsForPost(postId, userId);
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<Void> deleteComment(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID commentId) {
        UUID userId = UUID.fromString(userIdHeader);
        commentService.deleteComment(commentId, userId);
        return ResponseEntity.noContent().build();
    }
}
