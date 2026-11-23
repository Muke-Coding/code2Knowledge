package com.code2knowledge.authorization.controller;

import com.code2knowledge.authorization.service.AuthorizationService;
import com.code2knowledge.authorization.domain.dto.SaveRoleDTO;
import com.code2knowledge.authorization.domain.dto.SetMemberRolesDTO;
import com.code2knowledge.authorization.domain.vo.RoleVO;
import com.code2knowledge.authorization.domain.vo.PermissionVO;
import com.code2knowledge.authorization.domain.vo.MemberRolesVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** RBAC浏览器HTTP入口；按读取、创建、编辑、删除和分配动作检查当前会话，企业来自服务端，写操作需CSRF；不直接访问持久化对象。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class AuthorizationController {
    /** 角色应用服务，统一资格、归属与事务。 */
    private final AuthorizationService service;
    /**
     * @return 已实现权限动作目录；GET无副作用，401无身份/403无资格 */
    @GetMapping("/permissions")
    public List<PermissionVO> permissions() { return service.permissions(); }
    /**
     * @return 同企业及只读内置角色；GET无副作用，401无身份/403无资格 */
    @GetMapping("/roles")
    public List<RoleVO> roles() { return service.roles(); }
    /**
     *
     * @param input 角色名称说明与显式动作JSON，不为空
     *
     * @return 新角色，201成功；400参数/401身份/403权限/409重名；CSRF且写审计 */
    @PostMapping("/roles")
    @ResponseStatus(HttpStatus.CREATED)
    public RoleVO create(@RequestBody SaveRoleDTO input) { return service.create(input); }
    /**
     *
     * @param id 自定义角色ID
     *
     * @param input 完整角色含最新revision的JSON
     *
     * @return 更新后角色，200成功；400参数/401身份/403权限/404隐藏/409内置或冲突；CSRF且写审计 */
    @PutMapping("/roles/{id}")
    public RoleVO update(@PathVariable String id, @RequestBody SaveRoleDTO input) { return service.update(id, input); }
    /**
     *
     * @param id 自定义角色ID
     *
     * @param revision 最新编辑版本
     *
     * @throws com.code2knowledge.common.exception.ApiException 401身份/403权限/404隐藏/409引用或冲突；CSRF，204删除并审计，不级联分配 */
    @DeleteMapping("/roles/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id, @RequestParam int revision) { service.delete(id, revision); }
    /**
     *
     * @param id 同企业普通成员ID
     *
     * @return 角色ID及版本；GET无副作用，401身份/403权限/404隐藏目标 */
    @GetMapping("/members/{id}/roles")
    public MemberRolesVO memberRoles(@PathVariable String id) { return service.memberRoles(id); }
    /**
     *
     * @param id 同企业普通成员ID
     *
     * @param input 显式roleIds与最新revision的JSON
     *
     * @throws com.code2knowledge.common.exception.ApiException 400参数/401身份/403权限/404隐藏/409内置或冲突；CSRF，204替换角色并审计，后续请求实时生效 */
    @PutMapping("/members/{id}/roles")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setMemberRoles(@PathVariable String id, @RequestBody SetMemberRolesDTO input) { service.setMemberRoles(id, input); }
}
