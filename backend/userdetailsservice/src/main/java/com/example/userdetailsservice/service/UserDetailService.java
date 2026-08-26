package com.example.userdetailsservice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.example.userdetailsservice.entity.UserDetail;
import com.example.userdetailsservice.repository.UserDetailRepository;

@Service
public class UserDetailService {
    
    UserDetailRepository userDetailRepository;

    public UserDetailService(UserDetailRepository userDetailRepository){
        this.userDetailRepository=userDetailRepository;
    }

    public UserDetail addProfile(UserDetail user){
        UserDetail existing = userDetailRepository.findById(user.getUserId()).orElse(null);
        if (existing != null) {
            // Update the managed entity's editable fields
            existing.setFullName(user.getFullName());
            existing.setUserName(user.getUserName());
            existing.setProfileUrl(user.getProfileUrl());
            existing.setBio(user.getBio());
            existing.setGithubUrl(user.getGithubUrl());
            existing.setLinkedinUrl(user.getLinkedinUrl());
            existing.setPortfolioUrl(user.getPortfolioUrl());
            existing.setOpenToCollaborate(user.getOpenToCollaborate());
            existing.setSkills(user.getSkills() != null ? user.getSkills() : List.of());
            existing.setUpdatedAt(Instant.now());
            return userDetailRepository.save(existing);
        } else {
            user.setExp(0);
            user.setCreatedAt(Instant.now());
            user.setUpdatedAt(Instant.now());
            return userDetailRepository.save(user);
        }
    }

    public UserDetail getProfileById(UUID id){
        return userDetailRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User profile not found"));
    }

    public List<UserDetail> getAllProfile(){
        return userDetailRepository.findAll();
    }

    public void createUser(UUID userId){
        UserDetail userDetail = new UserDetail();
        userDetail.setUserId(userId);
        userDetail.setExp(0);
        userDetail.setCreatedAt(Instant.now());
        userDetail.setUpdatedAt(Instant.now());
        userDetailRepository.save(userDetail);
    }
}
