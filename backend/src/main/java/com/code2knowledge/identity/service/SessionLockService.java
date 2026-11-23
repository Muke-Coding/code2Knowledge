package com.code2knowledge.identity.service;
import com.code2knowledge.identity.domain.dto.UnlockDTO;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.identity.domain.vo.LockStateVO;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.security.crypto.password.PasswordEncoder;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
/** 单节点浏览器会话锁；同步当前HttpSession的锁定/解锁顺序，不改变设备任务或其他浏览器会话。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class SessionLockService {
    /** 服务端会话属性，不信任浏览器持久化的锁定标记。 */
    private static final String LOCK_KEY="c2k.session.locked";
    /** 重核当前有效身份和认证版本。 */
    private final IdentityService identity;
    /** 解锁只验证当前账户密码，不建立新身份。 */
    private final PasswordEncoder passwords;
    /** @param session 当前服务端会话，允许null @return 是否被服务器锁定，缺失会话为false */
    public static boolean locked(HttpSession session) { return session!=null && Boolean.TRUE.equals(session.getAttribute(LOCK_KEY)); }
    /** @param session 当前请求已有会话 @return 有效当前账户最小锁状态 @throws ApiException 401认证版本已变化或账户停用 */
    public LockStateVO state(HttpSession session) { AccountDO actor=identity.current();return new LockStateVO(locked(session),actor.getDisplayName()); }
    /** @param session 当前已认证会话，不为空 @return 锁定后的最小状态；重复调用幂等 @throws ApiException 401当前身份无效；只拒绝标记后进入的新请求，不撤回已进入业务事务的请求 */
    public LockStateVO lock(HttpSession session) { synchronized(session) { AccountDO actor=identity.current();session.setAttribute(LOCK_KEY,true);return new LockStateVO(true,actor.getDisplayName()); } }
    /** @param session 当前锁定会话，不为空 @param input 本人密码，不得包含其他账户 @return 解锁后状态；错误保持锁定 @throws ApiException 400输入不符、401身份无效；过滤器对IP及账户限速，CSRF由安全链校验 */
    public LockStateVO unlock(HttpSession session,UnlockDTO input) {
        synchronized(session) {
            AccountDO actor=identity.current();
            if(!locked(session)) return new LockStateVO(false,actor.getDisplayName());
            String value=input==null?null:input.getPassword();
            if(value==null || !value.matches("[\\x21-\\x7e]{16,72}") || !passwords.matches(value,actor.getPasswordHash())) throw new ApiException(400,"UNLOCK_FAILED","密码不正确，请重试");
            identity.current();session.removeAttribute(LOCK_KEY);return new LockStateVO(false,actor.getDisplayName());
        }
    }
}
