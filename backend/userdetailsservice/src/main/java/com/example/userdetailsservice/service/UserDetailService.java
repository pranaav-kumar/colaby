package com.example.userdetailsservice.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.example.userdetailsservice.entity.UserDetail;
import com.example.userdetailsservice.repository.UserDetailRepository;

@Service
public class UserDetailService {
    
    UserDetailRepository userDetailRepository;

    public UserDetailService(UserDetailRepository userDetailRepository){
        this.userDetailRepository=userDetailRepository;
    }

    public String addProfile(UserDetail user){
        userDetailRepository.save(user);
        return "user "+user+" added";
    }

    public UserDetail getProfileById(Long id){
        return userDetailRepository.getReferenceById(id);
    }

    public List<UserDetail> getAllProfile(){
        return userDetailRepository.findAll();
    }
}
