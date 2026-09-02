package com.example.communityservice.controller;

import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.communityservice.dto.VoteRequest;
import com.example.communityservice.service.VoteService;

@RestController
@RequestMapping("/votes")
public class VoteController {

    private final VoteService voteService;

    public VoteController(VoteService voteService) {
        this.voteService = voteService;
    }

    @PostMapping("/posts/{postId}")
    public Map<String, Integer> voteOnPost(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID postId,
            @RequestBody VoteRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        return voteService.voteOnPost(postId, userId, request);
    }

    @PostMapping("/comments/{commentId}")
    public Map<String, Integer> voteOnComment(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID commentId,
            @RequestBody VoteRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        return voteService.voteOnComment(commentId, userId, request);
    }
}
