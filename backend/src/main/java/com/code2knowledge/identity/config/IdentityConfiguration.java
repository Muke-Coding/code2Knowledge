package com.code2knowledge.identity.config;

import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.identity.service.BootstrapService;
import com.code2knowledge.identity.security.LocalPrincipal;
import org.springframework.context.annotation.*;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.password.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** 身份配置入口；仅platform持久化模式启用，不为诊断模式伪造用户。 */
@MapperScan({"com.code2knowledge.identity.mapper", "com.code2knowledge.catalog.mapper", "com.code2knowledge.runtime.mapper", "com.code2knowledge.authorization.mapper", "com.code2knowledge.source.mapper", "com.code2knowledge.task.mapper", "com.code2knowledge.candidate.mapper", "com.code2knowledge.review.mapper", "com.code2knowledge.organization.mapper"})
@Configuration
@Profile("platform")
public class IdentityConfiguration {
    /** @return BCrypt成本12编码器，输入长度在写入前严格校验 */
    @Bean
    public PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    /**
     * 登录从数据库解析身份，关闭账户使用统一认证失败响应；不返回摘要给浏览器。
     *
     * @param mapper 身份持久化入口，不为空
     *
     * @return Spring登录身份解析器，不为空
     */
    @Bean
    public UserDetailsService userDetailsService(IdentityMapper mapper) {
        return username -> {
            AccountDO account = mapper.findByUsername(username);
            if (account == null) throw new UsernameNotFoundException("身份无效");
            return new LocalPrincipal(account);
        };
    }
    /**
     * 在数据库迁移与Mapper就绪后执行受控引导，重启不重置密码。
     *
     * @param service 引导服务，不为空
     *
     * @param password 环境提供的首次密码，未设置为空且新库启动失败
     *
     * @param name 初始企业名称，默认本地企业，非空
     *
     * @return 启动阶段动作，不为空
     */
    @Bean
    public ApplicationRunner bootstrap(BootstrapService service, @Value("${C2K_BOOTSTRAP_PASSWORD:}") String password, @Value("${C2K_TENANT_NAME:本地企业}") String name) {
        return args -> service.initialize(password, name);
    }
}
