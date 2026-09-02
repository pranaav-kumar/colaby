package com.example.communityservice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.communityservice.dto.CommunityResponse;
import com.example.communityservice.dto.CreateCommunityRequest;
import com.example.communityservice.entity.Community;
import com.example.communityservice.entity.CommunityMember;
import com.example.communityservice.entity.CommunityMember.CommunityMemberId;
import com.example.communityservice.exception.ResourceNotFoundException;
import com.example.communityservice.repository.CommunityMemberRepository;
import com.example.communityservice.repository.CommunityRepository;

@Service
public class CommunityService {

    private final CommunityRepository communityRepository;
    private final CommunityMemberRepository communityMemberRepository;

    public CommunityService(CommunityRepository communityRepository,
                            CommunityMemberRepository communityMemberRepository) {
        this.communityRepository = communityRepository;
        this.communityMemberRepository = communityMemberRepository;
    }

    @Transactional
    public CommunityResponse createCommunity(UUID userId, CreateCommunityRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("Community name cannot be blank");
        }
        if (communityRepository.existsByName(request.name())) {
            throw new IllegalStateException("Community name '" + request.name() + "' is already taken");
        }

        Community community = new Community();
        community.setName(request.name().trim());
        community.setDescription(request.description());
        community.setCreatedBy(userId);
        community.setCreatedAt(Instant.now());
        community = communityRepository.save(community);

        // Creator automatically becomes a member
        CommunityMember member = new CommunityMember(
                new CommunityMemberId(userId, community.getId()),
                Instant.now()
        );
        communityMemberRepository.save(member);

        return toResponse(community, userId);
    }

    @Transactional(readOnly = true)
    public List<CommunityResponse> getAllCommunities(UUID userId) {
        return communityRepository.findAll()
                .stream()
                .map(c -> toResponse(c, userId))
                .toList();
    }

    @Transactional(readOnly = true)
    public CommunityResponse getCommunityById(UUID communityId, UUID userId) {
        Community community = communityRepository.findById(communityId)
                .orElseThrow(() -> new ResourceNotFoundException("Community not found"));
        return toResponse(community, userId);
    }

    @Transactional
    public void joinCommunity(UUID communityId, UUID userId) {
        if (!communityRepository.existsById(communityId)) {
            throw new ResourceNotFoundException("Community not found");
        }
        if (communityMemberRepository.existsByIdUserIdAndIdCommunityId(userId, communityId)) {
            throw new IllegalStateException("Already a member of this community");
        }
        CommunityMember member = new CommunityMember(
                new CommunityMemberId(userId, communityId),
                Instant.now()
        );
        communityMemberRepository.save(member);
    }

    @Transactional
    public void leaveCommunity(UUID communityId, UUID userId) {
        if (!communityRepository.existsById(communityId)) {
            throw new ResourceNotFoundException("Community not found");
        }
        if (!communityMemberRepository.existsByIdUserIdAndIdCommunityId(userId, communityId)) {
            throw new IllegalStateException("Not a member of this community");
        }
        communityMemberRepository.deleteByIdUserIdAndIdCommunityId(userId, communityId);
    }

    private CommunityResponse toResponse(Community community, UUID userId) {
        long memberCount = communityMemberRepository.countByIdCommunityId(community.getId());
        boolean isMember = userId != null &&
                communityMemberRepository.existsByIdUserIdAndIdCommunityId(userId, community.getId());
        return new CommunityResponse(
                community.getId(),
                community.getName(),
                community.getDescription(),
                community.getCreatedBy(),
                community.getCreatedAt(),
                memberCount,
                isMember
        );
    }
}
