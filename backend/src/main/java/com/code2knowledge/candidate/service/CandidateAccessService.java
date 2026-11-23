package com.code2knowledge.candidate.service;

import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import com.code2knowledge.candidate.mapper.CandidateMapper;
import com.code2knowledge.candidate.domain.entity.CandidateDO;
import com.code2knowledge.candidate.domain.dto.CandidateSourceDTO;
import com.code2knowledge.candidate.domain.vo.CandidateVO;
import com.code2knowledge.candidate.domain.vo.CandidatePageVO;
import com.code2knowledge.runtime.service.RuntimeService;
import com.code2knowledge.runtime.domain.entity.DeviceDO;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.source.mapper.SourceMapper;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.common.exception.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.io.IOException;

/** 候选短事务权限与元数据服务；企业锁仅保护鉴权和落库，禁止在此执行校验器或对象网络IO。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class CandidateAccessService {
    /** 不可变候选与来源映射。 */
    private final CandidateMapper mapper;
    /** 每请求真实用户身份。 */
    private final IdentityService identity;
    /** 设备Bearer认证及企业/账户/设备锁。 */
    private final RuntimeService runtime;
    /** 当前来源配置与逐项授权。 */
    private final SourceMapper sources;
    /** 同事务审计。 */
    private final IdentityMapper accounts;
    /** 固定清单JSON处理。 */
    private final ObjectMapper json;
    /** 逆向租约与全部固定来源门禁，不执行IO。 */
    private final com.code2knowledge.task.service.TaskSourceService taskSources;
    /** 逆向来源定义，用于防止包丢失某个任务来源。 */
    private final com.code2knowledge.task.mapper.AnalysisMapper analyses;
    /** 当前任务状态，候选与成功状态必须同事务提交。 */
    private final com.code2knowledge.task.mapper.TaskMapper tasks;
    /**
     * @param header 设备Bearer
     * @param requestId 幂等UUID
     * @param bindings 完整来源
     * @param hash 原包摘要
     * @return 已有同请求候选，无则null
     * @throws ApiException 身份/范围/幂等失败；仅短事务鉴权，不执行外部IO */
    @Transactional
    public CandidateVO prepare(String header, String requestId, List<CandidateSourceDTO> bindings, String hash) {
        return prepare(header, requestId, bindings, hash, null);
    }
    /**
     * @param header 专用设备Bearer
     * @param requestId 幂等UUID
     * @param bindings 完整来源
     * @param hash 原包摘要
     * @param receipt 执行租约；导入为null
     * @return 同请求原候选或null
     * @throws ApiException 当前动作、所有来源、租约或幂等不符 */
    @Transactional
    public CandidateVO prepare(String header, String requestId, List<CandidateSourceDTO> bindings, String hash, com.code2knowledge.task.domain.dto.ExecutionReceiptDTO receipt) {
        DeviceDO device = runtime.taskDevice(header); AccountDO actor = accounts.findById(device.getOwnerId());
        if (!identity.permissions(actor).contains(receipt == null ? PermissionCodes.CANDIDATE_IMPORT : PermissionCodes.ANALYSIS_CREATE) || !identity.permissions(actor).contains(PermissionCodes.SOURCE_ANALYZE)) throw new ApiException(403, "FORBIDDEN", "没有来源分析资格");
        if (requestId == null || !requestId.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}") || bindings == null || bindings.isEmpty() || bindings.size() > 128) invalid();
        if (receipt != null && !requestId.equals(receipt.getAttemptId())) invalid();
        authorize(actor, bindings); if (receipt != null) execution(device, receipt, bindings); CandidateDO previous = mapper.request(actor.getTenantId(), actor.getId(), requestId);
        if (previous == null) return null;
        if (!Objects.equals(previous.getMode(), receipt == null ? "IMPORTED" : "EXECUTED") || (receipt != null && !Objects.equals(previous.getAttemptId(), receipt.getAttemptId())) || !previous.getArchiveSha256().equals(hash) || !sameSources(mapper.sources(previous.getId()), bindings)) throw new ApiException(409, "IMPORT_CONFLICT", "幂等请求已用于不同原包或来源");
        return view(previous);
    }
    /**
     * @param header 设备Bearer
     * @param requestId 幂等UUID
     * @param bindings 全部来源
     * @param hash 原包摘要
     * @param size 字节数
     * @param report 服务端校验清单
     * @param id 已写入新对象UUID
     * @return 短事务重查后的候选，幂等时可能为既有ID
     * @throws Exception 重新授权或数据库失败，不执行对象IO */
    @Transactional(rollbackFor = Exception.class)
    public CandidateVO commit(String header, String requestId, List<CandidateSourceDTO> bindings, String hash, long size, JsonNode report, String id) throws Exception {
        return commit(header, requestId, bindings, hash, size, report, id, null);
    }
    /**
     * @param header 专用设备Bearer
     * @param requestId 幂等UUID
     * @param bindings 全部来源
     * @param hash 原包摘要
     * @param size 字节数
     * @param report 服务端清单
     * @param id 本次新对象UUID
     * @param receipt 执行租约，导入null
     * @return 原子登记候选及可选任务成功；无对象IO
     * @throws Exception 当前授权/租约/幂等/数据库失败整体回滚 */
    @Transactional(rollbackFor = Exception.class)
    public CandidateVO commit(String header, String requestId, List<CandidateSourceDTO> bindings, String hash, long size, JsonNode report, String id, com.code2knowledge.task.domain.dto.ExecutionReceiptDTO receipt) throws Exception {
        CandidateVO previous = prepare(header, requestId, bindings, hash, receipt); if (previous != null) return previous;
        DeviceDO device = runtime.taskDevice(header); AccountDO actor = accounts.findById(device.getOwnerId());
        CandidateDO value = new CandidateDO(); value.setId(id); value.setTenantId(actor.getTenantId()); value.setOwnerId(actor.getId()); value.setDeviceId(device.getId()); value.setRequestId(requestId); value.setDigest(report.path("digest").asText()); value.setArchiveSha256(hash); value.setArchiveBytes(size); value.setReport(json.writeValueAsString(report));
        if (receipt != null) {
            com.code2knowledge.task.domain.entity.AnalysisSpecDO spec = analyses.spec(receipt.getTaskId());
            for (JsonNode asset : report.path("assets")) { JsonNode meta = asset.path("meta"); if (meta.has("sources") && (!spec.getProduct().equals(meta.path("product").asText()) || !spec.getDomain().equals(meta.path("domain").asText()))) throw new ApiException(422, "SCOPE_MISMATCH", "产物业务域不匹配固定任务"); }
        }
        value.setMode(receipt == null ? "IMPORTED" : "EXECUTED");
        if (receipt != null) { value.setTaskId(receipt.getTaskId()); value.setAttemptId(receipt.getAttemptId()); }
        mapper.insert(value); for (CandidateSourceDTO binding : bindings) mapper.source(id, actor.getTenantId(), binding);
        if (receipt != null) {
            com.code2knowledge.task.domain.entity.TaskDO task = taskSources.execution(device, receipt);
            String commit = bindings.stream().filter(item -> "code".equals(item.getKind())).findFirst().get().getCommit();
            if (tasks.finish(task.getAttemptId(), "SUCCEEDED", "逆向候选已接收；业务待审核，未发布", commit, hash, report.path("assets").size(), size) != 1) throw new ApiException(409, "EXECUTION_REJECTED", "逆向租约已失效");
        }
        accounts.audit(actor.getTenantId(), actor.getId(), receipt == null ? "candidate.imported" : "candidate.executed", id); return view(mapper.get(actor.getTenantId(), actor.getId(), id));
    }
    /**
     * @param header 设备Bearer
     * @return 已认证企业ID，短事务结束后才由协调器访问对象存储 */
    @Transactional
    public String tenant(String header) { return runtime.taskDevice(header).getTenantId(); }
    /**
     * @param page 从1开始
     * @return 当前全部来源可读的本人分页
     * @throws ApiException 身份401/无动作403/页码400 */
    @Transactional
    public CandidatePageVO list(int page) {
        AccountDO actor = identity.require(PermissionCodes.CANDIDATE_READ); identity.require(PermissionCodes.SOURCE_ANALYZE); if (page < 1 || page > 100000) invalid();
        List<CandidateVO> values = new ArrayList<>(); for (CandidateDO item : mapper.list(actor.getTenantId(), actor.getId(), (page - 1) * 20)) values.add(view(item));
        return new CandidatePageVO(values, page, mapper.count(actor.getTenantId(), actor.getId()));
    }
    /**
     * @param id 候选UUID
     * @return 有限校验清单与原始元数据，不返回隐藏来源
     * @throws ApiException 越权统一404
     * @throws IOException 清单损坏 */
    @Transactional
    public JsonNode report(String id) throws IOException { CandidateDO value = readable(id); return json.readTree(value.getReport()); }
    /**
     * @param id 候选UUID
     * @return 当前仍可读的本人实体引用；短事务退出后才读取对象
     * @throws ApiException 无权或不存在404 */
    @Transactional
    public CandidateDO readable(String id) { AccountDO actor = identity.require(PermissionCodes.CANDIDATE_READ); identity.require(PermissionCodes.SOURCE_ANALYZE); CandidateDO value = mapper.get(actor.getTenantId(), actor.getId(), id); if (value == null) missing(); authorize(actor, mapper.sources(id)); return value; }
    /**
     * @param actor 锁后当前主体
     * @param bindings 所有来源映射，不为空
     * @throws ApiException 任一范围/版本不符404 */
    private void authorize(AccountDO actor, List<CandidateSourceDTO> bindings) {
        Set<String> names = new HashSet<>(), codeIds = new HashSet<>(); Map<String, String> revisions = new HashMap<>();
        for (CandidateSourceDTO binding : bindings) {
            if (binding == null || binding.getRepository() == null || !binding.getRepository().matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,199}") || binding.getCommit() == null || binding.getKind() == null || binding.getPath() == null || !names.add(binding.getKind() + ":" + binding.getRepository())) invalid();
            boolean code = "code".equals(binding.getKind());
            if (!(code || "document".equals(binding.getKind())) || (code ? !binding.getCommit().matches("(?:[a-f0-9]{40}|[a-f0-9]{64})") || !binding.getPath().isEmpty() || !codeIds.add(binding.getSourceId()) : !binding.getCommit().matches("[a-f0-9]{64}") || !relative(binding.getPath()))) invalid();
            String version = binding.getRevision() + ":" + binding.getKind(); String old = revisions.put(binding.getSourceId(), version); if (old != null && !old.equals(version)) invalid();
            SourceVO source = sources.visible(actor.getTenantId(), binding.getSourceId(), actor.getId(), false, true);
            if (source == null || !(code ? "REPOSITORY" : "DOCUMENT").equals(source.getKind()) || binding.getRevision() == null || binding.getRevision() != source.getRevision()) missing();
        }
    }
    /**
     * @param path 原资料根内路径
     * @return 是否有界且无路径穿越；不将其作为平台本机文件路径 */
    private boolean relative(String path) { if (path == null || path.isEmpty() || path.length() > 512 || path.startsWith("/") || path.contains("\\") || path.matches(".*[\\x00-\\x1f].*")) return false; for (String part : path.split("/", -1)) if (part.isEmpty() || part.equals(".") || part.equals("..")) return false; return true; }
    /**
     * @param device 锁后设备
     * @param receipt 当前租约
     * @param bindings 所有材料绑定
     * @throws ApiException 包未覆盖全部任务来源或别名不符422/租约失效409 */
    private void execution(DeviceDO device, com.code2knowledge.task.domain.dto.ExecutionReceiptDTO receipt, List<CandidateSourceDTO> bindings) {
        taskSources.execution(device, receipt); Set<String> expected = new HashSet<>(), actual = new HashSet<>();
        for (com.code2knowledge.task.domain.vo.AnalysisSourceVO source : analyses.sources(receipt.getTaskId())) {
            expected.add(source.getSourceId()); boolean found = false;
            for (CandidateSourceDTO binding : bindings) if (source.getSourceId().equals(binding.getSourceId())) {
                if (source.getRevision() != binding.getRevision() || !("REPOSITORY".equals(source.getKind()) ? "code".equals(binding.getKind()) && source.getAlias().equals(binding.getRepository()) : "document".equals(binding.getKind()) && binding.getRepository().startsWith(source.getAlias() + "-") && (binding.getPath().equals(source.getLocator()) || binding.getPath().startsWith(source.getLocator() + "/")))) throw new ApiException(422, "SOURCE_MISMATCH", "产物未对应固定任务来源"); found = true; actual.add(binding.getSourceId());
            }
            if (!found) throw new ApiException(422, "SOURCE_MISMATCH", "产物缺少任务来源");
        }
        if (!expected.equals(actual) || bindings.stream().anyMatch(value -> !expected.contains(value.getSourceId()))) throw new ApiException(422, "SOURCE_MISMATCH", "产物存在任务外来源");
    }
    /**
     * @param report 服务端重新解析清单
     * @param bindings 显式映射
     * @throws ApiException 包内任意资料/仓库未完整覆盖则422 */
    public void checkSources(JsonNode report, List<CandidateSourceDTO> bindings) {
        Map<String, String> expected = new TreeMap<>(); for (CandidateSourceDTO source : bindings) expected.put(source.getKind() + ":" + source.getRepository(), source.getCommit() + ":" + source.getPath());
        boolean found = false;
        for (JsonNode asset : report.path("assets")) {
            JsonNode meta = asset.path("meta"); if (!meta.has("sources")) continue; Map<String, String> actual = new TreeMap<>();
            for (JsonNode source : meta.path("sources")) {
                String key, version;
                if ("code".equals(source.path("kind").asText()) && "clean".equals(source.path("worktree_status").asText())) { key = "code:" + source.path("repository").asText(); version = source.path("commit").asText() + ":"; }
                else if ("document".equals(source.path("kind").asText())) { key = "document:" + source.path("document_id").asText(); version = source.path("sha256").asText() + ":" + source.path("path").asText(); }
                else { invalid(); return; }
                if (actual.put(key, version) != null) invalid();
            }
            if (!actual.equals(expected)) throw new ApiException(422, "SOURCE_MISMATCH", "包内全部来源必须与当前逐项授权映射一致"); found = true;
        }
        if (!found) invalid();
    }
    /**
     * @param left 历史绑定
     * @param right 新绑定
     * @return 顺序无关的完整来源配置是否相同 */
    private boolean sameSources(List<CandidateSourceDTO> left, List<CandidateSourceDTO> right) { if (left.size() != right.size()) return false; Map<String, String> values = new HashMap<>(); for (CandidateSourceDTO item : left) values.put(item.getKind() + ":" + item.getRepository(), item.getSourceId() + ":" + item.getRevision() + ":" + item.getCommit() + ":" + item.getPath()); for (CandidateSourceDTO item : right) if (!Objects.equals(values.get(item.getKind() + ":" + item.getRepository()), item.getSourceId() + ":" + item.getRevision() + ":" + item.getCommit() + ":" + item.getPath())) return false; return true; }
    /**
     * @param value 内部不可变候选
     * @return 不含对象键与租户/所有者的元数据 */
    private CandidateVO view(CandidateDO value) { return new CandidateVO(value.getId(), value.getDigest(), value.getArchiveBytes(), value.getCreatedAt(), value.getMode()); }
    /** @throws ApiException 固定400，无原始请求回显 */
    private void invalid() { throw new ApiException(400, "INVALID_IMPORT", "导入参数不合法；只接收全部来源当前已授权且具有明确版本的知识包"); }
    /** @throws ApiException 隐藏对象404 */
    private void missing() { throw new ApiException(404, "NOT_FOUND", "候选或来源不存在，或当前无权读取"); }
    /** 读取前后均校验下载动作；不替代候选所有权与来源权限。 @throws ApiException 无动作403 */
    public void downloadPermission() { identity.require(PermissionCodes.CANDIDATE_DOWNLOAD); }
}
