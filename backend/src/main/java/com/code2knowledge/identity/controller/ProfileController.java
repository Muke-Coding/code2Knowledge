package com.code2knowledge.identity.controller;
import com.code2knowledge.identity.service.ProfileService;
import com.code2knowledge.identity.service.SessionLockService;
import com.code2knowledge.identity.domain.dto.ProfileUpdateDTO;
import com.code2knowledge.identity.domain.dto.PasswordChangeDTO;
import com.code2knowledge.identity.domain.dto.UnlockDTO;
import com.code2knowledge.identity.domain.vo.ProfileVO;
import com.code2knowledge.identity.domain.vo.LockStateVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
/** 本人账户及当前会话HTTP入口；会话身份固定目标，写入均需CSRF，无角色管理或跨账户参数。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
public class ProfileController {
    /** 本人资料短事务，不改变角色和资源范围。 */
    private final ProfileService profiles;
    /** 只操作当前会话的服务端锁。 */
    private final SessionLockService locks;
    /** @return 本人资料；GET无副作用，401无有效身份、423会话锁定，无需业务角色 */
    @GetMapping("/api/v1/profile")
    public ProfileVO get() { return profiles.get(); }
    /** @param input 名称及资料版本JSON @return 最新本人资料；PUT须CSRF，400输入、401身份、409旧版本、423锁定，保存审计 */
    @PutMapping("/api/v1/profile")
    public ProfileVO update(@RequestBody ProfileUpdateDTO input) { return profiles.update(input); }
    /** @param input 当前密码与新密码JSON @param session 当前浏览器会话 @throws com.code2knowledge.common.exception.ApiException POST须CSRF，400密码、401身份、423锁定；204成功改密并失效当前会话，其他旧会话下次业务请求401 */
    @PostMapping("/api/v1/profile/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void password(@RequestBody PasswordChangeDTO input,HttpSession session) { profiles.password(input);session.invalidate();SecurityContextHolder.clearContext(); }
    /** @param session 当前浏览器会话 @return 仅锁定标记及名称；GET无业务副作用，401身份无效；锁定时仍可读以恢复界面 */
    @GetMapping("/api/v1/auth/lock-state")
    public LockStateVO state(HttpSession session) { return locks.state(session); }
    /** @param session 当前浏览器会话 @return 锁定状态；POST须CSRF，401身份无效，后续业务请求423，不停止运行时 */
    @PostMapping("/api/v1/auth/lock")
    public LockStateVO lock(HttpSession session) { return locks.lock(session); }
    /** @param input 本人密码JSON @param session 当前锁定会话 @return 解锁状态；POST须CSRF，400密码、401身份、429限速，成功恢复当前会话而不建立新身份 */
    @PostMapping("/api/v1/auth/unlock")
    public LockStateVO unlock(@RequestBody UnlockDTO input,HttpSession session) { return locks.unlock(session,input); }
}
