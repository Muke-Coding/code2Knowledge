package com.code2knowledge.candidate.service;

import com.code2knowledge.candidate.domain.dto.CandidateSourceDTO;
import com.code2knowledge.candidate.domain.entity.CandidateDO;
import com.code2knowledge.candidate.domain.vo.CandidateVO;
import com.code2knowledge.candidate.domain.vo.CandidatePageVO;
import com.code2knowledge.common.exception.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import java.util.List;
import java.util.UUID;
import java.io.IOException;
import java.security.MessageDigest;

/** 候选非事务协调器；短事务鉴权前后夹住固定校验和对象IO，不在企业锁内等待子进程或S3。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class CandidateService {
    /** 固定资产读取，不持数据库事务。 */
    private final CandidateContentService content;
    /** 独立Spring代理保证短事务边界，不能用本类自调用模拟提交。 */
    private final CandidateAccessService access;
    /** 固定纯契约子进程，不读取凭证、模型或通知配置。 */
    private final SkillValidationService validation;
    /** 不可变对象端口，调用均在数据库事务外。 */
    private final CandidateObjectStore objects;
    /**
     * @param header 设备Bearer
     * @param requestId 幂等UUID
     * @param bindings 全部显式来源
     * @param archive 最大8MiB原包
     * @return 重新授权后提交的私有候选
     * @throws Exception 参数/权限/校验/存储失败，未提交键事务外补偿 */
    public CandidateVO receive(String header, String requestId, List<CandidateSourceDTO> bindings, byte[] archive) throws Exception {
        return receive(header, requestId, bindings, archive, null);
    }
    /**
     * @param header 设备Bearer
     * @param requestId 幂等UUID
     * @param bindings 全部来源
     * @param archive 原始ZIP
     * @param receipt 当前执行租约；普通导入null
     * @return 再鉴权后私有候选，平台执行同事务结算尝试
     * @throws Exception 失败补偿新对象；无企业锁跨外部IO */
    public CandidateVO receive(String header, String requestId, List<CandidateSourceDTO> bindings, byte[] archive, com.code2knowledge.task.domain.dto.ExecutionReceiptDTO receipt) throws Exception {
        if (archive == null || archive.length < 1 || archive.length > 8388608) throw new ApiException(400, "INVALID_IMPORT", "原包超出接收范围");
        String hash = hash(archive); CandidateVO previous = access.prepare(header, requestId, bindings, hash, receipt); if (previous != null) return previous;
        JsonNode report = validation.validate(archive); access.checkSources(report, bindings);
        if (receipt != null) ((com.fasterxml.jackson.databind.node.ObjectNode) report).put("mode", "EXECUTED");
        String tenant = access.tenant(header), id = UUID.randomUUID().toString(); boolean retained = false, existing = false;
        try {
            try { objects.put(tenant, id, archive); } catch (java.nio.file.FileAlreadyExistsException error) { existing = true; throw new ApiException(503, "ARTIFACT_CONFLICT", "候选对象键冲突，请重试"); } catch (IOException error) { throw new ApiException(503, "ARTIFACT_UNAVAILABLE", "候选原包暂不可保存"); }
            CandidateVO result = access.commit(header, requestId, bindings, hash, archive.length, report, id, receipt); retained = id.equals(result.getId()); return result;
        } finally { if (!retained && !existing) { try { objects.discard(tenant, id); } catch (IOException ignored) { /* 无已提交引用的孤立键不可见；强杀和清理失败需运维回收。 */ } } }
    }
    /**
     * @param page 从1开始
     * @return 本人当前全部来源可读分页
     * @throws ApiException 无分析资格403 */
    public CandidatePageVO list(int page) { return access.list(page); }
    /**
     * @param id 候选UUID
     * @return 当前授权的无正文清单
     * @throws IOException 历史清单损坏 */
    public JsonNode report(String id) throws IOException { return access.report(id); }
    /**
     * @param id 候选UUID
     * @return 原包；IO后再次鉴权以拒绝等待期间已撤销权限
     * @throws Exception 当前授权失败或对象不可用503 */
    public byte[] download(String id) throws Exception {
        access.downloadPermission();
        CandidateDO value = access.readable(id); byte[] data;
        try { data = objects.get(value.getTenantId(), id); } catch (IOException error) { throw new ApiException(503, "ARTIFACT_UNAVAILABLE", "候选原包暂不可读取"); }
        access.downloadPermission(); access.readable(id);
        if (!hash(data).equals(value.getArchiveSha256())) throw new ApiException(503, "ARTIFACT_CORRUPT", "候选原包完整性校验失败"); return data;
    }
    /**
     * @param id 本人候选UUID
     * @param path 清单资产相对路径
     * @return 逐资产校验且IO后重新授权的正文
     * @throws Exception 无权404/原包503，不进行HTML执行 */
    public com.code2knowledge.candidate.domain.vo.CandidateContentVO content(String id, String path) throws Exception {
        CandidateDO value = access.readable(id); com.code2knowledge.candidate.domain.vo.CandidateContentVO result = content.read(value, path); access.readable(id); return result;
    }
    /**
     * @param bytes 原包字节
     * @return 小写SHA256
     * @throws Exception JVM缺少标准算法 */
    private String hash(byte[] bytes) throws Exception { byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder result = new StringBuilder(); for (byte item : digest) result.append(String.format("%02x", item & 255)); return result.toString(); }
}
