package com.example.communityservice.dto;

import com.example.communityservice.entity.Vote.VoteType;

public record VoteRequest(
    VoteType voteType
) {}
