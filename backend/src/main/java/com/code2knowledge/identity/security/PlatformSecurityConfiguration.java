package com.code2knowledge.identity.security;

import com.code2knowledge.common.response.ErrorVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import java.io.IOException;

/** 持久化平台浏览器安全入口；会话身份、CSRF、固定拒绝和登录限速，不支持API令牌或OIDC假登录。 */
@Configuration
@Profile("platform")
public class PlatformSecurityConfiguration {
    /**
     * 创建会话认证链，登录与退出同样需要会话CSRF；成功轮换会话，退出失效。
     * POST /api/v1/auth/login 接收表单username/password，200返回空JSON；401身份无效、403写保护、429限速。
     * POST /api/v1/auth/logout 无正文，204失效会话；GET /auth/csrf先取得当前会话保护值。
     * Cookie使用HttpOnly和SameSite Strict；本地回环HTTP不启用Secure，生产TLS须显式开启Secure配置。
     *
     * @param http Spring安全构建器，不为空
     *
     * @param json 响应序列化器，不为空
     *
     * @return 平台唯一安全过滤链，不为空
     *
     * @throws Exception 配置构建失败时启动失败，不降级开放
     */
    @Bean
    public SecurityFilterChain platformChain(HttpSecurity http, ObjectMapper json) throws Exception {
        http.requestCache(cache -> cache.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/actuator/health", "/api/v1/auth/csrf").permitAll()
                .requestMatchers("/api/v1/profile", "/api/v1/profile/password", "/api/v1/auth/lock-state", "/api/v1/auth/lock", "/api/v1/auth/unlock", "/api/v1/departments/member-directory", "/api/v1/departments", "/api/v1/departments/*", "/api/v1/members/*/department", "/api/v1/department-grants/*/*", "/api/v1/department-grants/*/*/*", "/api/v1/menus", "/api/v1/menus/*", "/api/v1/readiness", "/api/v1/readiness/*", "/api/v1/reviews", "/api/v1/reviews/reviewers", "/api/v1/reviews/*", "/api/v1/reviews/*/decide", "/api/v1/reviews/*/report", "/api/v1/reviews/*/content", "/api/v1/candidates/*/content", "/api/v1/analyses", "/api/v1/analyses/*", "/api/v1/analyses/*/cancel", "/api/v1/analyses/*/retry", "/api/v1/candidates", "/api/v1/candidates/*", "/api/v1/candidates/*/archive", "/api/v1/tasks", "/api/v1/tasks/*", "/api/v1/tasks/*/cancel", "/api/v1/tasks/*/retry", "/api/v1/tasks/*/attempts", "/api/v1/sources", "/api/v1/sources/*", "/api/v1/sources/*/status", "/api/v1/sources/*/bindings", "/api/v1/sources/*/grants", "/api/v1/sources/*/grants/*", "/api/v1/sources/*/analysis-check", "/api/v1/permissions", "/api/v1/roles", "/api/v1/roles/*", "/api/v1/members/*/roles", "/api/v1/devices", "/api/v1/devices/pairings", "/api/v1/devices/*", "/api/v1/auth/session", "/api/v1/members", "/api/v1/members/*/status", "/api/v1/systems", "/api/v1/systems/*", "/api/v1/systems/*/grants", "/api/v1/systems/*/grants/*").authenticated()
                .anyRequest().denyAll())
            .formLogin(form -> form.loginProcessingUrl("/api/v1/auth/login")
                .successHandler((request, response, authentication) -> { response.setContentType("application/json;charset=UTF-8"); response.getWriter().write("{}"); })
                .failureHandler((request, response, error) -> writeError(json, response, 401, "LOGIN_FAILED", "登录名或密码错误，或账户已停用")))
            .logout(logout -> logout.logoutUrl("/api/v1/auth/logout").deleteCookies("JSESSIONID")
                .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, error) -> writeError(json, response, 401, "UNAUTHENTICATED", "请先登录"))
                .accessDeniedHandler((request, response, error) -> writeError(json, response, 403, "FORBIDDEN", "请求无权限或会话保护已过期，请刷新重试")))
            .headers(headers -> headers.contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'")))
            .addFilterBefore(new SessionLockFilter(), UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(new LoginRateFilter(), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    /**
     * 输出稳定错误JSON，不序列化认证异常与提交的凭证。
     *
     * @param json Spring序列化器，不为空
     *
     * @param response HTTP响应，不为空
     *
     * @param status HTTP错误状态
     *
     * @param code 稳定错误码，不为空
     *
     * @param message 中文恢复提示，不含凭证
     *
     * @throws IOException 客户端断开或写入失败时抛出
     */
    private static void writeError(ObjectMapper json, HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json;charset=UTF-8"); json.writeValue(response.getOutputStream(), new ErrorVO(code, message));
    }
}
