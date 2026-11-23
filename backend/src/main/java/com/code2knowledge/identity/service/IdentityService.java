package com.code2knowledge.identity.service;

import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.*;
import com.code2knowledge.identity.domain.vo.*;
import com.code2knowledge.identity.domain.dto.*;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import com.code2knowledge.identity.security.LocalPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import lombok.RequiredArgsConstructor;
import java.util.List;
import java.util.UUID;
import com.code2knowledge.authorization.mapper.AuthorizationMapper;
import com.code2knowledge.authorization.constant.PermissionCodes;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 身份与成员应用服务；企业取自当前认证身份，不信任请求tenant字段。
 * 创建、禁用及审计同事务；无软删除、消息投递和跨节点会话恢复。
 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class IdentityService {
    /** 源目录生成当前授权导航，不产生额外资源权限。 */
    private final com.code2knowledge.authorization.service.PermissionCatalogService permissionCatalog;
    /** 唯一身份持久化入口，业务SQL由XML维护。 */
    private final IdentityMapper mapper;
    /** 当前RBAC事实读取与企业写事务互斥，不使用会话快照授权。 */
    private final AuthorizationMapper authorization;
    /** 密码单向编码组件，不存储或返回明文。 */
    private final PasswordEncoder passwords;

    /**
     * 每次业务请求重新读取身份，确保禁用及重新启用后旧会话均失效。
     *
     * @return 当前有效账户，只在服务内部使用，不返回null
     *
     * @throws ApiException 匿名、身份已删除或禁用时返回401
     */
    public AccountDO current() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof LocalPrincipal)) throw new ApiException(401, "UNAUTHENTICATED", "请重新登录");
        AccountDO account = mapper.findByUsername(authentication.getName());
        if (account == null || !account.isEnabled() || account.getAuthVersion() != ((LocalPrincipal) authentication.getPrincipal()).getAuthVersion()) throw new ApiException(401, "UNAUTHENTICATED", "请重新登录");
        return account;
    }
    /**
     * 校验一个或多个允许动作；写事务先锁企业再重读身份与动作，使撤权与写入有明确提交顺序。
     *
     * @param actions 任一满足即可的已实现动作，至少一项，不接受外部输入通配符
     *
     * @return 当前有资格账户，不为空
     *
     * @throws ApiException 匿名/失效401或无动作资格403
     */
    public AccountDO require(String... actions) {
        AccountDO actor = current();
        if (TransactionSynchronizationManager.isActualTransactionActive() && !TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            authorization.lockTenant(actor.getTenantId()); actor = current();
        }
        List<String> values = permissions(actor);
        for (String action : actions) if (values.contains(action)) return actor;
        throw new ApiException(403, "FORBIDDEN", "当前角色没有此操作权限");
    }
    /**
     * @param actor 当前有效账户，不为空
     * @return 当前动作并集，无权限时空列表，不缓存 */
    public List<String> permissions(AccountDO actor) { return authorization.effective(actor.getTenantId(), actor.getId()); }
    /** @return 当前会话公开信息，不含密码，不为空 */
    @org.springframework.transaction.annotation.Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public SessionVO session() {
        AccountDO account = current();
        TenantDO tenant = mapper.findTenant(account.getTenantId());
        List<String> actions = permissions(account);
        return new SessionVO(account.getId(), account.getUsername(), account.getDisplayName(), tenant.getName(), account.getRole(), actions, permissionCatalog.navigation(actions, account.getTenantId()));
    }
    /**
     * @return 同企业成员管理/角色与部门分配/目录与来源授权所需的成员摘要，不含密码，不为空
     * @throws ApiException 无任一对应管理动作时拒绝 */
    public List<MemberVO> members() { return mapper.listMembers(require(PermissionCodes.MEMBER_READ, PermissionCodes.ROLE_ASSIGN, PermissionCodes.CATALOG_GRANT, PermissionCodes.SOURCE_GRANT, PermissionCodes.DEPARTMENT_ASSIGN).getTenantId()); }
    /**
     * 创建普通成员和审计；数据库全局登录名唯一，不支持隐式提权或重复创建幂等键。
     *
     * @param input 登录名、名称及初始密码，不为空
     *
     * @return 新普通成员公开视图，不为空
     *
     * @throws ApiException 权限不足或参数不合法时拒绝
     */
    @Transactional
    public MemberVO create(CreateMemberDTO input) {
        AccountDO actor = require(PermissionCodes.MEMBER_CREATE);
        if (input.getUsername() == null || !input.getUsername().matches("[a-z0-9][a-z0-9._-]{2,63}")) throw new ApiException(400, "INVALID_USERNAME", "登录名须为3到64位小写字母、数字、点、下划线或横线");
        requirePassword(input.getPassword());
        String name = text(input.getDisplayName(), 80, "显示名称");
        AccountDO target = new AccountDO();
        target.setId(UUID.randomUUID().toString()); target.setTenantId(actor.getTenantId());
        target.setUsername(input.getUsername()); target.setDisplayName(name);
        target.setRole("MEMBER"); target.setEnabled(true); target.setPasswordHash(passwords.encode(input.getPassword()));
        mapper.insertAccount(target);
        mapper.audit(actor.getTenantId(), actor.getId(), "member.created", target.getId());
        return new MemberVO(target.getId(), target.getUsername(), target.getDisplayName(), target.getRole(), true);
    }
    /**
     * 修改同企业普通成员状态；管理员不可通过此入口被禁用，无事件投递或会话批量删除。
     *
     * @param id 普通成员UUID，不为空
     *
     * @param input 目标启用状态，不为空且enabled必填
     *
     * @throws ApiException 状态为空或目标非同企业普通成员时拒绝
     */
    @Transactional
    public void status(String id, MemberStatusDTO input) {
        AccountDO actor = require(PermissionCodes.MEMBER_STATUS);
        if (input.getEnabled() == null) throw new ApiException(400, "INVALID_STATUS", "请选择启用状态");
        if (mapper.setEnabled(actor.getTenantId(), id, input.getEnabled()) != 1) throw new ApiException(404, "NOT_FOUND", "普通成员不存在");
        mapper.audit(actor.getTenantId(), actor.getId(), input.getEnabled() ? "member.enabled" : "member.disabled", id);
    }
    /**
     * 校验授权目标，外企业ID与不存在ID均返回404。
     *
     * @param id 目标成员UUID，不为空
     *
     * @param tenantId 从操作者解析的企业UUID，不为空
     *
     * @return 同企业普通成员，不为空；允许禁用成员已有授权被撤销
     *
     * @throws ApiException 不属于当前企业普通成员时拒绝
     */
    public AccountDO member(String id, String tenantId) {
        AccountDO account = mapper.findById(id);
        if (account == null || !tenantId.equals(account.getTenantId()) || !"MEMBER".equals(account.getRole())) throw new ApiException(404, "NOT_FOUND", "普通成员不存在");
        return account;
    }
    /**
     * 校验BCrypt输入字节范围，禁止静默截断与控制字符。
     *
     * @param password 待校验密码，不可为空，16到72个ASCII可打印字符
     *
     * @throws ApiException 密码不符合长度或字符约束时拒绝
     */
    public static void requirePassword(String password) {
        if (password == null || !password.matches("[\\x21-\\x7e]{16,72}")) throw new ApiException(400, "INVALID_PASSWORD", "密码须为16到72个非空格ASCII字符");
    }
    /**
     * 校验短文本，不改变有效内容的大小写。
     *
     * @param value 待校验文本，null非法
     *
     * @param max 最大字符数，单位字符，正数
     *
     * @param label 面向用户的字段名称，不为空
     *
     * @return 去除首尾空格后的文本，不为空
     *
     * @throws ApiException 空白或超长时拒绝
     */
    public static String text(String value, int max, String label) {
        if (value == null || value.trim().isEmpty() || value.trim().length() > max) throw new ApiException(400, "INVALID_TEXT", label + "不能为空且不能超过" + max + "字符");
        return value.trim();
    }
}
