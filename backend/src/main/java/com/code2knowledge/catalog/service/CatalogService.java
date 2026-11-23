package com.code2knowledge.catalog.service;

import com.code2knowledge.catalog.mapper.CatalogMapper;
import com.code2knowledge.catalog.domain.entity.SystemDO;
import com.code2knowledge.catalog.domain.vo.*;
import com.code2knowledge.catalog.domain.dto.*;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.List;
import java.util.UUID;
import com.code2knowledge.authorization.constant.PermissionCodes;

/** 系统目录服务；元数据管理与catalog.read独立校验，所有写入与审计同事务，无知识授权、软删除或消息投递。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class CatalogService {
    /** 企业过滤和ACL读取的持久化入口。 */
    private final CatalogMapper mapper;
    /** 身份及管理资格入口，不从请求体接受tenant。 */
    private final IdentityService identity;
    /** 仅用于同事务审计，不在服务内执行SQL。 */
    private final IdentityMapper audit;
    /** @return 当前有目录资格的系统，空列表不泄漏隐藏数量 */
    public List<SystemVO> list() {
        AccountDO actor = identity.require(PermissionCodes.CATALOG_READ);
        return mapper.list(actor.getTenantId(), actor.getId(), identity.permissions(actor).contains(PermissionCodes.CATALOG_READ_ALL));
    }
    /**
     * @param id 系统UUID，不为空
     * @return 有目录读取资格的系统，不为空
     * @throws ApiException 无权限或不存在均404 */
    public SystemVO get(String id) {
        AccountDO actor = identity.require(PermissionCodes.CATALOG_READ);
        SystemVO system = mapper.find(actor.getTenantId(), id, actor.getId(), identity.permissions(actor).contains(PermissionCodes.CATALOG_READ_ALL));
        if (system == null) throw new ApiException(404, "NOT_FOUND", "系统不存在或无访问权限");
        return system;
    }
    /**
     * 持有catalog.create者登记目录元数据，企业内名称唯一；不授予普通成员任何权限。
     *
     * @param input 名称和描述，不为空
     *
     * @return 新系统元数据，不为空
     *
     * @throws ApiException 无管理资格或文本不合法时拒绝
     */
    @Transactional
    public SystemVO create(CreateSystemDTO input) {
        AccountDO actor = identity.require(PermissionCodes.CATALOG_CREATE);
        String name = IdentityService.text(input.getName(), 120, "系统名称");
        String description = input.getDescription() == null ? "" : input.getDescription().trim();
        if (description.length() > 500) throw new ApiException(400, "INVALID_TEXT", "描述不能超过500字符");
        SystemDO system = new SystemDO(); system.setId(UUID.randomUUID().toString()); system.setTenantId(actor.getTenantId()); system.setName(name); system.setDescription(description);
        mapper.insert(system); audit.audit(actor.getTenantId(), actor.getId(), "catalog.created", system.getId());
        return new SystemVO(system.getId(), name, description);
    }
    /**
     * @param id 同企业系统UUID，不为空
     * @return 目录读取授权，不为空
     * @throws ApiException 无catalog.grant或系统不可见时拒绝 */
    public List<GrantVO> grants(String id) { AccountDO actor = identity.require(PermissionCodes.CATALOG_GRANT); get(id); return mapper.grants(actor.getTenantId(), id); }
    /**
     * 幂等增加或撤销目录读取权；复合外键阻止跨企业，重复授权不产生重复审计。
     *
     * @param id 系统UUID，不为空
     *
     * @param memberId 同企业普通成员UUID，不为空
     *
     * @param grant true授予，false撤销；不影响知识或证据权限
     *
     * @throws ApiException 无catalog.grant、跨企业或目标不存在时拒绝
     */
    @Transactional
    public void permission(String id, String memberId, boolean grant) {
        AccountDO actor = identity.require(PermissionCodes.CATALOG_GRANT); get(id); identity.member(memberId, actor.getTenantId());
        int changed = grant ? mapper.grant(actor.getTenantId(), id, memberId) : mapper.revoke(actor.getTenantId(), id, memberId);
        if (changed > 0) audit.auditPermission(actor.getTenantId(), actor.getId(), grant ? "catalog.granted" : "catalog.revoked", id, memberId);
    }
}
