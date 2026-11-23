package com.code2knowledge.runtime.security;

import com.code2knowledge.identity.security.LoginRateFilter;
import com.code2knowledge.common.response.ErrorVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/** 设备无状态安全边界；绝不将浏览器Cookie作为设备身份，仅配对码和专用Bearer在服务中验证。 */
@Configuration
@Profile("platform")
public class RuntimeSecurityConfiguration {
    /**
     * 设备路由独立链，不读取或建立用户会话；禁用CSRF只限无Cookie认证的/runtime/v1路径。
     * 配对与心跳成功由应用服务认证，缺失/无效凭证401；其他设备路由默认403。
     *
     * @param http Spring安全构建器，不为空
     *
     * @param json 安全JSON序列化器，不为空
     *
     * @return 优先于浏览器链的专用链，不为空
     *
     * @throws Exception 配置错误启动失败，不放宽权限
     */
    @Bean
    @Order(1)
    public SecurityFilterChain runtimeChain(HttpSecurity http, ObjectMapper json) throws Exception {
        http.securityMatcher("/runtime/v1/**")
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .securityContext(context -> context.disable()).requestCache(cache -> cache.disable())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.POST, "/runtime/v1/readiness/claim", "/runtime/v1/readiness/*/complete", "/runtime/v1/analyses/claim", "/runtime/v1/analyses/complete", "/runtime/v1/candidates", "/runtime/v1/pair", "/runtime/v1/heartbeat", "/runtime/v1/tasks/claim", "/runtime/v1/tasks/*/renew", "/runtime/v1/tasks/*/complete").permitAll().anyRequest().denyAll())
            .exceptionHandling(errors -> errors.accessDeniedHandler((request, response, error) -> {
                response.setStatus(403); response.setContentType("application/json;charset=UTF-8"); json.writeValue(response.getOutputStream(), new ErrorVO("FORBIDDEN", "设备协议路径不受支持"));
            }))
            .addFilterBefore(new LoginRateFilter(), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
