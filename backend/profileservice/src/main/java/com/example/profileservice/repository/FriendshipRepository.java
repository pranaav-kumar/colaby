package com.example.profileservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.profileservice.entity.Friendship;

public interface FriendshipRepository extends JpaRepository<Friendship, UUID> {

    /** All friends of a given user */
    List<Friendship> findAllByUserId(UUID userId);

    /** Check whether two users are already friends */
    boolean existsByUserIdAndFriendId(UUID userId, UUID friendId);
}
