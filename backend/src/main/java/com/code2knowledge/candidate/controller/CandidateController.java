package com.code2knowledge.candidate.controller;

import com.code2knowledge.candidate.service.CandidateService;
import com.code2knowledge.candidate.domain.dto.CandidateSourceDTO;
import com.code2knowledge.candidate.domain.vo.CandidateVO;
import com.code2knowledge.candidate.domain.vo.CandidatePageVO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** 私有候选浏览器读取及设备导入；不提供共享/发布，Cookie不能替代设备Bearer。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
public class CandidateController {
    /** 候选应用服务，所有当前来源权限均在服务端验证。 */
    private final CandidateService service;
    /** 只解析有界绑定JSON，不从文件名拼接路径。 */
    private final ObjectMapper json;
    /**
     * @param page 从1开始
     * @return 本人当前授权的候选分页；会话401、无分析资格403、参数400，无副作用 */
    @GetMapping("/api/v1/candidates")
    public CandidatePageVO list(@RequestParam(defaultValue = "1") int page) { return service.list(page); }
    /**
     * @param id 本人候选UUID
     * @return 原包资产清单；会话及全部当前来源权限，无权404，不扩大为企业知识权限
     * @throws Exception 清单读取失败 */
    @GetMapping("/api/v1/candidates/{id}")
    public JsonNode report(@PathVariable String id) throws Exception { return service.report(id); }
    /**
     * @param id 本人候选UUID
     * @param path 清单中资产路径
     * @return UTF8原文封套；Cookie/全部来源权限，GET无需CSRF，无权404/损坏503，响应不执行HTML
     * @throws Exception IO/完整性校验失败 */
    @GetMapping("/api/v1/candidates/{id}/content")
    public com.code2knowledge.candidate.domain.vo.CandidateContentVO content(@PathVariable String id, @RequestParam String path) throws Exception { return service.content(id, path); }
    /**
     * @param id 本人候选UUID
     * @return attachment ZIP；会话及全部当前来源权限，无权404、损坏503，无Cookie写操作不需CSRF
     * @throws Exception 读取失败 */
    @GetMapping("/api/v1/candidates/{id}/archive")
    public ResponseEntity<byte[]> download(@PathVariable String id) throws Exception {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=knowledge-candidate.zip").header("X-Content-Type-Options", "nosniff").contentType(MediaType.APPLICATION_OCTET_STREAM).body(service.download(id));
    }
    /**
     * 设备直接导入，设备Bearer身份无Cookie且不需CSRF；multipart ZIP最大8MiB，绑定JSON最大128KiB，成功201不可变候选。
     *
     * @param authorization 专用设备Bearer，缺失401
     * @param requestId 重试沿用UUID
     * @param bindings 全部Skill仓库到来源UUID/配置版本/commit的显式JSON
     * @param archive 原始ZIP
     *
     * @return 仅元数据；400参数/401设备/403动作/404来源/409幂等/422契约/503工具或存储；写对象、数据库与审计，不执行模型
     *
     * @throws Exception 安全校验或存储失败，数据库回滚
     */
    @PostMapping(value = "/runtime/v1/candidates", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public CandidateVO receive(@RequestHeader(value = "Authorization", required = false) String authorization, @RequestParam String requestId, @RequestParam String bindings, @RequestPart MultipartFile archive) throws Exception {
        if (bindings.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 131072 || archive.getSize() > 8388608) throw new com.code2knowledge.common.exception.ApiException(400, "IMPORT_LIMIT", "导入超过接收限额");
        List<CandidateSourceDTO> values;
        try { values = json.readerFor(json.getTypeFactory().constructCollectionType(List.class, CandidateSourceDTO.class)).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(bindings); }
        catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new com.code2knowledge.common.exception.ApiException(400, "INVALID_IMPORT", "来源映射JSON不合法"); }
        return service.receive(authorization, requestId, values, archive.getBytes());
    }
    /**
     * 当前执行结果接收，不能用普通导入冒充平台运行；设备Bearer、无Cookie/CSRF，固定尝试与全部当前来源再鉴权。
     *
     * @param authorization 设备Bearer，缺失401
     *
     * @param receipt 当前任务/尝试/租约/fence JSON，最大1KiB，不得日志记录
     *
     * @param bindings 全部锁定仓库与资料原始指纹JSON，最大128KiB
     *
     * @param archive 原始知识ZIP，最大8MiB
     *
     * @return 201候选；400参数/401设备/403动作/404来源/409旧尝试/422契约/503存储，候选与任务成功同事务
     *
     * @throws Exception 失败不提交候选，外部IO不持企业锁
     */
    @PostMapping(value = "/runtime/v1/analyses/complete", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public CandidateVO complete(@RequestHeader(value = "Authorization", required = false) String authorization, @RequestParam String receipt, @RequestParam String bindings, @RequestPart MultipartFile archive) throws Exception {
        if (receipt.length() > 1024 || bindings.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 131072 || archive.getSize() > 8388608) throw new com.code2knowledge.common.exception.ApiException(400, "IMPORT_LIMIT", "产物超过接收限额");
        com.code2knowledge.task.domain.dto.ExecutionReceiptDTO identity; List<CandidateSourceDTO> values;
        try {
            identity = json.readerFor(com.code2knowledge.task.domain.dto.ExecutionReceiptDTO.class).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(receipt);
            values = json.readerFor(json.getTypeFactory().constructCollectionType(List.class, CandidateSourceDTO.class)).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(bindings);
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new com.code2knowledge.common.exception.ApiException(400, "INVALID_EXECUTION", "执行回传JSON不合法"); }
        if (identity == null) throw new com.code2knowledge.common.exception.ApiException(400, "INVALID_EXECUTION", "缺少执行尝试凭证");
        return service.receive(authorization, identity.getAttemptId(), values, archive.getBytes(), identity);
    }

}
