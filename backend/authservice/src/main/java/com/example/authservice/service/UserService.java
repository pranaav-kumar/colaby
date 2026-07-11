package com.example.authservice.service;

import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.example.authservice.entity.User;
import com.example.authservice.repository.UserRepository;

@Service
public class UserService {

    private final UserRepository repo;
    private final PasswordEncoder encoder;

    public UserService(UserRepository repo,PasswordEncoder encoder){
        this.repo=repo;
        this.encoder=encoder;
    }

    public User saveUser(User user){
        user.setPassword(encoder.encode(user.getPassword()));
        return repo.save(user);
         
    }

    public Optional<User> getUserByEmail(String email){
        return repo.getUserByEmail(email);
    }
}
