package com.example.userdetailsservice.controller;

import org.springframework.web.bind.annotation.RestController;

import com.example.userdetailsservice.entity.UserDetail;
import com.example.userdetailsservice.service.UserDetailService;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;



@RestController
public class UserDetailController {

    UserDetailService userDetailService;
    UserDetailController(UserDetailService userDetailService){
        this.userDetailService=userDetailService;
    }
    
    @PutMapping("/details")
    public void addProfileData(@RequestBody UserDetail details) {
        userDetailService.addProfile(details);
    }

    @GetMapping("/getdetailsById")
    public UserDetail getDataById(@RequestBody Long id) {
        return userDetailService.getProfileById(id);
    }

    @GetMapping("/getallprofiles")
    public List<UserDetail> getAllData() {
        return userDetailService.getAllProfile();
    }
    
}
