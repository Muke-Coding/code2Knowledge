package com.code2knowledge.platform.security;

import com.code2knowledge.platform.config.PlatformApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 平台安全基线验收，仅证明健康状态与默认拒绝，不代表企业身份和对象权限已实现。
 */
@SpringBootTest(classes = PlatformApplication.class)
@AutoConfigureMockMvc
class BaselineSecurityTest {

    /** Spring 注入的隔离 HTTP 测试入口，不连接外部网络。 */
    @Autowired
    private MockMvc mvc;

    /**
     * 验证匿名健康读取仅返回公开状态，不包含组件或数据库细节。
     *
     * @throws Exception 请求执行或断言失败时抛出
     */
    @Test
    void anonymousHealthContainsOnlyStatus() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}", true));
    }

    /**
     * 验证匿名用户不能读取不存在的业务入口，避免未来新增路由意外公开。
     *
     * @throws Exception 请求执行或断言失败时抛出
     */
    @Test
    void anonymousBusinessRequestIsDenied() throws Exception {
        mvc.perform(get("/api/v1/systems")).andExpect(status().isForbidden());
    }

    /**
     * 验证模拟已认证身份和有效 CSRF 也不能绕过业务默认拒绝。
     *
     * @throws Exception 请求执行或断言失败时抛出
     */
    @Test
    void authenticatedRequestCannotBypassDefaultDeny() throws Exception {
        mvc.perform(post("/api/v1/systems").with(user("reviewer")).with(csrf()))
                .andExpect(status().isForbidden());
    }

    /**
     * 验证无 CSRF 的写请求仍被阻断，安全基线未禁用浏览器写保护。
     *
     * @throws Exception 请求执行或断言失败时抛出
     */
    @Test
    void writeWithoutCsrfIsDenied() throws Exception {
        mvc.perform(post("/actuator/health")).andExpect(status().isForbidden());
    }
}
