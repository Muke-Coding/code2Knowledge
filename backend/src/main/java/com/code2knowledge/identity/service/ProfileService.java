package com.code2knowledge.identity.service;
import com.code2knowledge.identity.domain.dto.ProfileUpdateDTO;
import com.code2knowledge.identity.domain.dto.PasswordChangeDTO;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.identity.domain.entity.ProfileDO;
import com.code2knowledge.identity.domain.vo.ProfileVO;
import com.code2knowledge.identity.mapper.ProfileMapper;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.authorization.mapper.AuthorizationMapper;
import com.code2knowledge.common.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.security.crypto.password.PasswordEncoder;
/** 本人资料服务；身份始终来自当前会话，无管理权限要求，也不允许指定目标账户。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class ProfileService {
    /** 每次重新核验身份版本。 */
    private final IdentityService identity;
    /** 本人资料SQL。 */
    private final ProfileMapper mapper;
    /** 与其他身份写入保持相同企业锁顺序。 */
    private final AuthorizationMapper authorization;
    /** 同事务审计，不含密码内容。 */
    private final IdentityMapper audit;
    /** BCrypt验证及编码，不保存明文。 */
    private final PasswordEncoder passwords;
    /** @return 本人资料与角色；未分配部门为空串 @throws ApiException 401身份过期 */
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProfileVO get() { return view(identity.current()); }
    /** @param input 明确本人名称和资料版本 @return 最新本人资料 @throws ApiException 400无效名称、401身份过期、409旧版本；企业锁内原子保存审计，无事件投递 */
    @Transactional
    public ProfileVO update(ProfileUpdateDTO input) {
        AccountDO actor=lockedActor();
        if(input==null || input.getRevision()==null) throw new ApiException(400,"INVALID_PROFILE","请提交显示名称及资料版本");
        String name=IdentityService.text(input.getDisplayName(),80,"显示名称");
        if(mapper.update(actor.getTenantId(),actor.getId(),name,input.getRevision())!=1) throw new ApiException(409,"PROFILE_CHANGED","个人资料已变化，请重新加载后修改");
        audit.audit(actor.getTenantId(),actor.getId(),"profile.updated",actor.getId());return view(actor);
    }
    /** @param input 当前密码和新密码，仅本次使用 @throws ApiException 400密码规则/原密码不符、401身份过期、409认证版本变化；同企业锁内改密及审计，所有旧会话下次请求401 */
    @Transactional
    public void password(PasswordChangeDTO input) {
        AccountDO actor=lockedActor();
        if(input==null) throw new ApiException(400,"INVALID_PASSWORD","请输入当前密码和新密码");
        IdentityService.requirePassword(input.getNewPassword());
        if(!matches(input.getCurrentPassword(),actor.getPasswordHash())) throw new ApiException(400,"PASSWORD_MISMATCH","当前密码不正确");
        if(matches(input.getNewPassword(),actor.getPasswordHash())) throw new ApiException(400,"PASSWORD_UNCHANGED","新密码不能与当前密码相同");
        if(mapper.password(actor.getTenantId(),actor.getId(),passwords.encode(input.getNewPassword()),actor.getAuthVersion())!=1) throw new ApiException(409,"IDENTITY_CHANGED","账户状态已变化，请重新登录");
        audit.audit(actor.getTenantId(),actor.getId(),"profile.password_changed",actor.getId());
    }
    /** @return 取得企业写锁后再次核验的本人身份；锁序与管理接口一致 @throws ApiException 401身份已变化 */
    private AccountDO lockedActor() { AccountDO actor=identity.current();authorization.lockTenant(actor.getTenantId());return identity.current(); }
    /** @param actor 已核验当前身份 @return 不含持久化敏感字段的本人视图 */
    private ProfileVO view(AccountDO actor) { ProfileDO row=mapper.find(actor.getTenantId(),actor.getId());return new ProfileVO(row.getUsername(),row.getDisplayName(),row.getTenantName(),row.getDepartmentName(),mapper.roles(actor.getTenantId(),actor.getId()),row.getRevision()); }
    /** @param raw 本次密码，null/越界无效 @param hash 有效数据库摘要 @return 是否符合现行BCrypt密码，失败不回显输入 */
    private boolean matches(String raw,String hash) { return raw!=null && raw.matches("[\\x21-\\x7e]{16,72}") && passwords.matches(raw,hash); }
}
