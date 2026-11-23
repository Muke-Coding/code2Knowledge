package com.code2knowledge.runtime.service;

import com.code2knowledge.runtime.mapper.*;
import com.code2knowledge.runtime.domain.dto.*;
import com.code2knowledge.runtime.domain.vo.*;
import com.code2knowledge.runtime.domain.entity.*;
import com.code2knowledge.task.domain.dto.AnalysisSourceDTO;
import com.code2knowledge.task.domain.vo.AnalysisSourceVO;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.source.mapper.SourceMapper;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.common.exception.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.*;

/** 本人设备短期诊断；企业锁串行创建、领取与回传，不创建任务或证明模型质量，无外部IO、事件及软删除。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class ReadinessService {
    /** 当前用户动作与企业锁。 */
    private final IdentityService identity;
    /** 当前设备所有者角色并集，不从设备凭证推导业务动作。 */
    private final com.code2knowledge.authorization.mapper.AuthorizationMapper authorization;
    /** 设备专用身份认证，不接受浏览器冒充。 */
    private final RuntimeService runtime;
    /** 本人设备锁与撤销状态。 */
    private final RuntimeMapper devices;
    /** 当前逐项分析授权。 */
    private final SourceMapper sources;
    /** 数据库期限与单次状态变更。 */
    private final ReadinessMapper mapper;
    /** 仅序列化固定来源与状态，不存任意诊断文本。 */
    private final ObjectMapper json;

    /**
     * 创建120秒建议性检查，不阻止跳过诊断直接排队。
     *
     * @param input 本人设备、显式资料选择及1至16项来源快照，不为空
     *
     * @return 新检查，不含本机配置
     *
     * @throws ApiException 400参数、403动作、404对象、409来源变化或设备已有检查
     */
    @Transactional
    public ReadinessVO create(ReadinessCreateDTO input) {
        AccountDO actor = identity.require(PermissionCodes.ANALYSIS_CREATE); identity.require(PermissionCodes.SOURCE_ANALYZE);
        if (input == null || input.getSources() == null || input.getSources().isEmpty() || input.getSources().size() > 16 || !("INCLUDE".equals(input.getDocumentsChoice()) || "NONE".equals(input.getDocumentsChoice()))) invalid();
        DeviceDO device = devices.lockOwned(actor.getTenantId(), actor.getId(), input.getDeviceId());
        if (device == null || device.isRevoked() || device.getOwnerVersion() != actor.getAuthVersion() || devices.list(actor.getTenantId(), actor.getId()).stream().noneMatch(value -> value.getId().equals(device.getId()) && !"REVOKED".equals(value.getStatus()))) missing();
        List<AnalysisSourceVO> selected = new ArrayList<>(); Set<String> ids = new HashSet<>(), aliases = new HashSet<>(); int documents = 0;
        for (AnalysisSourceDTO ref : input.getSources()) {
            if (ref == null || ref.getSourceId() == null || !ids.add(ref.getSourceId()) || ref.getAlias() == null || !ref.getAlias().matches("[a-z0-9][a-z0-9_-]{0,79}") || !aliases.add(ref.getAlias())) invalid();
            SourceVO source = sources.visible(actor.getTenantId(), ref.getSourceId(), actor.getId(), false, true);
            if (source == null) missing();
            if (ref.getRevision() == null || ref.getRevision() != source.getRevision()) changed();
            if ("DOCUMENT".equals(source.getKind())) documents++;
            selected.add(new AnalysisSourceVO(source.getId(), source.getRevision(), ref.getAlias(), source.getKind(), source.getBranch(), "DOCUMENT".equals(source.getKind()) ? source.getLocator() : ""));
        }
        if (documents == selected.size() || ("INCLUDE".equals(input.getDocumentsChoice()) ? documents == 0 : documents != 0)) invalid();
        mapper.prune(actor.getTenantId(), actor.getId());
        if (mapper.pending(actor.getTenantId(), device.getId()) != null) throw new ApiException(409, "READINESS_BUSY", "该设备已有检查，请等待完成或过期");
        ReadinessDO row = new ReadinessDO(); row.setId(UUID.randomUUID().toString()); row.setTenantId(actor.getTenantId()); row.setOwnerId(actor.getId()); row.setDeviceId(device.getId()); row.setSourcesJson(encode(selected)); mapper.insert(row);
        return view(mapper.find(actor.getTenantId(), actor.getId(), row.getId()));
    }

    /**
     * 读取本人检查并重新验证所有当前权限，过期结果不再展示通过状态。
     *
     * @param id 检查UUID，不为空
     *
     * @return 当前状态，过期返回EXPIRED且无检查结果
     *
     * @throws ApiException 403动作、404对象或来源撤权、409配置变化
     */
    @Transactional
    public ReadinessVO get(String id) {
        AccountDO actor = identity.require(PermissionCodes.ANALYSIS_CREATE); identity.require(PermissionCodes.SOURCE_ANALYZE);
        ReadinessDO row = mapper.find(actor.getTenantId(), actor.getId(), id); if (row == null) missing();
        DeviceDO device = devices.lockOwned(actor.getTenantId(), actor.getId(), row.getDeviceId()); if (device == null || device.isRevoked() || device.getOwnerVersion() != actor.getAuthVersion() || devices.list(actor.getTenantId(), actor.getId()).stream().noneMatch(value -> value.getId().equals(device.getId()) && !"REVOKED".equals(value.getStatus()))) missing();
        validateSources(row); return view(row);
    }

    /**
     * 空闲设备单次领取；CHECKING不重复领取，响应丢失需到期后新建。
     *
     * @param header 专用设备Bearer，不记录，缺失拒绝
     *
     * @return 空id表示无待检查项，否则固定来源；不下发模型端点或命令
     *
     * @throws ApiException 401设备；当前动作或来源失效时令检查过期并返回空项，存储异常503
     */
    @Transactional
    public ReadinessVO claim(String header) {
        DeviceDO device = runtime.taskDevice(header); ReadinessDO row = mapper.pending(device.getTenantId(), device.getId());
        if (row == null || !"PENDING".equals(row.getState())) return new ReadinessVO("", "PENDING", "", Collections.emptyList(), Collections.emptyList());
        try { requireOwner(device); validateSources(row); }
        catch (ApiException error) { mapper.expire(row.getId()); return new ReadinessVO("", "PENDING", "", Collections.emptyList(), Collections.emptyList()); }
        if (mapper.claim(row.getId()) != 1) changed();
        return view(mapper.find(device.getTenantId(), device.getOwnerId(), row.getId()));
    }

    /**
     * 回传六项固定状态，过期或重复提交拒绝；同一企业锁内再次核验授权与来源版本。
     *
     * @param header 专用设备Bearer，不记录
     *
     * @param id 该设备检查UUID
     *
     * @param input 六个互异固定检查，不接受路径或日志
     *
     * @return 完成状态，不代表模型连接或逆向质量通过
     *
     * @throws ApiException 400状态、401设备、403动作、404对象、409过期或已提交
     */
    @Transactional
    public ReadinessVO complete(String header, String id, ReadinessReportDTO input) {
        DeviceDO device = runtime.taskDevice(header); requireOwner(device);
        ReadinessDO row = mapper.find(device.getTenantId(), device.getOwnerId(), id);
        if (row == null || !device.getId().equals(row.getDeviceId())) missing(); validateSources(row);
        Set<String> codes = new HashSet<>(Arrays.asList("NODE", "GIT", "SKILL", "AGENT", "CREDENTIAL", "MATERIALS"));
        if (input == null || input.getChecks() == null || input.getChecks().size() != 6) invalid();
        for (ReadinessCheckDTO check : input.getChecks()) if (check == null || !codes.remove(check.getCode()) || !Arrays.asList("PASS", "FAIL", "NOT_CHECKED").contains(check.getStatus())) invalid();
        if (mapper.complete(id, encode(input.getChecks())) != 1) changed(); return view(mapper.find(device.getTenantId(), device.getOwnerId(), id));
    }

    /**
     *
     * @param device 已认证设备，所有者仍须有创建与分析动作
     *
     * @throws ApiException 403当前动作撤销；设备身份不提升成员权限
     */
    private void requireOwner(DeviceDO device) {
        // 不建立浏览器会话，直接按所有者当前角色查询；设备认证已锁定企业与有效账户。
        Set<String> permissions = new HashSet<>(authorization.effective(device.getTenantId(), device.getOwnerId()));
        if (!permissions.contains(PermissionCodes.ANALYSIS_CREATE) || !permissions.contains(PermissionCodes.SOURCE_ANALYZE)) throw new ApiException(403, "FORBIDDEN", "设备所有者缺少当前分析权限");
    }

    /**
     * @param row 本人检查
     * @throws ApiException 404来源撤权、409来源版本变化 */
    private void validateSources(ReadinessDO row) {
        for (AnalysisSourceVO ref : selected(row)) {
            SourceVO source = sources.visible(row.getTenantId(), ref.getSourceId(), row.getOwnerId(), false, true);
            if (source == null) missing(); if (source.getRevision() != ref.getRevision()) changed();
        }
    }
    /**
     * @param row 数据库固定JSON
     * @return 已保存来源，无空值
     * @throws ApiException 存储异常503 */
    private List<AnalysisSourceVO> selected(ReadinessDO row) { try { return json.readValue(row.getSourcesJson(), new TypeReference<List<AnalysisSourceVO>>() {}); } catch (Exception error) { throw new ApiException(503, "READINESS_UNAVAILABLE", "检查暂不可用"); } }
    /**
     * @param row 已校验检查
     * @return 不含设备秘密的短期状态
     * @throws ApiException 存储异常503 */
    private ReadinessVO view(ReadinessDO row) { try { return new ReadinessVO(row.getId(), row.isExpired() ? "EXPIRED" : row.getState(), row.getExpiresAt(), selected(row), row.isExpired() ? Collections.emptyList() : json.readValue(row.getChecksJson(), new TypeReference<List<ReadinessCheckVO>>() {})); } catch (ApiException error) { throw error; } catch (Exception error) { throw new ApiException(503, "READINESS_UNAVAILABLE", "检查暂不可用"); } }
    /**
     * @param value 固定服务端契约
     * @return JSON正文
     * @throws ApiException 序列化失败503 */
    private String encode(Object value) { try { return json.writeValueAsString(value); } catch (Exception error) { throw new ApiException(503, "READINESS_UNAVAILABLE", "检查暂不可用"); } }
    /**
     * @throws ApiException 400明确输入不合法 */
    private void invalid() { throw new ApiException(400, "INVALID_READINESS", "请明确资料选择、有效来源与唯一材料标识"); }
    /**
     * @throws ApiException 404隐藏无权对象 */
    private void missing() { throw new ApiException(404, "NOT_FOUND", "检查、设备或来源不存在或无权限"); }
    /**
     * @throws ApiException 409结果过期或来源变化 */
    private void changed() { throw new ApiException(409, "READINESS_CHANGED", "检查过期、已提交或来源已变化，请重新检查"); }
}
