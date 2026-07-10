package com.example.authservice.controller;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.authservice.entity.User;
import com.example.authservice.service.JwtService;
import com.example.authservice.service.UserService;

import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;


@RestController
@RequestMapping("/auth")
public class UserController {

    private final UserService serv;
    private final PasswordEncoder encoder;
    private final JwtService jwtservice;
    
    public UserController(UserService serv,PasswordEncoder encoder,JwtService jwtservice){
        this.serv=serv;
        this.encoder=encoder;
        this.jwtservice=jwtservice;
    }

    @PostMapping("/signup")
    public String signupMethod(@RequestBody User user) {
        serv.saveUser(user);
        return jwtservice.generateToken(user);
    }

    @PostMapping("/login")
    public String loginMethod(@RequestBody User user) {
        Optional<User> optdbuser = serv.getUserByEmail(user.getEmail());
        if(optdbuser.isEmpty()) return "authentication failed";
        User dbuser = optdbuser.get();
        if (encoder.matches(user.getPassword(), dbuser.getPassword())) return jwtservice.generateToken(user);
        else return "authentication failed";
    }
    
    
}
