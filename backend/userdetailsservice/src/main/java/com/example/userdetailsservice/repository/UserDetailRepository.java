package com.example.userdetailsservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.userdetailsservice.entity.UserDetail;

public interface UserDetailRepository extends JpaRepository<UserDetail, Long>{
    
}
