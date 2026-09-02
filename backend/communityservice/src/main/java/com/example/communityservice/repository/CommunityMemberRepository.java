package com.example.communityservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.communityservice.entity.CommunityMember;
import com.example.communityservice.entity.CommunityMember.CommunityMemberId;

public interface CommunityMemberRepository extends JpaRepository<CommunityMember, CommunityMemberId> {

    boolean existsByIdUserIdAndIdCommunityId(UUID userId, UUID communityId);

    List<CommunityMember> findByIdCommunityId(UUID communityId);

    List<CommunityMember> findByIdUserId(UUID userId);

    long countByIdCommunityId(UUID communityId);

    void deleteByIdUserIdAndIdCommunityId(UUID userId, UUID communityId);
}
