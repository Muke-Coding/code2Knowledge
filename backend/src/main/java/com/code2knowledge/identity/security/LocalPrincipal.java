package com.code2knowledge.identity.security;

import com.code2knowledge.identity.domain.entity.AccountDO;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.User;

/** 本地会话认证快照；记录账户版本，停用再启用也不能复活旧会话，不作为当前权限事实源。 */
public class LocalPrincipal extends User {
    /** 账户认证版本，任何启停操作递增。 */
    private final int authVersion;
    /**
     * 由数据库身份建立认证快照；摘要交给Spring认证后自动擦除，不返回浏览器。
     * @param account 数据库有效身份，不为空；密码摘要只用于本次认证
     */
    public LocalPrincipal(AccountDO account) {
        super(account.getUsername(), account.getPasswordHash(), account.isEnabled(), true, true, true, AuthorityUtils.createAuthorityList("ROLE_" + account.getRole()));
        this.authVersion = account.getAuthVersion();
    }
    /** @return 认证时账户版本，用于每次请求与数据库比对，不为空 */
    public int getAuthVersion() { return authVersion; }
}
