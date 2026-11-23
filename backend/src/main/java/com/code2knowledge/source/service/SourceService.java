package com.code2knowledge.source.service;

import com.code2knowledge.source.mapper.SourceMapper;
import com.code2knowledge.source.constant.SourceRules;
import com.code2knowledge.source.domain.entity.SourceDO;
import com.code2knowledge.source.domain.dto.SaveSourceDTO;
import com.code2knowledge.source.domain.dto.SourceGrantDTO;
import com.code2knowledge.source.domain.dto.SourceRevisionDTO;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.source.domain.vo.SourcePageVO;
import com.code2knowledge.source.domain.vo.SourceGrantVO;
import com.code2knowledge.source.domain.vo.SourceCheckVO;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.catalog.mapper.CatalogMapper;
import com.code2knowledge.catalog.domain.vo.SystemVO;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import lombok.RequiredArgsConstructor;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.UUID;

/** 来源登记与逐项分析资格服务；登记不访问Git/文件/模型。写事务先锁企业，版本、绑定、授权和审计原子提交；无物理删除/软删除或事件投递。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class SourceService {
    /** 来源元数据与ACL持久化入口。 */
    private final SourceMapper mapper;
    /** 当前身份与动作判定。 */
    private final IdentityService identity;
    /** 成员归属校验与同事务审计，不读凭证正文。 */
    private final IdentityMapper accounts;
    /** 来源管理动作包含绑定选择所需的同企业系统摘要，不给予源码或知识权。 */
    private final CatalogMapper catalog;

    /**
     * 同一只读快照内授权过滤、分页和计数，避免并发授权时数量与列表语义不一致；不锁企业写事务。
     *
     * @param page 页码，从1起且不超过100000
     *
     * @param keyword 名称包含检索，null按空串，最多80字符
     *
     * @return 每页20项的当前主体可见元数据，不含隐藏数量
     *
     * @throws ApiException 无来源动作403或非法页码/关键词400
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SourcePageVO list(int page, String keyword) {
        AccountDO actor = identity.require(PermissionCodes.SOURCE_READ); List<String> actions = identity.permissions(actor);
        boolean manage = actions.contains(PermissionCodes.SOURCE_READ_ALL), analyze = actions.contains(PermissionCodes.SOURCE_ANALYZE);
        String text = keyword == null ? "" : keyword.trim();
        if (page < 1 || page > 100000 || text.length() > 80) throw new ApiException(400, "INVALID_PAGE", "页码或检索条件不合法");
        return new SourcePageVO(mapper.list(actor.getTenantId(), actor.getId(), manage, analyze, text, (page - 1) * SourceRules.PAGE_SIZE, SourceRules.PAGE_SIZE), page, mapper.count(actor.getTenantId(), actor.getId(), manage, analyze, text));
    }
    /**
     * @param id 来源UUID
     * @return 当前可见来源，不含隐藏关联
     * @throws ApiException 未登录401，隐藏/不存在404；GET无写副作用 */
    public SourceVO get(String id) {
        AccountDO actor = identity.require(PermissionCodes.SOURCE_READ); List<String> actions = identity.permissions(actor);
        SourceVO value = mapper.visible(actor.getTenantId(), id, actor.getId(), actions.contains(PermissionCodes.SOURCE_READ_ALL), actions.contains(PermissionCodes.SOURCE_ANALYZE));
        if (value == null) missing(); return value;
    }
    /**
     * @return 来源绑定选择所需同企业系统摘要，不为空
     * @throws ApiException 缺source.create或source.update时403，不授予系统内容读取 */
    public List<SystemVO> systems() { AccountDO actor = identity.require(PermissionCodes.SOURCE_CREATE, PermissionCodes.SOURCE_UPDATE); return catalog.list(actor.getTenantId(), actor.getId(), true); }
    /**
     * @param id 同企业来源UUID
     * @return 绑定的系统摘要，普通分析者不可读取
     * @throws ApiException 无管理动作403、隐藏目标404 */
    public List<SystemVO> bindings(String id) { AccountDO actor = identity.require(PermissionCodes.SOURCE_CREATE, PermissionCodes.SOURCE_UPDATE); owned(actor, id); return mapper.bindings(actor.getTenantId(), id); }
    /**
     * 登记稳定来源及系统多对多关联，不赋予任何成员分析范围，不探测定位是否可访问。
     *
     * @param input 明确类型、定位、分支、状态及系统ID，不为空
     *
     * @return 新来源元数据，canAnalyze默认false
     *
     * @throws ApiException 无管理动作403、参数400、跨企业绑定404、重复定位409
     */
    @Transactional
    public SourceVO create(SaveSourceDTO input) {
        AccountDO actor = identity.require(PermissionCodes.SOURCE_CREATE);
        SourceDO source = normalize(input, actor.getTenantId()); source.setId(UUID.randomUUID().toString());
        if (input.getRevision() != null && input.getRevision() != 0) conflict();
        validateBindings(actor, input.getSystemIds()); mapper.insert(source); replaceBindings(actor, source.getId(), input.getSystemIds());
        accounts.audit(actor.getTenantId(), actor.getId(), "source.created", source.getId()); return get(source.getId());
    }
    /**
     * 显式整份配置替换；任何实际变化增加版本，使全部旧来源授权失效；相同版本同配置不产生变更。
     *
     * @param id 当前企业来源UUID
     *
     * @param input 最新revision和完整配置，不为空
     *
     * @return 更新后元数据，不为空
     *
     * @throws ApiException 无管理动作403、参数400、隐藏目标404、旧版本/变类型409
     */
    @Transactional
    public SourceVO update(String id, SaveSourceDTO input) {
        AccountDO actor = identity.require(PermissionCodes.SOURCE_UPDATE); SourceDO before = owned(actor, id);
        if (input.getEnabled() != null && input.getEnabled() != before.isEnabled()) identity.require(PermissionCodes.SOURCE_STATUS);
        if (input.getRevision() == null || input.getRevision() != before.getRevision()) conflict();
        SourceDO source = normalize(input, actor.getTenantId()); source.setId(id); source.setRevision(before.getRevision());
        if (!before.getKind().equals(source.getKind())) throw new ApiException(409, "IMMUTABLE_KIND", "来源类型不可修改，请登记新的来源");
        validateBindings(actor, input.getSystemIds());
        Set<String> previous = new HashSet<>(); for (SystemVO system : mapper.bindings(actor.getTenantId(), id)) previous.add(system.getId());
        if (before.getName().equals(source.getName()) && before.getLocator().equals(source.getLocator()) && before.getBranch().equals(source.getBranch()) && before.isEnabled() == source.isEnabled() && previous.equals(new HashSet<>(input.getSystemIds()))) return get(id);
        if (mapper.update(source) != 1) conflict(); replaceBindings(actor, id, input.getSystemIds());
        accounts.audit(actor.getTenantId(), actor.getId(), "source.updated", id); return get(id);
    }
    /**
     * @param id 来源UUID
     * @return 所有成员的当前/过期授权，不为空
     * @throws ApiException 无source.grant403，目标非法404 */
    public List<SourceGrantVO> grants(String id) { AccountDO actor = identity.require(PermissionCodes.SOURCE_GRANT); owned(actor, id); return mapper.grants(actor.getTenantId(), id); }
    /**
     * 按当前配置版本幂等授权或撤销；允许引导管理员显式获得资源范围，不授予角色动作或设备使用权。
     *
     * @param id 当前企业来源UUID
     *
     * @param input 同企业成员和当前来源版本，不为空
     *
     * @param allow true授予，false撤销；停用来源可撤销但不可新增授权
     *
     * @throws ApiException 无管理动作403、参数400、隐藏对象404、版本/停用冲突409
     */
    @Transactional
    public void permission(String id, SourceGrantDTO input, boolean allow) {
        AccountDO actor = identity.require(PermissionCodes.SOURCE_GRANT); SourceDO source = owned(actor, id);
        revision(input.getRevision(), source.getRevision());
        AccountDO member = accounts.findById(input.getMemberId());
        if (member == null || !actor.getTenantId().equals(member.getTenantId())) missing();
        if (allow && (!source.isEnabled() || !member.isEnabled())) throw new ApiException(409, "SOURCE_UNAVAILABLE", "来源或成员已停用，请先处理后重新授权");
        int changed = allow ? mapper.grant(actor.getTenantId(), id, member.getId(), source.getRevision()) : mapper.revoke(actor.getTenantId(), id, member.getId());
        if (changed > 0) accounts.auditPermission(actor.getTenantId(), actor.getId(), allow ? "source.granted" : "source.revoked", id, member.getId());
    }
    /**
     * 核对本次动作、当前配置版本与逐项资源授权；返回不是通行证，未来任务创建和领取仍须重新授权。
     *
     * @param id 来源UUID
     *
     * @param input 显式来源revision，不为空
     *
     * @return 允许本次资格检查的来源与版本，不证明Git/资料/设备可访问
     *
     * @throws ApiException 无分析动作403、隐藏或无当前范围404、版本缺失400或冲突409
     */
    @Transactional
    public SourceCheckVO check(String id, SourceRevisionDTO input) {
        AccountDO actor = identity.require(PermissionCodes.SOURCE_ANALYZE);
        SourceVO value = mapper.visible(actor.getTenantId(), id, actor.getId(), false, true);
        if (value == null) missing(); revision(input.getRevision(), value.getRevision());
        return new SourceCheckVO(id, value.getRevision(), true);
    }
    /**
     * @param input 完整来源输入
     * @param tenantId 可信企业UUID
     * @return 规范化配置，不为空
     * @throws ApiException 参数或定位非法400 */
    private SourceDO normalize(SaveSourceDTO input, String tenantId) {
        if (input.getEnabled() == null) throw new ApiException(400, "INVALID_STATUS", "请明确选择来源状态");
        SourceDO source = new SourceDO(); source.setTenantId(tenantId); source.setName(IdentityService.text(input.getName(), 120, "来源名称")); source.setKind(input.getKind()); source.setEnabled(input.getEnabled());
        if (SourceRules.REPOSITORY.equals(input.getKind())) { source.setLocator(SourceLocatorValidator.repository(input.getLocator())); source.setBranch(SourceLocatorValidator.branch(input.getBranch())); }
        else if (SourceRules.DOCUMENT.equals(input.getKind())) {
            source.setLocator(SourceLocatorValidator.document(input.getLocator())); source.setBranch("");
            if (input.getBranch() != null && !input.getBranch().isEmpty()) throw new ApiException(400, "INVALID_BRANCH", "资料来源不填写Git分支");
        } else throw new ApiException(400, "INVALID_KIND", "请选择仓库或资料来源");
        return source;
    }
    /**
     * @param actor 已核验管理身份
     * @param values 必须显式1至100个不重复系统ID
     * @throws ApiException 缺失/重复400或跨企业/不存在404 */
    private void validateBindings(AccountDO actor, List<String> values) {
        if (values == null || values.isEmpty() || values.size() > 100 || new HashSet<>(values).size() != values.size()) throw new ApiException(400, "INVALID_BINDINGS", "请明确选择1至100个不重复的关联系统");
        for (String id : values) if (id == null || catalog.find(actor.getTenantId(), id, actor.getId(), true) == null) missing();
    }
    /**
     * @param actor 当前管理身份
     * @param id 已验证来源
     * @param values 已验证系统ID数组 */
    private void replaceBindings(AccountDO actor, String id, List<String> values) { mapper.clearBindings(actor.getTenantId(), id); for (String systemId : values) mapper.bind(actor.getTenantId(), id, systemId); }
    /**
     * @param actor 当前管理身份
     * @param id 资源UUID
     * @return 同企业来源，不为空
     * @throws ApiException 隐藏目标404 */
    private SourceDO owned(AccountDO actor, String id) { SourceDO value = mapper.owned(actor.getTenantId(), id); if (value == null) missing(); return value; }
    /**
     * @param input 显式版本，null非法
     * @param current 当前配置版本
     * @throws ApiException 版本缺失400或过期409 */
    private void revision(Integer input, int current) { if (input == null) throw new ApiException(400, "MISSING_REVISION", "请先读取当前来源版本"); if (input != current) conflict(); }
    /** @throws ApiException 固定409，要求刷新后重新确认而非自动覆盖 */
    private void conflict() { throw new ApiException(409, "REVISION_CONFLICT", "来源配置已变化，请刷新后重新确认"); }
    /** @throws ApiException 固定404，不泄漏目标是否存在或授权原因 */
    private void missing() { throw new ApiException(404, "NOT_FOUND", "来源或关联对象不存在或无访问权限"); }
    /**
     * 仅调整来源启停，短事务锁企业，版本CAS与审计原子；实际变化使旧来源授权失效，不删除数据。
     *
     * @param id 当前企业来源UUID
     *
     * @param input 显式enabled和当前revision，不为空
     *
     * @return 新版本元数据，不授予分析范围
     *
     * @throws ApiException 动作403、目标404、参数400、旧版本409
     */
    @Transactional
    public SourceVO status(String id, com.code2knowledge.source.domain.dto.SourceStatusDTO input) {
        AccountDO actor = identity.require(PermissionCodes.SOURCE_STATUS); SourceDO value = owned(actor, id);
        if (input == null || input.getEnabled() == null) throw new ApiException(400, "INVALID_STATUS", "请选择启用或停用");
        revision(input.getRevision(), value.getRevision());
        if (value.isEnabled() != input.getEnabled()) { value.setEnabled(input.getEnabled()); if (mapper.update(value) != 1) conflict(); accounts.audit(actor.getTenantId(), actor.getId(), "source.status_changed", id); }
        return get(id);
    }
}
