package io.berndruecker.converter.example;

import org.springframework.stereotype.Component;

@Component
public class SampleBean {

    public int someMethod(String text) {
        System.out.println("SampleBean.someMethod('" + text + "')");
        return 42;
    }

}
