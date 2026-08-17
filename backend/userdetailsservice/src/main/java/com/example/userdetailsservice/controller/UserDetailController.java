package com.example.userdetailsservice.controller;

import org.springframework.web.bind.annotation.RestController;

import com.example.userdetailsservice.dto.CreateUserDetailRequest;
import com.example.userdetailsservice.entity.UserDetail;
import com.example.userdetailsservice.service.UserDetailService;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;



@RestController
@RequestMapping("/users")
public class UserDetailController {

    UserDetailService userDetailService;
    UserDetailController(UserDetailService userDetailService){
        this.userDetailService=userDetailService;
    }
    
    @PutMapping("/details")
    public UserDetail addProfileData(
            @RequestHeader("X-User-Id") String userIdHeader,
            @RequestBody UserDetail details) {
        // Use the authenticated userId from the gateway, not whatever the client sent
        UUID userId = UUID.fromString(userIdHeader);
        details.setUserId(userId);
        return userDetailService.addProfile(details);
    }

    @GetMapping("/details/{id}")
    public UserDetail getDataById(@PathVariable UUID id) {
        return userDetailService.getProfileById(id);
    }

    @GetMapping("/allprofiles")
    public List<UserDetail> getAllData() {
        return userDetailService.getAllProfile();
    }

    // Internal endpoint — called by auth service Feign client directly (not via gateway)
    @PostMapping("/internal/createUser")
    public void createUser(@RequestBody CreateUserDetailRequest request) {
        userDetailService.createUser(request.userId());
    }
    
}
