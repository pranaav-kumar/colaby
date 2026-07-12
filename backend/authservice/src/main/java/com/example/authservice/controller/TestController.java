package com.example.authservice.controller;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;


@RestController
public class TestController {
    @GetMapping("/testing")
    public String getMethodName() {
        return "hello";
    }
    
}
