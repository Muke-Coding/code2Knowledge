package com.code2knowledge.authorization.service;

import com.code2knowledge.authorization.mapper.AuthorizationMapper;
import com.code2knowledge.authorization.domain.entity.RoleDO;
import com.code2knowledge.authorization.domain.dto.SaveRoleDTO;
import com.code2knowledge.authorization.domain.dto.SetMemberRolesDTO;
import com.code2knowledge.authorization.domain.vo.RoleVO;
import com.code2knowledge.authorization.domain.vo.PermissionVO;
import com.code2knowledge.authorization.domain.vo.MemberRolesVO;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.List;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** 企业RBAC应用服务；写事务先锁企业再验动作，角色/分配/审计原子提交。无软删除、策略缓存或事件投递；删除有引用角色必须先撤分配。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class AuthorizationService {
    /** 源目录依赖校验，不自动赠予未勾选动作。 */
    private final PermissionCatalogService catalog;
    /** 角色及动作持久化入口，业务SQL在XML。 */
    private final AuthorizationMapper mapper;
    /** 当前会话及每请求动作门禁。 */
    private final IdentityService identity;
    /** 同事务审计入口，不记录密码和凭证。 */
    private final IdentityMapper audit;

    /**
     *
     * @return 已实现动作目录，不为空
     *
     * @throws ApiException 无role.read/create/update/delete/assign时403 */
    public List<PermissionVO> permissions() { identity.require(PermissionCodes.ROLE_READ, PermissionCodes.ROLE_CREATE, PermissionCodes.ROLE_UPDATE, PermissionCodes.ROLE_ASSIGN); return mapper.permissions(); }
    /**
     *
     * @return 同企业及内置角色，不为空
     *
     * @throws ApiException 无role.read/create/update/delete/assign时403 */
    public List<RoleVO> roles() {
        AccountDO actor = identity.require(PermissionCodes.ROLE_READ, PermissionCodes.ROLE_CREATE, PermissionCodes.ROLE_UPDATE, PermissionCodes.ROLE_ASSIGN);
        List<RoleVO> result = new ArrayList<>();
        for (RoleDO role : mapper.roles(actor.getTenantId())) result.add(view(role));
        return result;
    }
    /**
     * 创建自定义角色；空动作数组有效，无权限授予默认值；重名由数据库返回409。
     *
     *
     * @param input 名称、描述、显式动作数组，非空
     *
     *
     * @return 新角色及版本，不为空
     *
     *
     * @throws ApiException 无权403、非法动作或缺失数组400
     */
    @Transactional
    public RoleVO create(SaveRoleDTO input) {
        AccountDO actor = identity.require(PermissionCodes.ROLE_CREATE);
        validate(input);
        if (input.getRevision() != null && input.getRevision() != 0) throw new ApiException(400, "INVALID_REVISION", "新角色版本必须为0");
        RoleDO role = new RoleDO(); role.setId(UUID.randomUUID().toString()); role.setTenantId(actor.getTenantId());
        role.setName(IdentityService.text(input.getName(), 80, "角色名称")); role.setDescription(description(input.getDescription()));
        mapper.insertRole(role); replacePermissions(role.getId(), input.getPermissions());
        audit.audit(actor.getTenantId(), actor.getId(), "role.created", role.getId());
        return view(role);
    }
    /**
     * 更新当前企业自定义角色，引用成员下一次请求立即按新动作判定；不改变登录认证版本。
     *
     *
     * @param id 自定义角色UUID，非空
     *
     *
     * @param input 完整角色与期望版本，非空
     *
     *
     * @return 更新后角色，不为空
     *
     *
     * @throws ApiException 无权403、内置或版本冲突409、外企业或不存在404、非法参数400
     */
    @Transactional
    public RoleVO update(String id, SaveRoleDTO input) {
        AccountDO actor = identity.require(PermissionCodes.ROLE_UPDATE);
        RoleDO role = editable(actor.getTenantId(), id);
        validate(input);
        if (input.getRevision() == null || input.getRevision() != role.getRevision()) conflict();
        role.setName(IdentityService.text(input.getName(), 80, "角色名称")); role.setDescription(description(input.getDescription()));
        if (mapper.updateRole(role) != 1) conflict();
        replacePermissions(id, input.getPermissions()); role.setRevision(role.getRevision() + 1);
        audit.audit(actor.getTenantId(), actor.getId(), "role.updated", id);
        return view(role);
    }
    /**
     * 删除无引用自定义角色；不存在返回404，有引用拒绝，不隐式撤销成员角色。
     *
     *
     * @param id 自定义角色UUID，非空
     *
     *
     * @param revision 当前列表版本，非负
     *
     *
     * @throws ApiException 无权403、内置/有引用/版本冲突409、外企业或不存在404
     */
    @Transactional
    public void delete(String id, int revision) {
        AccountDO actor = identity.require(PermissionCodes.ROLE_DELETE);
        RoleDO role = editable(actor.getTenantId(), id);
        if (revision != role.getRevision()) conflict();
        if (mapper.assignedCount(actor.getTenantId(), id) > 0) throw new ApiException(409, "ROLE_IN_USE", "请先撤销此角色的成员分配");
        mapper.clearPermissions(id); mapper.deleteRole(actor.getTenantId(), id);
        audit.audit(actor.getTenantId(), actor.getId(), "role.deleted", id);
    }
    /**
     * 读取普通成员附加角色，不返回跨企业或引导管理员分配入口。
     *
     *
     * @param memberId 同企业普通成员UUID
     *
     *
     * @return 当前分配及并发版本，不为空
     *
     *
     * @throws ApiException 无role.read/create/update/delete/assign时403，非法目标404
     */
    public MemberRolesVO memberRoles(String memberId) {
        AccountDO actor = identity.require(PermissionCodes.ROLE_ASSIGN); identity.member(memberId, actor.getTenantId());
        return new MemberRolesVO(mapper.memberRevision(actor.getTenantId(), memberId), mapper.memberRoles(actor.getTenantId(), memberId));
    }
    /**
     * 全量替换成员附加角色；显式空数组撤销，重复同版本相同分配无副作用；过期版本一律409。
     *
     *
     * @param memberId 同企业普通成员UUID，不为空
     *
     *
     * @param input 显式角色数组与最新版本，不为空
     *
     *
     * @throws ApiException 无权403、非法目标404、内置/冲突409、遗漏或重复数组400
     */
    @Transactional
    public void setMemberRoles(String memberId, SetMemberRolesDTO input) {
        AccountDO actor = identity.require(PermissionCodes.ROLE_ASSIGN); identity.member(memberId, actor.getTenantId());
        if (input.getRoleIds() == null || input.getRoleIds().size() > 100 || input.getRoleIds().contains(null)
                || new HashSet<>(input.getRoleIds()).size() != input.getRoleIds().size()) throw new ApiException(400, "INVALID_ROLES", "请显式提交不重复的角色数组，最多100项");
        int revision = mapper.memberRevision(actor.getTenantId(), memberId);
        if (input.getRevision() == null || input.getRevision() != revision) conflict();
        for (String id : input.getRoleIds()) editable(actor.getTenantId(), id);
        if (new HashSet<>(mapper.memberRoles(actor.getTenantId(), memberId)).equals(new HashSet<>(input.getRoleIds()))) return;
        if (mapper.bumpMemberRevision(actor.getTenantId(), memberId, revision) != 1) conflict();
        mapper.clearMemberRoles(actor.getTenantId(), memberId);
        for (String id : input.getRoleIds()) mapper.addMemberRole(actor.getTenantId(), memberId, id);
        audit.audit(actor.getTenantId(), actor.getId(), "member.roles_changed", memberId);
    }
    /**
     *
     * @param role 已核验归属角色
     *
     * @return 含当前动作的公开视图，不为空 */
    private RoleVO view(RoleDO role) { return new RoleVO(role.getId(), role.getName(), role.getDescription(), role.isBuiltIn(), role.getRevision(), mapper.rolePermissions(role.getId())); }
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param id 角色ID
     *
     * @return 可编辑角色，不为空
     *
     * @throws ApiException 隐藏目标404或内置409 */
    private RoleDO editable(String tenantId, String id) {
        RoleDO role = mapper.role(tenantId, id);
        if (role == null) throw new ApiException(404, "NOT_FOUND", "角色不存在");
        if (role.isBuiltIn()) throw new ApiException(409, "BUILT_IN_ROLE", "内置基础角色不可修改、删除或分配");
        return role;
    }
    /**
     *
     * @param input 待校验角色输入
     *
     * @throws ApiException 缺少数组、重复、超量或未知动作时400 */
    private void validate(SaveRoleDTO input) {
        List<String> values = input.getPermissions();
        if (values == null || values.size() > 100 || values.contains(null) || new HashSet<>(values).size() != values.size()) throw new ApiException(400, "INVALID_PERMISSIONS", "请显式选择不重复的权限动作，最多100项");
        catalog.validate(values);
        Set<String> allowed = new HashSet<>();
        for (PermissionVO permission : mapper.permissions()) allowed.add(permission.getCode());
        if (!allowed.containsAll(values)) throw new ApiException(400, "UNKNOWN_PERMISSION", "包含尚未实现或未知的权限动作");
    }
    /**
     *
     * @param id 已校验自定义角色ID
     *
     * @param values 通过目录校验的显式动作数组；空表示无额外动作 */
    private void replacePermissions(String id, List<String> values) { mapper.clearPermissions(id); for (String code : values) mapper.addPermission(id, code); }
    /**
     *
     * @param value 描述，null按空串
     *
     * @return 最多300字符的说明，不为空
     *
     * @throws ApiException 超长时400 */
    private String description(String value) { String text = value == null ? "" : value.trim(); if (text.length() > 300) throw new ApiException(400, "INVALID_TEXT", "角色说明不能超过300字符"); return text; }
    /**
     * @throws ApiException 固定409，要求刷新并重新确认授权，不盲目重试覆盖 */
    private void conflict() { throw new ApiException(409, "REVISION_CONFLICT", "授权已被其他操作修改，请刷新后重新确认"); }
}
