package com.code2knowledge.identity.service;

import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.identity.domain.entity.TenantDO;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import lombok.RequiredArgsConstructor;
import java.util.UUID;

/** 首次本地管理员引导；仅platform配置启用，固定初始企业ID防止并发生成多个企业，不提供公开注册。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class BootstrapService {
    /** 身份初始化数据库入口。 */
    private final IdentityMapper mapper;
    /** 单向密码哈希，不保留明文。 */
    private final PasswordEncoder encoder;
    /**
     * 仅空数据库创建初始管理员；重启不覆盖既有密码。事务失败则不留下半个企业。
     *
     * @param password 首次引导密码，空数据库时必填；已有企业时不使用
     *
     * @param tenantName 初始企业名称，空数据库时非空
     *
     * @throws IllegalStateException 空数据库缺少安全密码或名称时拒绝启动
     */
    @Transactional
    public void initialize(String password, String tenantName) {
        if (mapper.countTenants() > 0) return;
        try { IdentityService.requirePassword(password); } catch (RuntimeException error) { throw new IllegalStateException("首次启动须配置C2K_BOOTSTRAP_PASSWORD，至少16个ASCII字符"); }
        TenantDO tenant = new TenantDO(); tenant.setId("00000000-0000-0000-0000-000000000001"); tenant.setName(IdentityService.text(tenantName, 120, "企业名称"));
        mapper.insertTenant(tenant);
        AccountDO account = new AccountDO(); account.setId(UUID.randomUUID().toString()); account.setTenantId(tenant.getId());
        account.setUsername("admin"); account.setDisplayName("管理员"); account.setRole("ADMIN"); account.setEnabled(true); account.setPasswordHash(encoder.encode(password));
        mapper.insertAccount(account); mapper.audit(tenant.getId(), account.getId(), "tenant.bootstrapped", tenant.getId());
    }
}
