package com.code2knowledge.platform.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 基线安全配置，属于平台安全层；只开放匿名 GET 健康状态，其余请求拒绝。
 * 未接入用户身份和资源策略，因此不提供登录、业务 API 或设备授权的假实现。
 */
@Configuration
@Profile("!platform")
public class BaselineSecurityConfiguration {

    /**
     * 建立拒绝优先的 HTTP 过滤链；匿名 GET /actuator/health 无副作用且无需 CSRF，
     * 其他请求即使通过 CSRF 或具有测试身份仍被拒绝，CSRF 默认保护不关闭。
     * 健康响应仅含 status；禁止暴露组件和环境信息。
     *
     *
     * @param http Spring 提供的安全构建器，不允许为空
     *
     * @return 当前应用唯一过滤链，不为空
     *
     * @throws Exception Spring 无法构建过滤链时抛出，启动应失败而非放宽权限
     */
    @Bean
    public SecurityFilterChain baselineSecurityFilterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(authorize -> authorize
                .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
                .anyRequest().denyAll());
        return http.build();
    }
}
